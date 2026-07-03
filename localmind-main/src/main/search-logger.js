const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let logFilePath = null;

function initLogPath() {
    if (!logFilePath) {
        // 生产环境（asar 打包后）__dirname 指向只读的 asar 包内部，无法写入日志文件。
        // 使用 app.getPath('userData') 确保日志文件位于可写目录。
        const logsDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        const today = new Date().toISOString().split('T')[0];
        logFilePath = path.join(logsDir, `search-${today}.log`);
    }
    return logFilePath;
}

function generateSearchId() {
    return `search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function writeSearchLog(logEntry) {
    try {
        const logPath = initLogPath();
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${JSON.stringify(logEntry)}\n`;
        fs.appendFileSync(logPath, logLine, 'utf8');
    } catch (err) {
        console.error('[检索日志] 写入失败:', err.message);
    }
}

function logSearchAttempt(searchId, algorithm, query, startTime) {
    const logEntry = {
        searchId,
        algorithm,
        action: 'START',
        query: query,
        startTime: startTime
    };
    console.log(`[检索日志] [${algorithm}] 开始检索 - searchId: ${searchId}, query: "${query}"`);
    writeSearchLog(logEntry);
}

function logSearchResult(searchId, algorithm, query, results, durationMs, error = null) {
    const logEntry = {
        searchId,
        algorithm,
        action: 'COMPLETE',
        query: query,
        resultCount: results ? results.length : 0,
        durationMs: durationMs,
        error: error ? error.message : null,
        resultIds: results ? results.map(r => r.id) : []
    };
    if (error) {
        console.log(`[检索日志] [${algorithm}] 检索失败 - searchId: ${searchId}, error: ${error.message}, duration: ${durationMs}ms`);
    } else {
        console.log(`[检索日志] [${algorithm}] 检索完成 - searchId: ${searchId}, 结果数量: ${results.length}, duration: ${durationMs}ms, 结果ID: ${results.map(r => r.id).join(', ')}`);
    }
    writeSearchLog(logEntry);
}

function logSearchStrategy(searchId, strategy, usedAlgorithm, fallbackReason = null) {
    const logEntry = {
        searchId,
        action: 'STRATEGY',
        strategy: strategy,
        usedAlgorithm: usedAlgorithm,
        fallbackReason: fallbackReason
    };
    console.log(`[检索日志] [策略] searchId: ${searchId}, 使用算法: ${usedAlgorithm}, 策略: ${strategy}, 回退原因: ${fallbackReason || '无'}`);
    writeSearchLog(logEntry);
}

function logFinalDocuments(searchId, documents, sourceAlgorithm) {
    const logEntry = {
        searchId,
        action: 'FINAL',
        sourceAlgorithm: sourceAlgorithm,
        finalCount: documents.length,
        documentInfo: documents.map((doc, index) => ({
            index: index + 1,
            id: doc.id,
            title: doc.title,
            contentLength: doc.content ? doc.content.length : 0,
            filePath: doc.filePath
        }))
    };
    console.log(`[检索日志] [最终结果] searchId: ${searchId}, 来源算法: ${sourceAlgorithm}, 最终文档数: ${documents.length}`);
    documents.forEach((doc, index) => {
        console.log(`  [文档${index + 1}] ID: ${doc.id}, 标题: "${doc.title}", 内容长度: ${doc.content ? doc.content.length : 0}`);
    });
    writeSearchLog(logEntry);
}

module.exports = {
    generateSearchId,
    logSearchAttempt,
    logSearchResult,
    logSearchStrategy,
    logFinalDocuments,
    initLogPath
};