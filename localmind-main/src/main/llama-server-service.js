const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { app } = require('electron');

let serverProcess = null;
let serverRunning = false;
let modelLoaded = false;
let modelName = '';
const SERVER_PORT = 8080;

// 生产环境（asar 打包后）bin 和 models 目录通过 electron-builder 的 extraResources
// 打包到 process.resourcesPath 下；开发环境则从项目根目录定位。
function getProjectModelsDirectory() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'models');
    }
    const projectDir = path.dirname(path.dirname(__dirname));
    return path.join(projectDir, 'models');
}

function getServerPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin', 'llama-server.exe');
    }
    const projectDir = path.dirname(path.dirname(__dirname));
    return path.join(projectDir, 'bin', 'llama-server.exe');
}

async function isServerRunning() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: SERVER_PORT,
            path: '/completion',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength('{}')
            },
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            resolve(res.statusCode !== 404);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.write('{}');
        req.end();
    });
}

async function startServer(modelPath) {
    if (serverRunning) {
        return { success: true, message: '服务已在运行' };
    }

    return new Promise((resolve) => {
        const serverExe = getServerPath();
        if (!fs.existsSync(serverExe)) {
            resolve({ success: false, error: 'llama-server.exe 不存在，请检查 bin 目录' });
            return;
        }

        const args = [
            '-m', modelPath,
            '--port', SERVER_PORT.toString(),
            '-c', '8192',
            '-t', '4',
            '--host', '127.0.0.1',
            '-ngl', '0',
            '--chat-template', 'chatml'
        ];

        console.log(`[llama-server] 启动命令: ${serverExe} ${args.join(' ')}`);

        serverProcess = spawn(serverExe, args, {
            cwd: path.dirname(serverExe),
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true
        });

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[llama-server stdout] ${output.trim()}`);
            
            if (output.includes('HTTP server listening') || output.includes('ready')) {
                serverRunning = true;
                modelLoaded = true;
                modelName = path.basename(modelPath, '.gguf');
                console.log(`[llama-server] 服务启动成功，端口: ${SERVER_PORT}`);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.log(`[llama-server stderr] ${output.trim()}`);
        });

        serverProcess.on('error', (error) => {
            console.error('[llama-server] 启动失败:', error.message);
            serverRunning = false;
            resolve({ success: false, error: `启动失败: ${error.message}` });
        });

        serverProcess.on('exit', (code, signal) => {
            console.log(`[llama-server] 进程退出，代码: ${code}，信号: ${signal}`);
            serverRunning = false;
            modelLoaded = false;
        });

        let checkCount = 0;
        const checkInterval = setInterval(async () => {
            checkCount++;
            const running = await isServerRunning();
            
            if (running) {
                clearInterval(checkInterval);
                serverRunning = true;
                modelLoaded = true;
                modelName = path.basename(modelPath, '.gguf');
                resolve({ success: true, message: 'llama-server 服务启动成功' });
            } else if (checkCount > 30) {
                clearInterval(checkInterval);
                serverProcess?.kill();
                resolve({ success: false, error: '服务启动超时，请检查模型文件是否正确' });
            }
        }, 1000);
    });
}

async function ensureServerRunning(modelPath) {
    const running = await isServerRunning();
    if (!running) {
        return await startServer(modelPath);
    }
    return { success: true, message: '服务已在运行' };
}

async function loadModel(modelPath) {
    if (!fs.existsSync(modelPath)) {
        return { success: false, error: '模型文件不存在' };
    }

    const result = await ensureServerRunning(modelPath);
    
    if (result.success) {
        modelLoaded = true;
        modelName = path.basename(modelPath, '.gguf');
    }
    
    return result;
}

function buildChatMLPrompt(prompt) {
    // 中文 system 指令：1.5B 小模型对英文指令遵循能力弱
    // 注意：system 中不能出现"LocalMind 知识助手"这种品牌词，否则 1.5B 会把它当成文档标题写进"## 引用来源"
    // 强调引用必须严格匹配清单中真实存在的标题
    return `<|im_start|>system\n你是知识助手，擅长基于参考文档回答问题。"## 引用来源"段必须严格按"参考文档清单"中真实存在的标题填写，不要把本句中的"知识助手"或任何其他无关文字当成文档标题，严禁编造不存在的文档。<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;
}

async function callModel(prompt, maxTokens = 500) {
    if (!modelLoaded || !modelName) {
        throw new Error('本地模型未加载');
    }

    const chatMLPrompt = buildChatMLPrompt(prompt);

    const body = JSON.stringify({
        prompt: chatMLPrompt,
        n_predict: maxTokens,
        // temperature 从 0.7 降到 0.3，提升 1.5B 模型的指令遵循能力
        temperature: 0.3,
        stop: ['</s>', '<|im_end|>']
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: SERVER_PORT,
            path: '/completion',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 60000 * 5
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response.content?.trim() || '');
                } catch (error) {
                    reject(new Error(`解析响应错误: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`调用 llama-server 失败: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('调用 llama-server 超时'));
        });

        req.write(body);
        req.end();
    });
}

