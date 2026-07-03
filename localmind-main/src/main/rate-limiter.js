/**
 * 令牌桶算法实现的速率限制器
 * 用于控制API请求频率，避免超出API速率限制
 */

const Store = require('electron-store');

// 默认配置
const DEFAULT_CONFIG = {
    bucketCapacity: 10,      // 桶容量：10个令牌
    refillRate: 10,          // 补充速率：每分钟补充10个令牌
    refillIntervalMs: 60000 // 补充间隔：60000ms（1分钟）
};

// 速率限制器类
class RateLimiter {
    /**
     * 创建速率限制器实例
     * @param {Object} config - 配置对象
     * @param {number} config.bucketCapacity - 桶容量（令牌数量）
     * @param {number} config.refillRate - 补充速率（每分钟补充的令牌数）
     */
    constructor(config = {}) {
        this.store = new Store({ name: 'rate-limiter-config' });
        
        // 合并配置：优先使用存储的配置，否则使用传入的配置，最后使用默认配置
        const storedConfig = this.store.get('rateLimiter', {});
        this.config = {
            bucketCapacity: config.bucketCapacity ?? storedConfig.bucketCapacity ?? DEFAULT_CONFIG.bucketCapacity,
            refillRate: config.refillRate ?? storedConfig.refillRate ?? DEFAULT_CONFIG.refillRate,
            refillIntervalMs: (60000 / (config.refillRate ?? storedConfig.refillRate ?? DEFAULT_CONFIG.refillRate)) * DEFAULT_CONFIG.refillRate
        };
        
        // 初始化桶中的令牌数量
        this.tokens = this.config.bucketCapacity;
        
        // 上次补充令牌的时间戳
        this.lastRefillTime = Date.now();
        
        // 等待令牌的队列
        this.waitQueue = [];
        
        // 正在补充令牌的标志
        this.isRefilling = false;
        
        console.log(`[速率限制器] 初始化完成 - 桶容量: ${this.config.bucketCapacity}, 补充速率: ${this.config.refillRate}/分钟`);
    }
    
    /**
     * 从存储中加载配置
     */
    loadConfig() {
        const storedConfig = this.store.get('rateLimiter', {});
        if (storedConfig && (storedConfig.bucketCapacity || storedConfig.refillRate)) {
            this.config = {
                bucketCapacity: storedConfig.bucketCapacity || DEFAULT_CONFIG.bucketCapacity,
                refillRate: storedConfig.refillRate || DEFAULT_CONFIG.refillRate,
                refillIntervalMs: (60000 / (storedConfig.refillRate || DEFAULT_CONFIG.refillRate)) * DEFAULT_CONFIG.refillRate
            };
            console.log(`[速率限制器] 已加载配置 - 桶容量: ${this.config.bucketCapacity}, 补充速率: ${this.config.refillRate}/分钟`);
        }
    }
    
    /**
     * 保存配置到存储
     */
    saveConfig() {
        this.store.set('rateLimiter', {
            bucketCapacity: this.config.bucketCapacity,
            refillRate: this.config.refillRate
        });
        console.log(`[速率限制器] 配置已保存 - 桶容量: ${this.config.bucketCapacity}, 补充速率: ${this.config.refillRate}/分钟`);
    }
    
    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        if (newConfig.bucketCapacity !== undefined) {
            this.config.bucketCapacity = newConfig.bucketCapacity;
        }
        if (newConfig.refillRate !== undefined) {
            this.config.refillRate = newConfig.refillRate;
            this.config.refillIntervalMs = (60000 / newConfig.refillRate) * DEFAULT_CONFIG.refillRate;
        }
        this.saveConfig();
    }
    
    /**
     * 补充令牌
     * 根据时间流逝自动补充令牌
     */
    refillTokens() {
        const now = Date.now();
        const timePassed = now - this.lastRefillTime;
        const intervalMs = this.config.refillIntervalMs;
        
        if (timePassed >= intervalMs) {
            // 计算应该补充的令牌数
            const tokensToAdd = Math.floor(timePassed / intervalMs) * (this.config.refillRate / DEFAULT_CONFIG.refillRate);
            const previousTokens = this.tokens;
            this.tokens = Math.min(this.config.bucketCapacity, this.tokens + tokensToAdd);
            this.lastRefillTime = now;
            
            console.log(`[速率限制器] 补充令牌 - 之前: ${previousTokens}, 之后: ${this.tokens}, 补充了: ${tokensToAdd}`);
            
            // 处理等待队列
            this.processQueue();
        }
    }
    
    /**
     * 处理等待队列
     */
    processQueue() {
        while (this.waitQueue.length > 0 && this.tokens >= 1) {
            const waiting = this.waitQueue.shift();
            if (waiting && waiting.resolve) {
                this.tokens -= 1;
                waiting.resolve();
            }
        }
    }
    
    /**
     * 获取当前可用令牌数
     * @returns {number} 可用令牌数
     */
    getAvailableTokens() {
        this.refillTokens();
        return this.tokens;
    }
    
    /**
     * 获取令牌
     * 如果有足够的令牌则立即返回，否则等待直到有可用令牌
     * @returns {Promise<void>} 获取令牌成功后resolve
     */
    async acquireToken() {
        // 首先补充令牌
        this.refillTokens();
        
        // 如果有足够的令牌，直接消耗一个并返回
        if (this.tokens >= 1) {
            this.tokens -= 1;
            console.log(`[速率限制器] 获取令牌成功 - 剩余令牌: ${this.tokens}`);
            return;
        }
        
        // 如果没有足够的令牌，等待
        console.log(`[速率限制器] 令牌不足，等待补充 - 当前令牌: ${this.tokens}`);
        
        return new Promise((resolve, reject) => {
            this.waitQueue.push({ resolve, reject });
        }).then(() => {
            console.log(`[速率限制器] 等待结束，获取令牌成功 - 剩余令牌: ${this.tokens}`);
        });
    }
    
    /**
     * 尝试获取令牌，不阻塞
     * @returns {boolean} 是否获取成功
     */
    tryAcquireToken() {
        this.refillTokens();
        
        if (this.tokens >= 1) {
            this.tokens -= 1;
            console.log(`[速率限制器] 尝试获取令牌成功 - 剩余令牌: ${this.tokens}`);
            return true;
        }
        
        console.log(`[速率限制器] 尝试获取令牌失败 - 剩余令牌: ${this.tokens}`);
        return false;
    }
    
    /**
     * 等待指定时间后重试
     * @param {number} ms - 等待时间（毫秒）
     * @returns {Promise<void>}
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取当前配置
     * @returns {Object} 当前配置
     */
    getConfig() {
        return { ...this.config };
    }
    
    /**
     * 重置速率限制器状态
     */
    reset() {
        this.tokens = this.config.bucketCapacity;
        this.lastRefillTime = Date.now();
        this.waitQueue = [];
        console.log('[速率限制器] 已重置');
    }
}

// 创建并导出单例实例
const rateLimiter = new RateLimiter();

module.exports = {
    RateLimiter,
    rateLimiter,
    DEFAULT_CONFIG
};
