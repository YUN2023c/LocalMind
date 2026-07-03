const https = require('https');
const http = require('http');
const Store = require('electron-store');
const { updateDocument, insertKeywords, insertTags } = require('./database');
const { normalizeApiUrl, validateUrl, validateApiKey, validateModel } = require('./utils');
const { logApiCall, generateRequestId } = require('./api-logger');
const { classifyError, formatErrorMessage, isRetryableError, ErrorType } = require('./error-handler');
const { concurrencyController } = require('./concurrency-controller');
const { rateLimiter } = require('./rate-limiter');
const keychainService = require('./keychain-service');
const localModelService = require('./local-model-service');

const store = new Store();

let userDataPath = '';

function setUserDataPath(path) {
    userDataPath = path;
}

const PROMPTS = {
    summarize: '请为以下文档内容生成一个简短的摘要（100-200字）\n{content}',
    keywords: '请从以下文档内容中提取5-10个关键词，用逗号分隔\n{content}',
    tags: '请为以下文档内容生成3-5个主题标签，用逗号分隔，标签应简洁且具有代表性：\n{content}'
};

const MAX_SUMMARY_INPUT_CHARS = 4000;
const REQUEST_TIMEOUT_MS = 60000;

// 指数退避重试策略配置
const DEFAULT_RETRY_STRATEGY = {
    baseDelay: 1000,        // 基础延迟时间：1000毫秒
    maxDelay: 30000,        // 最大延迟时间：30000毫秒
    backoffFactor: 2,       // 退避因子：2
    jitter: true,            // 启用随机抖动避免雷鸣羊群效应
    jitterFactor: 0.3        // 抖动系数：30%
};

/**
 * 计算指数退避延迟时间
 * @param {number} retryAttempt - 当前重试次数（从0开始）
 * @param {Object} strategy - 重试策略配置
 * @returns {number} 延迟时间（毫秒）
 */
function calculateBackoffDelay(retryAttempt, strategy = DEFAULT_RETRY_STRATEGY) {
    const { baseDelay, maxDelay, backoffFactor, jitter, jitterFactor } = strategy;
    
    // 计算指数延迟：baseDelay * (backoffFactor ^ retryAttempt)
    const exponentialDelay = baseDelay * Math.pow(backoffFactor, retryAttempt);
    
    // 确保不超过最大延迟时间
    const cappedDelay = Math.min(exponentialDelay, maxDelay);
    
    // 添加随机抖动避免雷鸣羊群效应
    if (jitter) {
        const jitterRange = cappedDelay * jitterFactor;
        const randomJitter = (Math.random() * 2 - 1) * jitterRange; // 范围：[-jitterRange, +jitterRange]
        return Math.max(0, Math.round(cappedDelay + randomJitter));
    }
    
    return Math.round(cappedDelay);
}

/**
 * 获取重试策略配置
 * 从 electron-store 中获取用户配置，合并默认值
 * @returns {Object} 重试策略配置
 */
function getRetryStrategy() {
    const localmind = store.get('localmind', {});
    const userStrategy = localmind.retryStrategy || {};
    
    return {
        baseDelay: userStrategy.baseDelay ?? DEFAULT_RETRY_STRATEGY.baseDelay,
        maxDelay: userStrategy.maxDelay ?? DEFAULT_RETRY_STRATEGY.maxDelay,
        backoffFactor: userStrategy.backoffFactor ?? DEFAULT_RETRY_STRATEGY.backoffFactor,
        jitter: userStrategy.jitter ?? DEFAULT_RETRY_STRATEGY.jitter,
        jitterFactor: userStrategy.jitterFactor ?? DEFAULT_RETRY_STRATEGY.jitterFactor
    };
}

/**
 * 获取API配置
 * 优先从密钥存储服务获取API密钥，回退到electron-store
 * @returns {Promise<Object>} API配置对象
 */
async function getApiConfig() {
    const localmind = store.get('localmind', {});
    console.log('[API配置] 从store读取的localmind.apiKey长度:', localmind.apiKey ? localmind.apiKey.length : 0);
    
    let apiKey = '';
    try {
        apiKey = await keychainService.getApiKey();
        console.log('[API配置] 从keychain读取apiKey长度:', apiKey ? apiKey.length : 0);
    } catch (error) {
        console.warn('[API配置] 从密钥存储服务获取API密钥失败，回退到electron-store:', error.message);
        apiKey = '';
    }
    
    if (!apiKey) {
        apiKey = localmind.apiKey || '';
        if (apiKey) {
            console.warn('[API配置] 从electron-store读取API密钥（建议重新保存以迁移到安全存储），长度:', apiKey.length);
        } else {
            console.warn('[API配置] electron-store中也没有API密钥');
        }
    }
    
    const result = {
        apiUrl: normalizeApiUrl(localmind.apiUrl),
        apiKey: apiKey,
        model: localmind.modelName || 'gpt-4o-mini'
    };
    console.log('[API配置] 最终返回的apiKey长度:', result.apiKey ? result.apiKey.length : 0);
    return result;
}