async function callModelStream(prompt, onChunk, maxTokens = 2000, signal = null) {
    if (!modelLoaded || !modelName) {
        throw new Error('本地模型未加载');
    }

    const chatMLPrompt = buildChatMLPrompt(prompt);

    const body = JSON.stringify({
        prompt: chatMLPrompt,
        n_predict: maxTokens,
        // temperature 从 0.7 降到 0.3，提升 1.5B 模型的指令遵循能力
        temperature: 0.3,
        stop: ['</s>', '<|im_end|>'],
        stream: true
    });

    return new Promise((resolve, reject) => {
        // AbortSignal 支持：若调用方传入的信号已中止，立即拒绝，避免无谓的请求
        if (signal && signal.aborted) {
            reject(new Error('调用已被中止'));
            return;
        }

        const options = {
            hostname: 'localhost',
            port: SERVER_PORT,
            path: '/completion',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 60000 * 5
        };

        // fullContent 仅在服务端内部累积，用于最终 resolve 返回完整文本；onChunk 不应传递它
        let fullContent = '';
        // SSE 跨 TCP 数据块行缓冲：当一行 data: 被切到两个 chunk 时，前半段暂存到 lineBuffer，下个 chunk 拼接后再处理
        let lineBuffer = '';

        const req = http.request(options, (res) => {
            res.on('data', (chunk) => {
                // 将上一次未处理完的残余行与新数据拼接，再按 \n 切分
                const combined = lineBuffer + chunk.toString();
                const lines = combined.split('\n');
                // 最后一段若不以 \n 结尾（被截断到下个 chunk），暂存到 lineBuffer；否则置空
                if (!combined.endsWith('\n')) {
                    lineBuffer = lines.pop();
                } else {
                    lineBuffer = '';
                }
                for (const line of lines) {
                    if (!line.trim()) continue;
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        try {
                            const response = JSON.parse(dataStr);
                            if (response.content) {
                                fullContent += response.content;
                                // 契约：onChunk 只传递本次的增量 delta（response.content），不传累积文本 fullContent
                                // 否则下游 IPC handler 再做一次 accumulated += chunk 会造成 "AABABC" 重复 bug
                                onChunk(response.content);
                            }
                            if (response.stop) {
                                break;
                            }
                        } catch (error) {
                            console.warn('[llama-server] 解析流式数据失败:', error.message);
                        }
                    }
                }
            });

            res.on('end', () => {
                // flush 残留缓冲：若最后一块数据没有以 \n 结尾，仍需尝试解析 lineBuffer 中的完整 data: 行
                if (lineBuffer) {
                    const line = lineBuffer;
                    lineBuffer = '';
                    if (line.trim() && line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        try {
                            const response = JSON.parse(dataStr);
                            if (response.content) {
                                fullContent += response.content;
                                onChunk(response.content);
                            }
                        } catch (error) {
                            console.warn('[llama-server] 解析残留行失败:', error.message);
                        }
                    }
                }
                resolve(fullContent);
            });
        });

        // AbortSignal 支持：信号触发时销毁请求，触发下面的 'error' 事件
        if (signal) {
            signal.addEventListener('abort', () => {
                req.destroy();
            });
        }

        req.on('error', (error) => {
            // 若错误由 abort 触发，返回已累积的部分内容，避免前端崩溃
            if (signal && signal.aborted) {
                resolve(fullContent);
                return;
            }
            reject(new Error(`调用 llama-server 失败: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('调用 llama-server 超时'));
        });

        req.write(body);
        req.end();
    });
}

function unloadModel() {
    if (serverProcess) {
        try {
            process.kill(-serverProcess.pid);
        } catch (error) {
            console.warn('[llama-server] 终止进程失败:', error.message);
        }
        serverProcess = null;
    }
    modelLoaded = false;
    modelName = '';
    serverRunning = false;
    console.log('[llama-server] 模型已卸载');
}

function getModelStatus() {
    return {
        loadStatus: modelLoaded ? 'loaded' : 'unloaded',
        isLoaded: modelLoaded,
        modelName: modelName,
        isServerRunning: serverRunning
    };
}

module.exports = {
    loadModel,
    callModel,
    callModelStream,
    unloadModel,
    getModelStatus,
    isServerRunning,
    getProjectModelsDirectory,
    getServerPath
};