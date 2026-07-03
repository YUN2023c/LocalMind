/**
 * 并发控制器模块
 * 用于控制同时进行的API调用数量，避免触发API速率限制
 */

const Store = require('electron-store');

// 默认配置
const DEFAULT_CONFIG = {
    maxConcurrency: 3  // 默认最大并发数：3（避免触发API速率限制）
};

// 并发控制器类
class ConcurrencyController {
    /**
     * 创建并发控制器实例
     * @param {Object} config - 配置对象
     * @param {number} config.maxConcurrency - 最大并发数
     */
    constructor(config = {}) {
        this.store = new Store({ name: 'concurrency-config' });
        
        // 合并配置：优先使用存储的配置，否则使用传入的配置，最后使用默认配置
        const storedConfig = this.store.get('concurrency', {});
        this.config = {
            maxConcurrency: config.maxConcurrency ?? storedConfig.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency
        };
        
        // 当前正在执行的任务数量
        this.runningCount = 0;
        
        // 等待执行的任务队列
        this.taskQueue = [];
        
        // 保存配置
        this.saveConfig();
        
        console.log(`[并发控制器] 初始化完成 - 最大并发数: ${this.config.maxConcurrency}`);
    }
    
    /**
     * 从存储中加载配置
     */
    loadConfig() {
        const storedConfig = this.store.get('concurrency', {});
        if (storedConfig && storedConfig.maxConcurrency) {
            this.config.maxConcurrency = storedConfig.maxConcurrency;
            console.log(`[并发控制器] 已加载配置 - 最大并发数: ${this.config.maxConcurrency}`);
        }
    }
    
    /**
     * 保存配置到存储
     */
    saveConfig() {
        this.store.set('concurrency', {
            maxConcurrency: this.config.maxConcurrency
        });
    }
    
    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     * @param {number} newConfig.maxConcurrency - 最大并发数
     */
    updateConfig(newConfig) {
        if (newConfig.maxConcurrency !== undefined) {
            this.config.maxConcurrency = newConfig.maxConcurrency;
            this.saveConfig();
            console.log(`[并发控制器] 配置已更新 - 最大并发数: ${this.config.maxConcurrency}`);
            
            // 配置更新后，尝试处理队列中等待的任务
            this.processQueue();
        }
    }
    
    /**
     * 获取当前配置
     * @returns {Object} 当前配置
     */
    getConfig() {
        return { ...this.config };
    }
    
    /**
     * 获取当前运行状态
     * @returns {Object} 运行状态
     */
    getStatus() {
        return {
            maxConcurrency: this.config.maxConcurrency,
            runningCount: this.runningCount,
            queuedCount: this.taskQueue.length,
            availableSlots: this.config.maxConcurrency - this.runningCount
        };
    }
    
    /**
     * 检查是否可以开始执行新任务
     * @returns {boolean} 是否可以开始执行
     */
    canStart() {
        return this.runningCount < this.config.maxConcurrency;
    }
    
    /**
     * 处理等待队列
     */
    processQueue() {
        // 如果有可用槽位且队列不为空，则取出队首任务执行
        while (this.canStart() && this.taskQueue.length > 0) {
            const nextTask = this.taskQueue.shift();
            if (nextTask && nextTask.resolve) {
                this.runningCount++;
                nextTask.resolve();
            }
        }
    }
    
    /**
     * 获取执行槽位
     * 如果有可用槽位则立即返回，否则等待直到有可用槽位
     * @returns {Promise<void>} 获取槽位成功后resolve
     */
    async acquireSlot() {
        // 如果有可用槽位，直接占用一个并返回
        if (this.canStart()) {
            this.runningCount++;
            console.log(`[并发控制器] 获取槽位成功 - 运行中: ${this.runningCount}, 可用: ${this.config.maxConcurrency - this.runningCount}`);
            return;
        }
        
        // 如果没有可用槽位，加入等待队列
        console.log(`[并发控制器] 槽位不足，加入队列等待 - 运行中: ${this.runningCount}, 队列: ${this.taskQueue.length}`);
        
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ resolve, reject });
        }).then(() => {
            console.log(`[并发控制器] 等待结束，获取槽位成功 - 运行中: ${this.runningCount}, 可用: ${this.config.maxConcurrency - this.runningCount}`);
        });
    }
    
    /**
     * 释放执行槽位
     * 任务完成后调用此方法释放槽位
     */
    releaseSlot() {
        if (this.runningCount > 0) {
            this.runningCount--;
            console.log(`[并发控制器] 释放槽位 - 运行中: ${this.runningCount}, 可用: ${this.config.maxConcurrency - this.runningCount}`);
            
            // 处理等待队列中的下一个任务
            this.processQueue();
        } else {
            console.warn('[并发控制器] 试图释放槽位但当前没有运行中的任务');
        }
    }
    
    /**
     * 执行带并发控制的任务
     * @param {Function} task - 要执行的任务函数（必须是async函数）
     * @returns {Promise<any>} 任务执行结果
     */
    async execute(task) {
        // 获取执行槽位
        await this.acquireSlot();
        
        try {
            // 执行任务
            const result = await task();
            return result;
        } finally {
            // 任务完成后释放槽位
            this.releaseSlot();
        }
    }
    
    /**
     * 批量执行带并发控制的任务
     * @param {Array} tasks - 任务数组，每个元素是一个返回Promise的函数
     * @param {Function} progressCallback - 进度回调函数
     * @returns {Promise<Array>} 所有任务的结果数组
     */
    async executeAll(tasks, progressCallback) {
        const results = [];
        let completed = 0;
        
        // 创建带进度跟踪的任务包装器
        const wrappedTasks = tasks.map((task, index) => async () => {
            const result = await this.execute(task);
            completed++;
            
            if (progressCallback) {
                progressCallback({
                    completed,
                    total: tasks.length,
                    progress: Math.round((completed / tasks.length) * 100),
                    index
                });
            }
            
            return result;
        });
        
        // 并发执行所有任务
        await Promise.all(wrappedTasks.map(wrapped => wrapped()));
        
        return results;
    }
    
    /**
     * 等待指定时间
     * @param {number} ms - 等待时间（毫秒）
     * @returns {Promise<void>}
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 清空等待队列
     */
    clearQueue() {
        // 拒绝队列中的所有待处理任务
        this.taskQueue.forEach(item => {
            if (item.reject) {
                item.reject(new Error('队列已清空'));
            }
        });
        this.taskQueue = [];
        console.log('[并发控制器] 队列已清空');
    }
    
    /**
     * 重置控制器状态
     */
    reset() {
        this.clearQueue();
        this.runningCount = 0;
        console.log('[并发控制器] 已重置');
    }
}

// 创建并导出单例实例
const concurrencyController = new ConcurrencyController();

module.exports = {
    ConcurrencyController,
    concurrencyController,
    DEFAULT_CONFIG
};