/**
 * 获取当前LLM模式
 * @returns {string} 'remote' 或 'local'
 */
function getLlmMode() {
    const localmind = store.get('localmind', {});
    return localmind.llmMode || 'local';
}

/**
 * 检查API配置是否有效
 * @returns {Promise<boolean>} 配置是否有效
 */
async function isValidConfig() {
    const mode = getLlmMode();
    
    if (mode === 'local') {
        const modelStatus = localModelService.getModelStatus();
        return modelStatus.isLoaded;
    }
    
    const config = await getApiConfig();
    return config.apiUrl && config.apiKey && config.model;
}

/**
 * 验证API配置
 * @returns {Promise<Object>} 验证结果
 */
async function validateConfig() {
    const config = await getApiConfig();
    
    const urlResult = validateUrl(config.apiUrl);
    if (!urlResult.valid) {
        return { valid: false, error: urlResult.error };
    }
    
    const keyResult = validateApiKey(config.apiKey);
    if (!keyResult.valid) {
        return { valid: false, error: keyResult.error };
    }
    
    const modelResult = validateModel(config.model);
    if (!modelResult.valid) {
        return { valid: false, error: modelResult.error };
    }
    
    return { valid: true };
}

/**
 * 验证API响应格式是否正确
 * @param {Object} response - API返回的响应对象
 * @throws {Error} 当验证失败时抛出明确的错误信息
 */
function validateApiResponse(response) {
    // 验证response对象存在
    if (!response) {
        throw new Error('API响应验证失败：响应对象不存在');
    }

    // 验证response.choices数组存在且非空
    if (!response.choices) {
        throw new Error('API响应验证失败：响应中缺少choices字段');
    }

    if (!Array.isArray(response.choices)) {
        throw new Error('API响应验证失败：choices字段不是数组');
    }

    if (response.choices.length === 0) {
        throw new Error('API响应验证失败：choices数组为空');
    }

    // 验证response.choices[0].message存在
    const firstChoice = response.choices[0];
    if (!firstChoice) {
        throw new Error('API响应验证失败：无法获取第一个选择项');
    }

    if (!firstChoice.message) {
        throw new Error('API响应验证失败：响应中缺少message字段');
    }

    // 验证response.choices[0].message.content是有效字符串
    if (firstChoice.message.content === undefined || firstChoice.message.content === null) {
        throw new Error('API响应验证失败：响应中缺少content字段');
    }

    if (typeof firstChoice.message.content !== 'string') {
        throw new Error('API响应验证失败：content字段不是字符串类型');
    }
}

