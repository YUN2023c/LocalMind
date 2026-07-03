/**
 * 错误处理模块
 * 提供统一的错误分类、识别和处理功能
 */

/**
 * 错误类型枚举
 */
const ErrorType = {
    NETWORK_CONNECTION: 'NETWORK_CONNECTION',       // 网络连接错误
    NETWORK_RESET: 'NETWORK_RESET',                 // 连接重置
    DNS_RESOLUTION: 'DNS_RESOLUTION',               // DNS解析错误
    TIMEOUT: 'TIMEOUT',                             // 超时错误
    SSL_TLS: 'SSL_TLS',                             // SSL/TLS错误
    HTTP_STATUS: 'HTTP_STATUS',                     // HTTP状态码错误
    AUTHENTICATION: 'AUTHENTICATION',               // 认证错误
    RATE_LIMIT: 'RATE_LIMIT',                       // 速率限制
    API_ERROR: 'API_ERROR',                         // API错误
    UNKNOWN: 'UNKNOWN'                              // 未知错误
};

/**
 * 错误信息配置
 * 包含错误类型、友好提示和解决方案
 */
const ErrorMessages = {
    [ErrorType.NETWORK_CONNECTION]: {
        title: '网络连接失败',
        message: '无法连接到 API 服务器，连接被拒绝',
        solution: '请检查：\n1. API URL 是否正确\n2. 网络连接是否正常\n3. 目标服务器是否在线\n4. 是否需要配置代理'
    },
    [ErrorType.NETWORK_RESET]: {
        title: '连接被重置',
        message: '与服务器的连接意外中断',
        solution: '请检查：\n1. 网络稳定性\n2. 是否存在网络代理或防火墙限制\n3. 稍后重试'
    },
    [ErrorType.DNS_RESOLUTION]: {
        title: 'DNS 解析失败',
        message: '无法解析 API 服务器域名',
        solution: '请检查：\n1. API URL 中的域名是否正确\n2. 网络DNS设置是否正常\n3. 是否需要配置DNS服务器'
    },
    [ErrorType.TIMEOUT]: {
        title: '请求超时',
        message: 'API 请求超时，服务器响应时间过长',
        solution: '请检查：\n1. 网络连接速度\n2. API 服务器负载情况\n3. 稍后重试'
    },
    [ErrorType.SSL_TLS]: {
        title: 'SSL/TLS 证书错误',
        message: '安全连接验证失败',
        solution: '请检查：\n1. API URL 是否使用正确的协议（https/http）\n2. 服务器证书是否有效\n3. 系统时间是否正确'
    },
    [ErrorType.HTTP_STATUS]: {
        title: 'HTTP 请求错误',
        message: '服务器返回错误状态码',
        solution: '请检查：\n1. API URL 是否正确\n2. API Key 是否有效\n3. 模型名称是否正确'
    },
    [ErrorType.AUTHENTICATION]: {
        title: '认证失败',
        message: 'API Key 无效或未授权',
        solution: '请检查：\n1. API Key 是否正确配置\n2. API Key 是否已过期\n3. 账户是否有访问权限'
    },
    [ErrorType.RATE_LIMIT]: {
        title: '请求频率限制',
        message: 'API 请求过于频繁或配额已用完',
        solution: '请检查：\n1. API 配额使用情况\n2. 稍后重试\n3. 考虑升级 API 套餐'
    },
    [ErrorType.API_ERROR]: {
        title: 'API 服务错误',
        message: 'API 服务返回错误',
        solution: '请检查：\n1. API 服务状态\n2. 请求参数是否正确\n3. 查看 API 文档了解错误详情'
    },
    [ErrorType.UNKNOWN]: {
        title: '未知错误',
        message: '发生未知错误',
        solution: '请检查：\n1. 错误详情\n2. 稍后重试\n3. 联系技术支持'
    }
};

/**
 * 根据错误代码识别错误类型
 * @param {string} code - 系统错误代码
 * @returns {string} 错误类型
 */
