function normalizeApiUrl(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }

    let normalized = url.trim();

    while (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }

    if (normalized.endsWith('/chat/completions')) {
        return normalized;
    }

    return normalized + '/chat/completions';
}

function validateUrl(url) {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return { valid: false, error: 'URL 不能为空' };
    }

    try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { valid: false, error: 'URL 必须使用 http 或 https 协议' };
        }
        if (!parsed.hostname || parsed.hostname.length === 0) {
            return { valid: false, error: 'URL 主机名不能为空' };
        }
        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'URL 格式不正确: ' + e.message };
    }
}

function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return { valid: false, error: 'API Key 不能为空' };
    }
    if (apiKey.trim().length < 10) {
        return { valid: false, error: 'API Key 长度不足，请检查是否正确' };
    }
    return { valid: true };
}

function validateModel(model) {
    if (!model || typeof model !== 'string' || model.trim().length === 0) {
        return { valid: false, error: '模型名称不能为空' };
    }
    return { valid: true };
}

module.exports = {
    normalizeApiUrl,
    validateUrl,
    validateApiKey,
    validateModel
};
