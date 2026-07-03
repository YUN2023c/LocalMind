/**
 * keychain-service.js - 安全的API密钥存储服务
 * 
 * 实现安全的API密钥存储功能，支持：
 * 1. 系统密钥库 (keytar) - Windows Credential Manager
 * 2. 加密文件存储 (crypto) - 备选方案
 * 3. electron-store 明文存储 - 最后降级方案
 */

const crypto = require('crypto');
const Store = require('electron-store');

// 加密配置
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// 密钥库服务名称和账户名
const SERVICE_NAME = 'LocalMind';
const ACCOUNT_NAME = 'api-key';

// 生成或加载加密密钥
let encryptionKey = null;

/**
 * 初始化加密密钥
 * 密钥基于机器特定信息生成，确保本地存储的安全性
 */
function initEncryptionKey() {
    if (encryptionKey) {
        return encryptionKey;
    }

    const store = new Store({ name: 'keychain-encryption' });
    let keyHex = store.get('encryptionKey');

    if (!keyHex) {
        // 生成新的加密密钥
        encryptionKey = crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
        keyHex = encryptionKey.toString('hex');
        store.set('encryptionKey', keyHex);
    } else {
        encryptionKey = Buffer.from(keyHex, 'hex');
    }

    return encryptionKey;
}

/**
 * 使用AES-256-GCM加密数据
 * @param {string} plaintext - 要加密的明文
 * @returns {string} 加密后的数据（base64格式：iv:authTag:ciphertext）
 */