async function callLlmApi(prompt, maxTokens = 500, maxRetries = 3) {
    const mode = getLlmMode();
    
    if (mode === 'local') {
        console.log('[本地模型] 使用本地模型进行推理');
        return await localModelService.callLocalModel(prompt, maxTokens);
    }
    
    const config = await getApiConfig();

    if (!await isValidConfig()) {
        throw new Error('LLM API 配置不完整，请检查 apiUrl、apiKey 和 model 配置');
    }

    await rateLimiter.acquireToken();

    const requestId = generateRequestId();
    const requestStartTime = Date.now();

    const url = new URL(config.apiUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const isAliyunMaas = url.hostname.includes('maas.aliyuncs.com');
    // 检测是否为OpenAI兼容模式：支持 /compatible-mode/, /v1/, /chat/completions 等标准路径
    const isOpenAICompatible = url.pathname.includes('/compatible-mode/') || 
                               url.pathname.includes('/v1/') || 
                               url.pathname.includes('/chat/completions');
    const useAliyunMaasFormat = isAliyunMaas && !isOpenAICompatible;
    console.log('[API调用] URL:', config.apiUrl);
    console.log('[API调用] Hostname:', url.hostname);
    console.log('[API调用] 是阿里云MAAS:', isAliyunMaas);
    console.log('[API调用] 是OpenAI兼容模式:', isOpenAICompatible);
    console.log('[API调用] 使用阿里云MAAS专用格式:', useAliyunMaasFormat);

    let body, options;

    if (useAliyunMaasFormat) {
        console.log('[API调用] 使用阿里云MAAS格式，路径: /api/text/generation');
        body = JSON.stringify({
            model: config.model,
            input: prompt,
            parameters: {
                max_tokens: maxTokens,
                temperature: 0.7
            }
        });

        options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: '/api/text/generation',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: REQUEST_TIMEOUT_MS
        };
    } else {
        body = JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens
        });

        options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: REQUEST_TIMEOUT_MS
        };
    }

    let lastError = null;
    
    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            const result = await new Promise((resolve, reject) => {
                const req = client.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        try {
                            // 检查 HTTP 状态码并使用错误分类
                            if (res.statusCode >= 400) {
                                const classified = classifyError(null, { statusCode: res.statusCode });
                                let detailedMessage = formatErrorMessage(null, { statusCode: res.statusCode });

                                // 针对特定状态码添加更详细的说明
                                if (res.statusCode === 404) {
                                    detailedMessage += '\n请确保 API URL 包含正确的路径（如 /v1/chat/completions）';
                                } else if (res.statusCode === 401 || res.statusCode === 403) {
                                    detailedMessage += '\n请检查 API Key 是否正确配置且有效';
                                } else if (res.statusCode === 429) {
                                    detailedMessage += '\n请稍后重试或检查 API 配额';
                                }

                                const httpError = new Error(detailedMessage);
                                httpError.statusCode = res.statusCode;
                                reject(httpError);
                                return;
                            }

                            const response = JSON.parse(data);
                            console.log('[API调用] 响应原始数据:', JSON.stringify(response).substring(0, 500));
                            
                            // 检查API是否返回错误
                            if (response.error) {
                                const apiError = new Error(response.error.message);
                                const classified = classifyError(apiError);
                                reject(new Error(`API 错误: ${classified.message}\n${classified.solution}`));
                                return;
                            }
                            
                            // 处理不同API格式的响应
                            let responseContent;
                            if (useAliyunMaasFormat) {
                                if (!response.output || !response.output.text) {
                                    reject(new Error('API响应验证失败：阿里云MAAS响应格式不正确'));
                                    return;
                                }
                                responseContent = response.output.text.trim();
                            } else {
                                // OpenAI 兼容模式：可能返回多种格式
                                if (response.choices && response.choices[0] && response.choices[0].message) {
                                    // 标准 OpenAI 格式
                                    try {
                                        validateApiResponse(response);
                                        responseContent = response.choices[0].message.content.trim();
                                    } catch (validationError) {
                                        reject(validationError);
                                        return;
                                    }
                                } else if (response.output && response.output.text) {
                                    // 阿里云 MAAS 完整格式
                                    responseContent = response.output.text.trim();
                                } else if (response.text) {
                                    // 阿里云 MAAS 简化格式（OpenAI 兼容模式）
                                    responseContent = response.text.trim();
                                } else {
                                    reject(new Error('API响应验证失败：响应格式未知（既不是OpenAI格式也不是MAAS格式）'));
                                    return;
                                }
                            }
                            
                            // 记录成功的API调用日志
                            const responseTime = Date.now();
                            logApiCall({
                                requestId,
                                requestTime: requestStartTime,
                                responseTime,
                                model: config.model,
                                maxTokens,
                                promptLength: prompt.length,
                                status: 'success',
                                statusCode: res.statusCode,
                                responseContent: responseContent,
                                tokenUsage: response.usage || null,
                                retryCount: retry
                            });
                            
                            resolve(responseContent);
                        } catch (parseError) {
                            reject(new Error(`解析响应错误: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (err) => {
                    reject(err);
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('API 请求超时'));
                });

                req.write(body);
                req.end();
            });
            
            return result;
        } catch (error) {
            lastError = error;
            console.error('[API调用] 第', retry + 1, '次尝试失败:', error);
            console.error('[API调用] 错误对象:', JSON.stringify(Object.getOwnPropertyNames(error)));
            console.error('[API调用] 错误消息:', error.message);
            console.error('[API调用] 错误代码:', error.code);
            
            // 使用错误分类判断是否可重试
            const shouldRetry = isRetryableError(error);
            
            // 如果是最后一次重试或不可重试的错误，记录失败日志
            if (retry === maxRetries - 1 || !shouldRetry) {
                const responseTime = Date.now();
                logApiCall({
                    requestId,
                    requestTime: requestStartTime,
                    responseTime,
                    model: config.model,
                    maxTokens,
                    promptLength: prompt.length,
                    status: 'error',
                    error: error,
                    retryCount: retry
                });
                
                // 如果错误已经是分类后的格式，直接抛出
                if (error.message.includes('解决方案') || error.message.includes('请检查')) {
                    throw error;
                }
                // 否则进行错误分类
                const classified = classifyError(error);
                throw new Error(`${classified.title}: ${classified.message}\n${classified.solution}`);
            }
            
            // 可重试错误，使用指数退避等待后继续
            const retryStrategy = getRetryStrategy();
            const delayMs = calculateBackoffDelay(retry, retryStrategy);
            console.log(`[重试] 第 ${retry + 1} 次重试，等待 ${delayMs}ms 后继续...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    // 如果所有重试都失败，抛出最后一个错误
    throw lastError;
}

async function extractSummary(content) {
    // 检查文档内容是否有效，防止浪费 Token
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('文档内容为空，无法生成摘要');
    }

    const totalChars = content.length;
    let processedContent = content;

    if (content.length > MAX_SUMMARY_INPUT_CHARS) {
        processedContent = content.substring(0, MAX_SUMMARY_INPUT_CHARS);
        // 在控制台输出截断信息
        console.log(`[截断提示] 摘要生成：已使用文档前 ${MAX_SUMMARY_INPUT_CHARS} 字，共 ${totalChars} 字`);
        processedContent += `\n\n[注：已使用文档前 ${MAX_SUMMARY_INPUT_CHARS} 字，共 ${totalChars} 字]`;
    }
    const prompt = PROMPTS.summarize.replace('{content}', processedContent);
    return await callLlmApi(prompt);
}

async function extractKeywords(content) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('文档内容为空，无法提取关键词');
    }

    const totalChars = content.length;
    let processedContent = content;

    if (content.length > MAX_SUMMARY_INPUT_CHARS) {
        processedContent = content.substring(0, MAX_SUMMARY_INPUT_CHARS);
        // 在控制台输出截断信息
        console.log(`[截断提示] 关键词提取：已使用文档前 ${MAX_SUMMARY_INPUT_CHARS} 字，共 ${totalChars} 字`);
        processedContent += `\n\n[注：已使用文档前 ${MAX_SUMMARY_INPUT_CHARS} 字，共 ${totalChars} 字]`;
    }

    const prompt = PROMPTS.keywords.replace('{content}', processedContent);
    const result = await callLlmApi(prompt);
    if (!result || typeof result !== 'string') {
        return [];
    }
    return result.split(/[,，、]/)
        .map(k => k.trim())
        .filter(k => k.length > 0);
}

async function generateTags(content) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('文档内容为空，无法生成标签');
    }

    const totalChars = content.length;
    let processedContent = content;

    if (content.length > MAX_SUMMARY_INPUT_CHARS) {
        processedContent = content.substring(0, MAX_SUMMARY_INPUT_CHARS);
        // 在控制台输出截断信息
        console.log(`[截断提示] 标签生成：已使用文档前 ${MAX_SUMMARY_INPUT_CHARS} 字，共 ${totalChars} 字`);
        processedContent += `\n\n[注：已使用文档前 ${MAX_SUMMARY_INPUT_CHARS} 字，共 ${totalChars} 字]`;
    }

    const prompt = PROMPTS.tags.replace('{content}', processedContent);
    const result = await callLlmApi(prompt);
    if (!result || typeof result !== 'string') {
        return [];
    }
    return result.split(/[,，、]/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
}

