const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 日志文件路径
let logFilePath = null;

/**
 * 初始化日志文件路径
 */
function initLogPath() {
    if (!logFilePath && app) {
        const userDataPath = app.getPath('userData');
        const logsDir = path.join(userDataPath, 'logs');
        
        // 确保日志目录存在
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // 使用日期作为日志文件名
        const today = new Date().toISOString().split('T')[0];
        logFilePath = path.join(logsDir, `api-calls-${today}.jsonl`);
    }
    return logFilePath;
}

/**
 * 创建日志条目
 * @param {Object} params - 日志参数
 * @returns {Object} 日志条目对象
 */
function createLogEntry(params) {
    const {
        requestId,
        requestTime,
        responseTime,
        duration,
        model,
        maxTokens,
        promptLength,
        status,
        statusCode,
        responseContent,
        tokenUsage,
        error,
        retryCount
    } = params;

    return {
        // 唯一请求ID
        requestId: requestId || generateRequestId(),
        // 时间戳信息
        timestamp: {
            request: requestTime,
            response: responseTime,
            duration: duration || (responseTime && requestTime ? responseTime - requestTime : null)
        },
        // 请求参数
        request: {
            model: model,
            maxTokens: maxTokens,
            promptLength: promptLength
        },
        // 响应信息
        response: {
            status: status, // 'success' | 'error'
            statusCode: statusCode,
            contentLength: responseContent ? responseContent.length : 0
        },
        // Token使用量
        tokenUsage: tokenUsage ? {
            promptTokens: tokenUsage.prompt_tokens || 0,
            completionTokens: tokenUsage.completion_tokens || 0,
            totalTokens: tokenUsage.total_tokens || 0
        } : null,
        // 错误信息
        error: error ? {
            message: error.message || String(error),
            code: error.code || null
        } : null,
        // 重试次数
        retryCount: retryCount || 0
    };
}

/**
 * 生成唯一请求ID
 * @returns {string} 请求ID
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 写入日志到文件
 * @param {Object} logEntry - 日志条目
 */
function writeLog(logEntry) {
    try {
        const logPath = initLogPath();
        if (!logPath) {
            console.warn('日志路径未初始化，跳过日志写入');
            return;
        }

        // JSONL格式：每行一个JSON对象
        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(logPath, logLine, 'utf8');
    } catch (err) {
        console.error('写入API日志失败:', err.message);
    }
}

/**
 * 记录API调用日志
 * @param {Object} params - 日志参数
 * @returns {Object} 日志条目
 */
function logApiCall(params) {
    const logEntry = createLogEntry(params);
    writeLog(logEntry);
    return logEntry;
}

/**
 * 查询日志
 * @param {Object} options - 查询选项
 * @returns {Array} 日志条目数组
 */
function queryLogs(options = {}) {
    const {
        startDate,
        endDate,
        status,
        limit = 100,
        offset = 0
    } = options;

    try {
        const logPath = initLogPath();
        if (!logPath || !fs.existsSync(logPath)) {
            return [];
        }

        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        let logs = lines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(log => log !== null);

        // 按时间戳过滤
        if (startDate) {
            const startTs = new Date(startDate).getTime();
            logs = logs.filter(log => log.timestamp.request >= startTs);
        }
        if (endDate) {
            const endTs = new Date(endDate).getTime();
            logs = logs.filter(log => log.timestamp.request <= endTs);
        }

        // 按状态过滤
        if (status) {
            logs = logs.filter(log => log.response.status === status);
        }

        // 按时间倒序排列（最新的在前）
        logs.sort((a, b) => b.timestamp.request - a.timestamp.request);

        // 分页
        return logs.slice(offset, offset + limit);
    } catch (err) {
        console.error('查询API日志失败:', err.message);
        return [];
    }
}

/**
 * 获取日志统计信息
 * @param {Object} options - 统计选项
 * @returns {Object} 统计信息
 */
function getLogStats(options = {}) {
    const logs = queryLogs({ ...options, limit: 10000 });

    if (logs.length === 0) {
        return {
            totalCalls: 0,
            successCount: 0,
            errorCount: 0,
            avgDuration: 0,
            totalTokens: 0,
            avgTokens: 0
        };
    }

    const successCount = logs.filter(log => log.response.status === 'success').length;
    const errorCount = logs.filter(log => log.response.status === 'error').length;
    
    const durations = logs
        .filter(log => log.timestamp.duration !== null)
        .map(log => log.timestamp.duration);
    
    const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const totalTokens = logs
        .filter(log => log.tokenUsage)
        .reduce((sum, log) => sum + log.tokenUsage.totalTokens, 0);

    const tokensLogs = logs.filter(log => log.tokenUsage);
    const avgTokens = tokensLogs.length > 0
        ? Math.round(totalTokens / tokensLogs.length)
        : 0;

    return {
        totalCalls: logs.length,
        successCount,
        errorCount,
        successRate: logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 0,
        avgDuration,
        totalTokens,
        avgTokens
    };
}

/**
 * 清理旧日志文件
 * @param {number} daysToKeep - 保留天数
 */
function cleanOldLogs(daysToKeep = 30) {
    try {
        const userDataPath = app.getPath('userData');
        const logsDir = path.join(userDataPath, 'logs');
        
        if (!fs.existsSync(logsDir)) {
            return;
        }

        const files = fs.readdirSync(logsDir);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        files.forEach(file => {
            if (file.startsWith('api-calls-') && file.endsWith('.jsonl')) {
                const dateStr = file.replace('api-calls-', '').replace('.jsonl', '');
                const fileDate = new Date(dateStr);
                
                if (fileDate < cutoffDate) {
                    const filePath = path.join(logsDir, file);
                    fs.unlinkSync(filePath);
                    console.log(`已清理旧日志文件: ${file}`);
                }
            }
        });
    } catch (err) {
        console.error('清理旧日志失败:', err.message);
    }
}

module.exports = {
    logApiCall,
    queryLogs,
    getLogStats,
    cleanOldLogs,
    generateRequestId,
    initLogPath
};
