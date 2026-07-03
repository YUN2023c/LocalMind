const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

const LLAMA_SERVER_URL = 'https://github.com/ggml-org/llama.cpp/releases/download/v0.2.116/llama-server-win-x64.zip';
const BIN_DIR = path.join(__dirname, 'bin');
const ZIP_FILE = path.join(BIN_DIR, 'llama-server.zip');
const EXTRACTED_DIR = path.join(BIN_DIR, 'llama-server');

function ensureBinDir() {
    if (!fs.existsSync(BIN_DIR)) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
    }
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        
        const request = https.get(url, { rejectUnauthorized: false, followRedirect: true, maxRedirects: 5 }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const redirectUrl = res.headers.location;
                console.log(`重定向到: ${redirectUrl}`);
                file.destroy();
                downloadFile(redirectUrl, dest).then(resolve).catch(reject);
                return;
            }
            
            const totalBytes = parseInt(res.headers['content-length']);
            let downloadedBytes = 0;
            
            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const progress = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '?';
                const totalMB = totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) : '?';
                process.stdout.write(`\r下载中: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(2)}MB / ${totalMB}MB)`);
            });
            
            res.pipe(file);
            
            file.on('finish', () => {
                file.close(() => {
                    console.log('\n下载完成');
                    resolve();
                });
            });
            
            file.on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        });
        
        request.on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
        
        request.end();
    });
}

function extractZip(zipPath, destPath) {
    return new Promise((resolve, reject) => {
        const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            console.log('解压完成');
            resolve();
        });
    });
}

function moveFiles(sourceDir, destDir) {
    return new Promise((resolve) => {
        const files = fs.readdirSync(sourceDir);
        
        files.forEach(file => {
            const sourcePath = path.join(sourceDir, file);
            const destPath = path.join(destDir, file);
            
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
            
            fs.renameSync(sourcePath, destPath);
            console.log(`移动文件: ${file}`);
        });
        
        fs.rmdirSync(sourceDir);
        console.log('清理临时目录');
        resolve();
    });
}

async function main() {
    try {
        console.log('=== 下载 llama-server 预编译二进制 ===');
        ensureBinDir();
        
        const targetExe = path.join(BIN_DIR, 'llama-server.exe');
        if (fs.existsSync(targetExe)) {
            const stats = fs.statSync(targetExe);
            if (stats.size > 1000000) {
                console.log('llama-server.exe 已存在且完整，跳过下载');
                return;
            }
            console.log('llama-server.exe 存在但不完整，重新下载');
            fs.unlinkSync(targetExe);
        }
        
        console.log(`下载 URL: ${LLAMA_SERVER_URL}`);
        await downloadFile(LLAMA_SERVER_URL, ZIP_FILE);
        
        const zipStats = fs.statSync(ZIP_FILE);
        if (zipStats.size < 1000000) {
            throw new Error(`下载的文件太小 (${zipStats.size} bytes)，可能下载失败`);
        }
        
        console.log('开始解压...');
        await extractZip(ZIP_FILE, EXTRACTED_DIR);
        
        console.log('移动文件到 bin 目录...');
        await moveFiles(EXTRACTED_DIR, BIN_DIR);
        
        console.log('清理压缩包...');
        fs.unlinkSync(ZIP_FILE);
        
        console.log('=== 完成 ===');
        console.log(`llama-server.exe 已保存到: ${targetExe}`);
        
        const stats = fs.statSync(targetExe);
        console.log(`文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
    } catch (error) {
        console.error('下载失败:', error.message);
        process.exit(1);
    }
}

main();