async function analyzeDocument(docId, content, progressCallback) {
    // 在调用任何 LLM API 前检查文档内容是否有效
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('文档内容为空，无法进行 AI 分析');
    }

    if (progressCallback) {
        progressCallback({
            docId,
            step: 'summary',
            progress: 20,
            message: '正在提取摘要...'
        });
    }

    const summary = await extractSummary(content);

    if (progressCallback) {
        progressCallback({
            docId,
            step: 'keywords',
            progress: 50,
            message: '正在识别关键词...'
        });
    }

    const keywords = await extractKeywords(content);

    if (progressCallback) {
        progressCallback({
            docId,
            step: 'tags',
            progress: 80,
            message: '正在生成标签...'
        });
    }

    const tags = await generateTags(content);

    if (progressCallback) {
        progressCallback({
            docId,
            step: 'save',
            progress: 90,
            message: '正在保存分析结果...'
        });
    }

    await updateDocument({
        id: docId,
        abstract: summary
    });

    await insertKeywords(docId, keywords);
    await insertTags(docId, tags);

    if (progressCallback) {
        progressCallback({
            docId,
            step: 'done',
            progress: 100,
            message: '分析完成',
            result: { summary, keywords, tags }
        });
    }

    return { summary, keywords, tags };
}

/**
 * 并发批量分析文档
 * 使用并发控制器来管理同时进行的API调用数量，避免触发API速率限制
 * @param {Array} documents - 文档数组，每个元素包含 id, title, content
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<Object>} 分析结果
 */
