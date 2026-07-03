const fs = require('fs');
const path = require('path');
const https = require('https');
const llamaServerService = require('./llama-server-service');

const MODEL_INFO = {
    name: 'Qwen2.5-1.5B-Instruct',
    quant: 'Q4_K_M',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: 1117320736,
    sha256: ''
};

let downloadProgress = 0;
let downloadStatus = 'idle';

function getProjectModelsDirectory() {
    return llamaServerService.getProjectModelsDirectory();
}

function getModelsDirectory(basePath) {
    const modelsDir = path.join(basePath, 'models');
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
    }
    return modelsDir;
}

function getModelPath(basePath) {
    const projectModelPath = path.join(getProjectModelsDirectory(), MODEL_INFO.fileName);
    if (fs.existsSync(projectModelPath)) {
        return projectModelPath;
    }
    return path.join(getModelsDirectory(basePath), MODEL_INFO.fileName);
}

async function downloadModel(basePath, onProgress) {
    return new Promise((resolve, reject) => {
        const modelPath = getModelPath(basePath);
        
        if (fs.existsSync(modelPath)) {
            const stats = fs.statSync(modelPath);
            if (stats.size === MODEL_INFO.size) {
                console.log('[本地模型] 模型文件已存在且完整');
                downloadStatus = 'completed';
                downloadProgress = 100;
                if (onProgress) onProgress(100, '模型已存在');
                return resolve(modelPath);
            }
            console.log('[本地模型] 模型文件存在但不完整，重新下载');
            fs.unlinkSync(modelPath);
        }

        downloadStatus = 'downloading';
        downloadProgress = 0;

        const file = fs.createWriteStream(modelPath);
        let downloadedBytes = 0;

        const req = https.get(MODEL_INFO.url, { rejectUnauthorized: false }, (res) => {
            const totalBytes = parseInt(res.headers['content-length']) || MODEL_INFO.size;
            
            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                downloadProgress = Math.round((downloadedBytes / totalBytes) * 100);
                if (onProgress) {
                    onProgress(downloadProgress, `正在下载: ${(downloadedBytes / 1024 / 1024).toFixed(2)}MB / ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
                }
            });

            res.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    const stats = fs.statSync(modelPath);
                    if (stats.size !== MODEL_INFO.size && totalBytes !== MODEL_INFO.size) {
                        downloadStatus = 'error';
                        fs.unlinkSync(modelPath);
                        return reject(new Error('模型下载不完整'));
                    }
                    downloadStatus = 'completed';
                    downloadProgress = 100;
                    if (onProgress) onProgress(100, '下载完成');
                    resolve(modelPath);
                });
            });
        });

        req.on('error', (err) => {
            downloadStatus = 'error';
            file.destroy();
            if (fs.existsSync(modelPath)) {
                fs.unlinkSync(modelPath);
            }
            reject(err);
        });
    });
}

async function loadModel(basePath) {
    const modelStatus = llamaServerService.getModelStatus();
    if (modelStatus.isLoaded) {
        return { success: true, status: 'loaded' };
    }

    const modelPath = getModelPath(basePath);
    if (!fs.existsSync(modelPath)) {
        return { success: false, error: '模型文件不存在，请先下载' };
    }

    const serverPath = llamaServerService.getServerPath();
    if (!fs.existsSync(serverPath)) {
        return { success: false, error: 'llama-server.exe 不存在，请检查 bin 目录' };
    }

    return await llamaServerService.loadModel(modelPath);
}

function unloadModel() {
    llamaServerService.unloadModel();
}

async function callLocalModel(prompt, maxTokens = 500) {
    return await llamaServerService.callModel(prompt, maxTokens);
}

async function callLocalModelStream(prompt, onChunk, maxTokens = 2000, signal = null) {
    return await llamaServerService.callModelStream(prompt, onChunk, maxTokens, signal);
}

function getDownloadStatus() {
    return {
        status: downloadStatus,
        progress: downloadProgress,
        modelName: MODEL_INFO.name,
        quant: MODEL_INFO.quant,
        sizeMB: (MODEL_INFO.size / 1024 / 1024).toFixed(2)
    };
}

function getModelStatus() {
    const serverStatus = llamaServerService.getModelStatus();
    return {
        loadStatus: serverStatus.loadStatus,
        isLoaded: serverStatus.isLoaded,
        modelName: MODEL_INFO.name,
        isServerRunning: serverStatus.isServerRunning
    };
}

function isModelDownloaded(basePath) {
    const modelPath = getModelPath(basePath);
    if (!fs.existsSync(modelPath)) {
        return false;
    }
    const stats = fs.statSync(modelPath);
    return stats.size >= MODEL_INFO.size * 0.99;
}

function deleteModel(basePath) {
    const modelPath = getModelPath(basePath);
    if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
        downloadStatus = 'idle';
        downloadProgress = 0;
        return true;
    }
    return false;
}

module.exports = {
    MODEL_INFO,
    downloadModel,
    loadModel,
    unloadModel,
    callLocalModel,
    callLocalModelStream,
    getDownloadStatus,
    getModelStatus,
    isModelDownloaded,
    deleteModel,
    getModelPath
};