function encrypt(plaintext) {
    const key = initEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // 格式: iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * 解密数据
 * @param {string} encryptedData - 加密的数据（base64格式）
 * @returns {string} 解密后的明文
 */
function decrypt(encryptedData) {
    const key = initEncryptionKey();
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
        throw new Error('加密数据格式无效');
    }
    
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

/**
 * 密钥存储服务类
 * 支持多种后端存储，按优先级依次尝试：
 * 1. keytar - 系统密钥库
 * 2. 加密文件 - 使用crypto模块
 * 3. electron-store明文 - 最后降级
 */
class KeychainService {
    constructor() {
        this.keytar = null;
        this.fallbackStore = new Store({ name: 'keychain-fallback' });
        this.useEncryptedFallback = false;
        this.usePlaintextFallback = false;
        
        this._initKeytar();
    }

    /**
     * 尝试初始化keytar模块
     * @private
     */
    _initKeytar() {
        try {
            // keytar在Electron环境中需要特殊处理
            this.keytar = require('keytar');
        } catch (err) {
            console.warn('[Keychain] keytar模块不可用:', err.message);
            this.keytar = null;
        }
    }

    /**
     * 检查keytar是否可用
     * @returns {boolean}
     */
    isKeytarAvailable() {
        return this.keytar !== null;
    }

    /**
     * 保存API密钥
     * @param {string} apiKey - API密钥
     * @returns {Promise<boolean>} 保存是否成功
     */
    async saveApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('无效的API密钥');
        }

        // 优先使用keytar
        if (this.keytar) {
            try {
                await this.keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
                console.log('[Keychain] API密钥已保存到系统密钥库');
                return true;
            } catch (err) {
                console.warn('[Keychain] keytar保存失败:', err.message);
            }
        }

        // 降级到加密存储
        try {
            const encrypted = encrypt(apiKey);
            this.fallbackStore.set('encryptedApiKey', encrypted);
            this.fallbackStore.set('storageMethod', 'encrypted');
            this.useEncryptedFallback = true;
            console.log('[Keychain] API密钥已加密保存到本地');
            return true;
        } catch (err) {
            console.error('[Keychain] 加密存储失败:', err.message);
        }

        // 最后降级到明文存储（不推荐）
        try {
            this.fallbackStore.set('apiKey', apiKey);
            this.fallbackStore.set('storageMethod', 'plaintext');
            this.usePlaintextFallback = true;
            console.warn('[Keychain] 警告: API密钥以明文形式存储（不推荐）');
            return true;
        } catch (err) {
            console.error('[Keychain] 明文存储失败:', err.message);
            throw new Error('无法保存API密钥');
        }
    }

    /**
     * 获取API密钥
     * @returns {Promise<string|null>} API密钥或null
     */
    async getApiKey() {
        // 优先使用keytar
        if (this.keytar) {
            try {
                const apiKey = await this.keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
                if (apiKey) {
                    return apiKey;
                }
            } catch (err) {
                console.warn('[Keychain] keytar读取失败:', err.message);
            }
        }

        // 尝试加密存储
        const storageMethod = this.fallbackStore.get('storageMethod', 'encrypted');
        
        if (storageMethod === 'encrypted') {
            const encrypted = this.fallbackStore.get('encryptedApiKey');
            if (encrypted) {
                try {
                    return decrypt(encrypted);
                } catch (err) {
                    console.error('[Keychain] 解密失败:', err.message);
                }
            }
        }

        // 降级到明文存储
        if (storageMethod === 'plaintext') {
            const apiKey = this.fallbackStore.get('apiKey');
            if (apiKey) {
                console.warn('[Keychain] 警告: 使用明文存储的API密钥');
                return apiKey;
            }
        }

        return null;
    }

    /**
     * 删除API密钥
     * @returns {Promise<boolean>} 删除是否成功
     */
    async deleteApiKey() {
        let success = true;

        // 尝试从keytar删除
        if (this.keytar) {
            try {
                await this.keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
                console.log('[Keychain] 已从系统密钥库删除API密钥');
            } catch (err) {
                console.warn('[Keychain] keytar删除失败:', err.message);
            }
        }

        // 清除加密存储
        try {
            this.fallbackStore.delete('encryptedApiKey');
            this.fallbackStore.delete('apiKey');
            this.fallbackStore.delete('storageMethod');
        } catch (err) {
            console.error('[Keychain] 清除本地存储失败:', err.message);
            success = false;
        }

        return success;
    }

    /**
     * 检查是否有存储的API密钥
     * @returns {Promise<boolean>}
     */
    async hasApiKey() {
        const apiKey = await this.getApiKey();
        return apiKey !== null && apiKey.length > 0;
    }

    /**
     * 获取当前存储方法
     * @returns {string} 存储方法: 'keytar', 'encrypted', 'plaintext', 'none'
     */
    getStorageMethod() {
        if (this.keytar) {
            return 'keytar';
        }
        return this.fallbackStore.get('storageMethod', 'none');
    }

    /**
     * 将现有electron-store中的API密钥迁移到安全存储
     * @param {Store} electronStore - electron-store实例
     * @returns {Promise<boolean>} 迁移是否成功
     */
    async migrateFromElectronStore(electronStore) {
        const localmind = electronStore.get('localmind', {});
        const apiKey = localmind.apiKey;

        if (!apiKey) {
            return false;
        }

        // 检查是否已经迁移过
        const migrationFlag = electronStore.get('keychainMigrated', false);
        if (migrationFlag) {
            console.log('[Keychain] 密钥已迁移过，跳过');
            return false;
        }

        try {
            await this.saveApiKey(apiKey);
            
            // 标记迁移完成（不清除旧数据以便回滚）
            electronStore.set('keychainMigrated', true);
            
            console.log('[Keychain] API密钥已成功迁移到安全存储');
            return true;
        } catch (err) {
            console.error('[Keychain] 迁移失败:', err.message);
            return false;
        }
    }

    /**
     * 清除electron-store中的明文API密钥
     * 仅在迁移确认成功后调用
     * @param {Store} electronStore - electron-store实例
     */
    clearElectronStoreApiKey(electronStore) {
        const localmind = electronStore.get('localmind', {});
        if (localmind.apiKey) {
            delete localmind.apiKey;
            electronStore.set('localmind', localmind);
            console.log('[Keychain] 已清除electron-store中的明文API密钥');
        }
    }
}

// 导出单例
const keychainService = new KeychainService();

module.exports = keychainService;