async function batchAnalyze(documents, progressCallback) {
    const total = documents.length;
    let completed = 0;
    let failed = 0;
    const results = [];
    const resultsMap = new Map(); // 使用 Map 存储结果以便按顺序返回
    
    // 获取并发控制状态
    const concurrencyStatus = concurrencyController.getStatus();
    console.log(`[批量分析] 开始并发分析 - 总数: ${total}, 最大并发: ${concurrencyStatus.maxConcurrency}`);
    
    // 定义处理单个文档的函数
    const processDocument = async (doc, docIndex) => {
        // 如果文档内容为空，跳过
        if (!doc.content || doc.content.trim().length === 0) {
            resultsMap.set(docIndex, {
                docId: doc.id,
                title: doc.title,
                success: false,
                error: '文档内容为空'
            });
            
            if (progressCallback) {
                progressCallback({
                    total,
                    completed: resultsMap.size,
                    failed: resultsMap.size - [...resultsMap.values()].filter(r => r.success).length,
                    currentDoc: doc,
                    progress: Math.round((resultsMap.size / total) * 100),
                    message: `跳过空文档: ${doc.title}`
                });
            }
            return;
        }
        
        if (progressCallback) {
            progressCallback({
                total,
                completed: resultsMap.size,
                failed: [...resultsMap.values()].filter(r => !r.success).length,
                currentDoc: doc,
                progress: Math.round((resultsMap.size / total) * 100),
                message: `正在分析: ${doc.title}`
            });
        }
        
        try {
            // 使用并发控制器执行分析任务
            const result = await concurrencyController.execute(async () => {
                return await analyzeDocument(doc.id, doc.content, (stepProgress) => {
                    if (progressCallback) {
                        const stepProgressPercent = stepProgress.progress || 0;
                        // 计算总体进度：已完成文档 + 当前文档进度百分比
                        const overallProgress = ((resultsMap.size + stepProgressPercent / 100) / total) * 100;
                        progressCallback({
                            ...stepProgress,
                            total,
                            completed: resultsMap.size,
                            failed: [...resultsMap.values()].filter(r => !r.success).length,
                            currentDoc: doc,
                            progress: Math.round(overallProgress),
                            overallProgress: Math.round((resultsMap.size / total) * 100)
                        });
                    }
                });
            });
            
            resultsMap.set(docIndex, {
                docId: doc.id,
                title: doc.title,
                success: true,
                result
            });
        } catch (error) {
            resultsMap.set(docIndex, {
                docId: doc.id,
                title: doc.title,
                success: false,
                error: error.message
            });
        }
        
        // 更新完成计数
        completed = resultsMap.size;
        failed = [...resultsMap.values()].filter(r => !r.success).length;
        
        if (progressCallback) {
            progressCallback({
                total,
                completed,
                failed,
                progress: Math.round((completed / total) * 100),
                message: completed === total ? '批量分析完成' : `已完成 ${completed}/${total}`
            });
        }
    };
    
    // 为每个文档创建处理 Promise
    const processPromises = documents.map((doc, index) => 
        processDocument(doc, index)
    );
    
    // 等待所有文档处理完成
    await Promise.all(processPromises);
    
    // 按原始顺序返回结果
    for (let i = 0; i < documents.length; i++) {
        results.push(resultsMap.get(i));
    }
    
    return {
        total,
        completed,
        failed,
        success: total - failed,
        results
    };
}

/**
 * 流式调用 LLM API - 支持实时输出
 * @param {string} prompt - 提示词
 * @param {Function} onChunk - 每个数据块回调函数（仅传递本次增量 delta，不传累积文本）
 * @param {number} maxTokens - 最大令牌数
 * @param {AbortSignal} [signal=null] - 可选的中止信号，触发后销毁请求并返回已累积的内容
 * @returns {Promise<string>} 完整响应
 */
