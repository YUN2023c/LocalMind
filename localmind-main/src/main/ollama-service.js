const fs = require('fs');
const path = require('path');
const { exec, execFile, spawn } = require('child_process');
const http = require('http');
const { app } = require('electron');

let ollamaProcess = null;
let isOllamaRunning = false;
let modelLoaded = false;
let modelName = '';

// 生产环境（asar 打包后）models 目录通过 electron-builder 的 extraResources
// 打包到 process.resourcesPath 下；开发环境则从项目根目录定位。
function getProjectModelsDirectory() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'models');
    }
    const projectDir = path.dirname(path.dirname(__dirname));
    return path.join(projectDir, 'models');
}

async function isOllamaInstalled() {
    return new Promise((resolve) => {
        execFile('ollama', ['--version'], (error, stdout, stderr) => {
            if (error) {
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
}

async function startOllamaService() {
    if (isOllamaRunning) {
        return { success: true, message: 'ollama 服务已在运行' };
    }

    return new Promise((resolve) => {
        const checkOllamaServer = () => {
            const options = {
                hostname: 'localhost',
                port: 11434,
                path: '/api/tags',
                method: 'GET',
                timeout: 2000
            };

            const req = http.request(options, (res) => {
                isOllamaRunning = true;
                resolve({ success: true, message: 'ollama 服务已启动' });
            });

            req.on('error', () => {
                resolve({ success: false, error: '无法连接到 ollama 服务，请确保 ollama 已正确安装并启动' });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: 'ollama 服务连接超时' });
            });

            req.end();
        };

        checkOllamaServer();
    });
}

async function ensureOllamaRunning() {
    const running = await startOllamaService();
    if (!running.success) {
        throw new Error(running.error);
    }
    return running;
}

async function createOllamaModelFile(modelPath, modelName) {
    const modelfileContent = `FROM ${modelPath}`;
    const modelfileDir = path.join(getProjectModelsDirectory(), 'modelfiles');
    
    if (!fs.existsSync(modelfileDir)) {
        fs.mkdirSync(modelfileDir, { recursive: true });
    }
    
    const modelfilePath = path.join(modelfileDir, 'Modelfile');
    fs.writeFileSync(modelfilePath, modelfileContent);
    
    return modelfilePath;
}

async function loadModel(modelPath) {
    if (modelLoaded) {
        return { success: true, status: 'loaded', modelName: modelName };
    }

    if (!fs.existsSync(modelPath)) {
        return { success: false, error: '模型文件不存在' };
    }

    await ensureOllamaRunning();

    modelName = path.basename(modelPath, '.gguf');
    
    try {
        const exists = await checkModelExists(modelName);
        if (exists) {
            modelLoaded = true;
            console.log(`[ollama] 模型 ${modelName} 已存在，直接加载`);
            return { success: true, status: 'loaded', modelName: modelName };
        }

        console.log(`[ollama] 正在创建模型 ${modelName}...`);
        const modelfilePath = await createOllamaModelFile(modelPath, modelName);
        
        await new Promise((resolve, reject) => {
            const cmd = `ollama create ${modelName} -f "${modelfilePath}"`;
            exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('[ollama] 创建模型失败:', error.message);
                    console.error('[ollama] 错误详情:', stderr);
                    reject(new Error(`创建模型失败: ${error.message}`));
                    return;
                }
                console.log('[ollama] 创建模型成功:', stdout);
                modelLoaded = true;
                resolve();
            });
        });

        return { success: true, status: 'loaded', modelName: modelName };
    } catch (error) {
        console.error('[ollama] 加载模型失败:', error.message);
        return { success: false, error: error.message };
    }
}

async function checkModelExists(modelName) {
    return new Promise((resolve) => {
        exec('ollama list', (error, stdout, stderr) => {
            if (error) {
                resolve(false);
                return;
            }
            resolve(stdout.includes(modelName));
        });
    });
}

async function callModel(prompt, maxTokens = 500) {
    if (!modelLoaded || !modelName) {
        throw new Error('本地模型未加载');
    }

    await ensureOllamaRunning();

    const body = JSON.stringify({
        model: modelName,
        prompt: prompt,
        options: {
            num_ctx: 2048,
            num_thread: 4,
            num_predict: maxTokens,
            temperature: 0.7
        }
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/generate',
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
                    resolve(response.response || '');
                } catch (error) {
                    reject(new Error(`解析响应错误: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`调用 ollama 失败: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('调用 ollama 超时'));
        });

        req.write(body);
        req.end();
    });
}

async function callModelStream(prompt, onChunk, maxTokens = 2000) {
    if (!modelLoaded || !modelName) {
        throw new Error('本地模型未加载');
    }

    await ensureOllamaRunning();

    const body = JSON.stringify({
        model: modelName,
        prompt: prompt,
        stream: true,
        options: {
            num_ctx: 2048,
            num_thread: 4,
            num_predict: maxTokens,
            temperature: 0.7
        }
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 60000 * 5
        };

        let fullContent = '';

        const req = http.request(options, (res) => {
            res.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const response = JSON.parse(line);
                        if (response.response) {
                            fullContent += response.response;
                            onChunk(fullContent);
                        }
                        if (response.done) {
                            break;
                        }
                    } catch (error) {
                        console.warn('[ollama] 解析流式数据失败:', error.message);
                    }
                }
            });

            res.on('end', () => {
                resolve(fullContent);
            });
        });

        req.on('error', (error) => {
            reject(new Error(`调用 ollama 失败: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('调用 ollama 超时'));
        });

        req.write(body);
        req.end();
    });
}

function unloadModel() {
    modelLoaded = false;
    modelName = '';
    console.log('[ollama] 模型已卸载');
}

function getModelStatus() {
    return {
        loadStatus: modelLoaded ? 'loaded' : 'unloaded',
        isLoaded: modelLoaded,
        modelName: modelName,
        isOllamaRunning: isOllamaRunning
    };
}

module.exports = {
    isOllamaInstalled,
    startOllamaService,
    ensureOllamaRunning,
    loadModel,
    callModel,
    callModelStream,
    unloadModel,
    getModelStatus,
    getProjectModelsDirectory
};