function classifyByCode(code) {
    const codeMap = {
        'ECONNREFUSED': ErrorType.NETWORK_CONNECTION,
        'ECONNRESET': ErrorType.NETWORK_RESET,
        'ENOTFOUND': ErrorType.DNS_RESOLUTION,
        'ETIMEDOUT': ErrorType.TIMEOUT,
        'ESOCKETTIMEDOUT': ErrorType.TIMEOUT,
        'EHOSTUNREACH': ErrorType.NETWORK_CONNECTION,
        'ENETUNREACH': ErrorType.NETWORK_CONNECTION,
        'EPROTO': ErrorType.SSL_TLS,
        'CERT_HAS_EXPIRED': ErrorType.SSL_TLS,
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE': ErrorType.SSL_TLS,
        'DEPTH_ZERO_SELF_SIGNED_CERT': ErrorType.SSL_TLS,
        'SELF_SIGNED_CERT_IN_CHAIN': ErrorType.SSL_TLS,
        'ERR_TLS_CERT_ALTNAME_INVALID': ErrorType.SSL_TLS
    };

    return codeMap[code] || ErrorType.UNKNOWN;
}

/**
 * 根据HTTP状态码识别错误类型
 * @param {number} statusCode - HTTP状态码
 * @returns {string} 错误类型
 */
function classifyByStatusCode(statusCode) {
    if (statusCode === 401) {
        return ErrorType.AUTHENTICATION;
    }
    if (statusCode === 403) {
        return ErrorType.AUTHENTICATION;
    }
    if (statusCode === 429) {
        return ErrorType.RATE_LIMIT;
    }
    if (statusCode === 404) {
        return ErrorType.HTTP_STATUS;
    }
    if (statusCode >= 400 && statusCode < 500) {
        return ErrorType.HTTP_STATUS;
    }
    if (statusCode >= 500) {
        return ErrorType.API_ERROR;
    }
    return ErrorType.UNKNOWN;
}

/**
 * 根据错误消息识别错误类型
 * @param {string} message - 错误消息
 * @returns {string} 错误类型
 */
function classifyByMessage(message) {
    if (!message) return ErrorType.UNKNOWN;

    const lowerMessage = message.toLowerCase();

    // SSL/TLS 相关错误
    if (lowerMessage.includes('ssl') || lowerMessage.includes('tls') ||
        lowerMessage.includes('certificate') || lowerMessage.includes('cert')) {
        return ErrorType.SSL_TLS;
    }

    // 超时相关
    if (lowerMessage.includes('timeout') || lowerMessage.includes('超时')) {
        return ErrorType.TIMEOUT;
    }

    // DNS相关
    if (lowerMessage.includes('dns') || lowerMessage.includes('enotfound') ||
        lowerMessage.includes('getaddrinfo')) {
        return ErrorType.DNS_RESOLUTION;
    }

    // 连接相关
    if (lowerMessage.includes('econnrefused') || lowerMessage.includes('connection refused') ||
        lowerMessage.includes('连接被拒绝')) {
        return ErrorType.NETWORK_CONNECTION;
    }

    if (lowerMessage.includes('econnreset') || lowerMessage.includes('connection reset') ||
        lowerMessage.includes('连接重置')) {
        return ErrorType.NETWORK_RESET;
    }

    // 认证相关
    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid key') ||
        lowerMessage.includes('api key') || lowerMessage.includes('认证') ||
        lowerMessage.includes('授权')) {
        return ErrorType.AUTHENTICATION;
    }

    // 速率限制
    if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests') ||
        lowerMessage.includes('频率') || lowerMessage.includes('配额')) {
        return ErrorType.RATE_LIMIT;
    }

    return ErrorType.UNKNOWN;
}

/**
 * 分类错误并返回详细的错误信息
 * @param {Error|string} error - 错误对象或错误消息
 * @param {Object} context - 错误上下文（可选）
 * @param {number} context.statusCode - HTTP状态码
 * @returns {Object} 分类后的错误信息
 */