async function callLlmApiStream(prompt, onChunk, maxTokens = 2000, signal = null) {
    const mode = getLlmMode();
    
    if (mode === 'local') {
        console.log('[本地模型] 使用本地模型进行流式推理');
        return await localModelService.callLocalModelStream(prompt, onChunk, maxTokens, signal);
    }
    
    const config = await getApiConfig();

    if (!await isValidConfig()) {
        throw new Error('LLM API 配置不完整，请检查 apiUrl、apiKey 和 model 配置');
    }

    await rateLimiter.acquireToken();

    const requestId = generateRequestId();
    const requestStartTime = Date.now();

    const url = new URL(config.apiUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const isAliyunMaas = url.hostname.includes('maas.aliyuncs.com');
    // 检测是否为OpenAI兼容模式：支持 /compatible-mode/, /v1/, /chat/completions 等标准路径
    const isOpenAICompatible = url.pathname.includes('/compatible-mode/') || 
                               url.pathname.includes('/v1/') || 
                               url.pathname.includes('/chat/completions');
    const useAliyunMaasFormat = isAliyunMaas && !isOpenAICompatible;

    let body, options;

    if (useAliyunMaasFormat) {
        // 阿里云 MAAS API 使用不同的请求格式
        body = JSON.stringify({
            model: config.model,
            input: prompt,
            parameters: {
                max_tokens: maxTokens,
                temperature: 0.7
            }
        });

        options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: '/api/text/generation',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: REQUEST_TIMEOUT_MS
        };
    } else {
        // OpenAI 兼容格式，支持流式响应
        body = JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            stream: true
        });

        options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: REQUEST_TIMEOUT_MS
        };
    }

    return new Promise((resolve, reject) => {
        let fullContent = '';
        let headersSent = false;
        let responseData = '';
        // 累积的实际文本内容（不包含SSE原始数据）
        let accumulatedText = '';
        // SSE 跨 TCP 数据块行缓冲：当一行 data: 被切到两个 chunk 时，前半段暂存到 lineBuffer，下个 chunk 拼接后再处理
        let lineBuffer = '';

        const req = client.request(options, (res) => {
            console.log('[API流式] HTTP状态码:', res.statusCode);
            console.log('[API流式] Content-Type:', res.headers['content-type']);
            console.log('[API流式] 响应头:', JSON.stringify(res.headers).substring(0, 200));

            // 检查 HTTP 状态码
            if (res.statusCode >= 400) {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    const httpError = new Error(`HTTP 请求错误: 服务器返回错误状态码 ${res.statusCode}`);
                    httpError.statusCode = res.statusCode;
                    reject(httpError);
                });
                return;
            }

            // 检查 Content-Type：如果是 SSE 才走流式解析
            const contentType = res.headers['content-type'] || '';
            const isSSE = contentType.includes('text/event-stream');
            console.log('[API流式] 是否SSE格式:', isSSE);

            if (!isSSE) {
                // 非 SSE 响应：累积完整响应后模拟流式输出
                res.on('data', (chunk) => {
                    responseData += chunk.toString();
                });

                res.on('end', () => {
                    let content = '';
                    try {
                        const response = JSON.parse(responseData);
                        console.log('[API调用] 非流式响应数据:', JSON.stringify(response).substring(0, 500));

                        if (response.choices && response.choices[0] && response.choices[0].message) {
                            content = response.choices[0].message.content || '';
                        } else if (response.output && response.output.text) {
                            content = response.output.text;
                        } else if (response.text) {
                            content = response.text;
                        }
                    } catch (parseError) {
                        console.error('[API调用] 响应解析失败:', parseError.message);
                        reject(new Error('API响应解析失败: ' + parseError.message));
                        return;
                    }

                    if (!content) {
                        resolve('');
                        return;
                    }

                    fullContent = content;
                    accumulatedText = content;
                    console.log('[API调用] 解析得到内容长度:', content.length, '开始模拟流式输出');

                    // 模拟流式输出：将内容分块逐步传递
                    let index = 0;
                    const chunkSize = 20; // 每次发送的字符数
                    let stopped = false;

                    // 立即发送第一个数据块，触发前端停止加载动画
                    if (content.length > 0 && !stopped) {
                        const firstChunkSize = Math.min(chunkSize, content.length);
                        console.log('[API调用] 立即发送第一个数据块, 长度:', firstChunkSize);
                        try {
                            onChunk(content.substring(0, firstChunkSize));
                        } catch (cbErr) {
                            console.error('[API调用] onChunk 回调错误:', cbErr.message);
                        }
                        index = firstChunkSize;
                    }

                    // 继续分块发送剩余内容
                    // streamTimer 保存当前 setTimeout 句柄，abort 时可清除
                    let streamTimer = null;
                    const simulateStream = () => {
                        if (stopped) return;
                        // AbortSignal 支持：若已中止，立即停止并返回已累积的内容
                        if (signal && signal.aborted) {
                            if (streamTimer) {
                                clearTimeout(streamTimer);
                                streamTimer = null;
                            }
                            resolve(accumulatedText);
                            return;
                        }
                        if (index < content.length) {
                            const nextSize = Math.min(chunkSize, content.length - index);
                            try {
                                // 契约：onChunk 只传递本次增量 delta（index ~ index+nextSize），不传累积前缀
                                // 否则下游 IPC handler 再做一次 accumulated += chunk 会造成 "AABABC" 重复 bug
                                onChunk(content.substring(index, index + nextSize));
                            } catch (cbErr) {
                                console.error('[API调用] onChunk 回调错误:', cbErr.message);
                                stopped = true;
                                return;
                            }
                            index += nextSize;
                            streamTimer = setTimeout(simulateStream, 30);
                        } else {
                            // 全部发送完成
                            console.log('[API调用] 模拟流式输出完成');
                        }
                    };

                    // 继续发送剩余内容
                    if (index < content.length) {
                        streamTimer = setTimeout(simulateStream, 30);
                    }

                    // AbortSignal 支持：模拟流式过程中触发 abort 时，清除定时器并立即返回累积内容
                    if (signal) {
                        signal.addEventListener('abort', () => {
                            if (streamTimer) {
                                clearTimeout(streamTimer);
                                streamTimer = null;
                            }
                            stopped = true;
                            resolve(accumulatedText);
                        });
                    }

                    // 等待模拟流式完成后再resolve（防止前端提前清理）
                    const totalMs = Math.ceil(content.length / chunkSize) * 30 + 200;
                    console.log('[API调用] 预计等待时间(ms):', totalMs);
                    setTimeout(() => {
                        resolve(accumulatedText);
                    }, totalMs);
                });
                return;
            }

            res.on('data', (chunk) => {
                const text = chunk.toString();
                fullContent += text;
                console.log('[API流式] 收到数据块:', text.substring(0, 200));

                // SSE 跨 TCP 数据块行缓冲：将上一次未处理完的残余行与新数据拼接，再按 \n 切分
                const combined = lineBuffer + text;
                const lines = combined.split('\n');
                // 最后一段若不以 \n 结尾（被截断到下个 chunk），暂存到 lineBuffer；否则置空
                if (!combined.endsWith('\n')) {
                    lineBuffer = lines.pop();
                } else {
                    lineBuffer = '';
                }

                if (useAliyunMaasFormat) {
                    // 阿里云 MAAS 的响应处理
                    // 尝试解析 SSE 格式
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            const dataStr = line.substring(5).trim();
                            if (dataStr === '[DONE]') {
                                continue;
                            }
                            try {
                                const data = JSON.parse(dataStr);
                                if (data.output && data.output.text) {
                                    accumulatedText += data.output.text;
                                    // 契约：onChunk 只传递本次增量 delta（data.output.text），不传累积文本
                                    // 否则下游 IPC handler 再做一次 accumulated += chunk 会造成 "AABABC" 重复 bug
                                    onChunk(data.output.text);
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                } else {
                    // OpenAI 兼容模式：可能返回标准 OpenAI 格式或阿里云 MAAS 格式
                    // 重要：只提取 delta.content 字段，忽略 delta.reasoning_content（深度思考模型的思考过程）
                    // reasoning_content 是 AI 内部的思考步骤，不应显示给最终用户
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            const dataStr = line.substring(5).trim();
                            if (dataStr === '[DONE]') {
                                continue;
                            }
                            try {
                                const data = JSON.parse(dataStr);
                                // 处理不同的流式响应格式
                                if (data.choices && data.choices[0] && data.choices[0].delta) {
                                    const delta = data.choices[0].delta;
                                    // 只使用 content 字段，完全忽略 reasoning_content
                                    // reasoning_content 是深度思考模型的思考过程，不应显示给用户
                                    const content = delta.content;
                                    if (content && content.length > 0) {
                                        accumulatedText += content;
                                        // 契约：onChunk 只传递本次增量 delta（content），不传累积文本
                                        onChunk(content);
                                    }
                                    // 注意：不再读取 delta.reasoning_content
                                } else if (data.output && data.output.text) {
                                    // 阿里云 MAAS 格式
                                    accumulatedText += data.output.text;
                                    // 契约：onChunk 只传递本次增量 delta（data.output.text），不传累积文本
                                    onChunk(data.output.text);
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
            });

            res.on('end', () => {
                // flush 残留缓冲：若最后一块数据没有以 \n 结尾，仍需尝试解析 lineBuffer 中的完整 data: 行
                if (lineBuffer) {
                    const finalLine = lineBuffer;
                    lineBuffer = '';
                    if (finalLine.startsWith('data:')) {
                        const dataStr = finalLine.substring(5).trim();
                        if (dataStr !== '[DONE]') {
                            try {
                                const data = JSON.parse(dataStr);
                                if (useAliyunMaasFormat) {
                                    if (data.output && data.output.text) {
                                        accumulatedText += data.output.text;
                                        onChunk(data.output.text);
                                    }
                                } else {
                                    if (data.choices && data.choices[0] && data.choices[0].delta) {
                                        const content = data.choices[0].delta.content;
                                        if (content && content.length > 0) {
                                            accumulatedText += content;
                                            onChunk(content);
                                        }
                                    } else if (data.output && data.output.text) {
                                        accumulatedText += data.output.text;
                                        onChunk(data.output.text);
                                    }
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
                // 记录日志
                const responseTime = Date.now();
                logApiCall({
                    requestId,
                    requestTime: requestStartTime,
                    responseTime,
                    model: config.model,
                    maxTokens,
                    promptLength: prompt.length,
                    status: 'success',
                    statusCode: res.statusCode,
                    responseContent: '[流式响应]',
                    tokenUsage: null,
                    retryCount: 0
                });

                // 返回累积的实际文本内容（不是SSE原始数据）
                resolve(accumulatedText);
            });
        });

        // AbortSignal 支持：信号触发时销毁请求，触发下面的 'error' 事件
        if (signal) {
            signal.addEventListener('abort', () => {
                req.destroy();
            });
        }

        req.on('error', (err) => {
            // 若错误由 abort 触发，返回已累积的部分内容，避免前端崩溃
            if (signal && signal.aborted) {
                resolve(accumulatedText);
                return;
            }
            logApiCall({
                requestId,
                requestTime: requestStartTime,
                responseTime: Date.now(),
                model: config.model,
                maxTokens,
                promptLength: prompt.length,
                status: 'error',
                error: err,
                retryCount: 0
            });
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('API 请求超时'));
        });

        req.write(body);
        req.end();
    });
}

module.exports = {
    getApiConfig,
    getLlmMode,
    isValidConfig,
    validateConfig,
    validateApiResponse,
    calculateBackoffDelay,
    getRetryStrategy,
    DEFAULT_RETRY_STRATEGY,
    callLlmApi,
    callLlmApiStream,
    extractSummary,
    extractKeywords,
    generateTags,
    analyzeDocument,
    batchAnalyze,
    // 密钥存储相关
    saveApiKey: (apiKey) => keychainService.saveApiKey(apiKey),
    getApiKey: () => keychainService.getApiKey(),
    deleteApiKey: () => keychainService.deleteApiKey(),
    hasApiKey: () => keychainService.hasApiKey(),
    getStorageMethod: () => keychainService.getStorageMethod(),
    migrateApiKey: () => keychainService.migrateFromElectronStore(store),
    clearStoredApiKey: () => keychainService.clearElectronStoreApiKey(store),
    // 速率限制器相关
    getRateLimiterConfig: () => rateLimiter.getConfig(),
    updateRateLimiterConfig: (config) => rateLimiter.updateConfig(config),
    getRateLimiterStatus: () => ({
        availableTokens: rateLimiter.getAvailableTokens(),
        config: rateLimiter.getConfig()
    }),
    // 并发控制器相关
    getConcurrencyConfig: () => concurrencyController.getConfig(),
    updateConcurrencyConfig: (config) => concurrencyController.updateConfig(config),
    getConcurrencyStatus: () => concurrencyController.getStatus(),
    // 本地模型相关
    setUserDataPath,
    getLlmMode,
    localModelService
};