function classifyError(error, context = {}) {
    let errorType = ErrorType.UNKNOWN;
    let originalMessage = '';
    let errorCode = '';

    // 提取错误信息
    if (typeof error === 'string') {
        originalMessage = error;
    } else if (error instanceof Error) {
        originalMessage = error.message || '';
        errorCode = error.code || '';
    } else if (typeof error === 'object' && error !== null) {
        originalMessage = error.message || JSON.stringify(error);
        errorCode = error.code || '';
    }

    // 获取HTTP状态码（优先从错误对象，然后从context）
    const statusCode = (error && error.statusCode) || context.statusCode;

    // 优先使用错误代码分类
    if (errorCode) {
        errorType = classifyByCode(errorCode);
    }

    // 如果错误代码无法识别，尝试使用HTTP状态码
    if (errorType === ErrorType.UNKNOWN && statusCode) {
        errorType = classifyByStatusCode(statusCode);
    }

    // 如果仍无法识别，尝试使用错误消息
    if (errorType === ErrorType.UNKNOWN) {
        errorType = classifyByMessage(originalMessage);
    }

    // 获取错误配置
    const errorConfig = ErrorMessages[errorType] || ErrorMessages[ErrorType.UNKNOWN];

    return {
        type: errorType,
        title: errorConfig.title,
        message: errorConfig.message,
        solution: errorConfig.solution,
        originalMessage: originalMessage,
        errorCode: errorCode,
        statusCode: context.statusCode || null,
        isNetworkError: [
            ErrorType.NETWORK_CONNECTION,
            ErrorType.NETWORK_RESET,
            ErrorType.DNS_RESOLUTION,
            ErrorType.TIMEOUT,
            ErrorType.SSL_TLS
        ].includes(errorType),
        isRetryable: [
            ErrorType.NETWORK_CONNECTION,
            ErrorType.NETWORK_RESET,
            ErrorType.TIMEOUT,
            ErrorType.RATE_LIMIT
        ].includes(errorType)
    };
}

/**
 * 格式化错误信息为用户友好的字符串
 * @param {Error|string} error - 错误对象或错误消息
 * @param {Object} context - 错误上下文
 * @returns {string} 格式化后的错误信息
 */
function formatErrorMessage(error, context = {}) {
    const classified = classifyError(error, context);

    let formattedMessage = `${classified.title}: ${classified.message}`;

    // 如果有原始错误消息且与默认消息不同，附加原始消息
    if (classified.originalMessage &&
        classified.originalMessage !== classified.message &&
        !classified.message.includes(classified.originalMessage)) {
        formattedMessage += ` (${classified.originalMessage})`;
    }

    return formattedMessage;
}

/**
 * 获取错误的详细解决方案
 * @param {Error|string} error - 错误对象或错误消息
 * @param {Object} context - 错误上下文
 * @returns {string} 详细的解决方案
 */
function getErrorSolution(error, context = {}) {
    const classified = classifyError(error, context);
    return classified.solution;
}

/**
 * 判断错误是否可重试
 * @param {Error|string} error - 错误对象或错误消息
 * @param {Object} context - 错误上下文
 * @returns {boolean} 是否可重试
 */
function isRetryableError(error, context = {}) {
    const classified = classifyError(error, context);
    return classified.isRetryable;
}

/**
 * 创建带有详细信息的错误对象
 * @param {Error|string} error - 原始错误
 * @param {Object} context - 错误上下文
 * @returns {Error} 增强的错误对象
 */
function createDetailedError(error, context = {}) {
    const classified = classifyError(error, context);

    const detailedError = new Error(formatErrorMessage(error, context));
    detailedError.code = classified.errorCode || classified.type;
    detailedError.classification = classified;
    detailedError.isRetryable = classified.isRetryable;

    return detailedError;
}

module.exports = {
    ErrorType,
    ErrorMessages,
    classifyError,
    classifyByCode,
    classifyByStatusCode,
    classifyByMessage,
    formatErrorMessage,
    getErrorSolution,
    isRetryableError,
    createDetailedError
};
