const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    startDrag: (event) => ipcRenderer.send('window:startDrag', event),
    restoreFromMaximize: (event) => ipcRenderer.send('window:restoreFromMaximize', event),
    moveWindow: () => ipcRenderer.send('window:moveWindow'),
    endDragRestore: () => ipcRenderer.send('window:endDragRestore'),
    onWindowStateChanged: (callback) => ipcRenderer.on('window:stateChanged', (event, isMaximized) => callback(isMaximized))
  },
  config: {
    get: (key, defaultValue) => ipcRenderer.invoke('config:get', key, defaultValue),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    has: (key) => ipcRenderer.invoke('config:has', key),
    delete: (key) => ipcRenderer.invoke('config:delete', key),
    clear: () => ipcRenderer.invoke('config:clear')
  },
  app: {
    getPath: (name) => ipcRenderer.invoke('app:getPath', name),
    goToMain: () => ipcRenderer.invoke('app:goToMain')
  },
  db: {
    getDocuments: () => ipcRenderer.invoke('db:getDocuments'),
    getDocumentsPaginated: (offset, limit) => ipcRenderer.invoke('db:getDocumentsPaginated', offset, limit),
    searchDocuments: (query) => ipcRenderer.invoke('db:searchDocuments', query),
    searchDocumentsPaginated: (query, offset, limit) => ipcRenderer.invoke('db:searchDocumentsPaginated', query, offset, limit),
    getDocumentsByTag: (tag) => ipcRenderer.invoke('db:getDocumentsByTag', tag),
    getDocumentsByTagPaginated: (tag, offset, limit) => ipcRenderer.invoke('db:getDocumentsByTagPaginated', tag, offset, limit),
    getDocumentWithRelations: (id) => ipcRenderer.invoke('db:getDocumentWithRelations', id),
    getAllTags: () => ipcRenderer.invoke('db:getAllTags'),
    toggleFavorite: (id) => ipcRenderer.invoke('db:toggleFavorite', id),
    getFavoriteDocuments: () => ipcRenderer.invoke('db:getFavoriteDocuments'),
    getFavoriteDocumentsPaginated: (offset, limit) => ipcRenderer.invoke('db:getFavoriteDocumentsPaginated', offset, limit),
    updateDocument: (doc) => ipcRenderer.invoke('db:updateDocument', doc),
    getDatabaseSize: () => ipcRenderer.invoke('db:getDatabaseSize'),
    deleteDocument: (id) => ipcRenderer.invoke('db:deleteDocument', id),
    deleteDocumentsNotUnderPath: (basePath) => ipcRenderer.invoke('db:deleteDocumentsNotUnderPath', basePath)
  },
  scan: {
    scanDocuments: (directory, options) => ipcRenderer.invoke('scan', directory, options),
    analyzeDocuments: (options) => ipcRenderer.invoke('analyze', options),
    generateSummaries: (docIds) => ipcRenderer.invoke('generateSummaries', docIds),
    generateSummariesWithTask: (docIds) => ipcRenderer.invoke('generateSummariesWithTask', docIds),
    onScanProgress: (callback) => ipcRenderer.on('scan:progress', (event, data) => callback(data)),
    removeScanProgressListener: () => ipcRenderer.removeAllListeners('scan:progress')
  },
  // 知识图谱：调用本地算法（关键词共现 + 力导向布局）生成文档知识图谱
  graph: {
    generate: (text, options) => ipcRenderer.invoke('graph:generate', text, options)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('selectFolder'),
    selectFiles: () => ipcRenderer.invoke('selectFiles'),
    copyFile: (sourcePath, targetDir) => ipcRenderer.invoke('copyFile', { sourcePath, targetDir }),
    checkFileExists: (filePath) => ipcRenderer.invoke('checkFileExists', filePath),
    validatePdf: (filePath) => ipcRenderer.invoke('validatePdf', filePath),
    readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
    deleteFile: (filePath) => ipcRenderer.invoke('deleteFile', filePath),
    getDocumentHtml: (filePath) => ipcRenderer.invoke('getDocumentHtml', filePath),
    createNewDocument: (targetDir, extension) => ipcRenderer.invoke('createNewDocument', { targetDir, extension }),
    openFileWithDefaultApp: (filePath) => ipcRenderer.invoke('openFileWithDefaultApp', filePath)
  },
  qa: {
    askQuestion: (question) => ipcRenderer.invoke('qa:askQuestion', question),
    askQuestionStream: (question, tokenSaveMode) => ipcRenderer.invoke('qa:askQuestionStream', question, tokenSaveMode),
    // onStreamChunk 必须幂等：先 removeAllListeners 再 on，避免重复提交时绑定多个监听器
    // 导致同一份数据被多次处理（即"处理重复"渲染 bug 的根因之一）
    onStreamChunk: (callback) => { ipcRenderer.removeAllListeners('qa:streamChunk'); ipcRenderer.on('qa:streamChunk', (event, data) => callback(data)); },
    removeStreamChunkListener: () => ipcRenderer.removeAllListeners('qa:streamChunk'),
    stopStream: () => ipcRenderer.invoke('qa:stopStream'),
    testApi: () => ipcRenderer.invoke('qa:testApi')
  },
  rateLimiter: {
    getConfig: () => ipcRenderer.invoke('rateLimiter:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('rateLimiter:updateConfig', config),
    getStatus: () => ipcRenderer.invoke('rateLimiter:getStatus')
  },
  concurrency: {
    getConfig: () => ipcRenderer.invoke('concurrency:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('concurrency:updateConfig', config),
    getStatus: () => ipcRenderer.invoke('concurrency:getStatus')
  },
  keychain: {
    saveApiKey: (apiKey) => ipcRenderer.invoke('keychain:saveApiKey', apiKey),
    getApiKey: () => ipcRenderer.invoke('keychain:getApiKey'),
    migrateApiKey: () => ipcRenderer.invoke('keychain:migrateApiKey'),
    getStorageMethod: () => ipcRenderer.invoke('keychain:getStorageMethod')
  },
  task: {
    getTasks: () => ipcRenderer.invoke('task:getTasks'),
    getActiveCount: () => ipcRenderer.invoke('task:getActiveCount'),
    hasActiveTasks: () => ipcRenderer.invoke('task:hasActiveTasks'),
    addTask: (options) => ipcRenderer.invoke('task:addTask', options),
    cancelTask: (taskId) => ipcRenderer.invoke('task:cancelTask', taskId),
    clearCompleted: () => ipcRenderer.invoke('task:clearCompleted'),
    onTaskAdded: (callback) => ipcRenderer.on('task:added', (event, task) => callback(task)),
    onTaskStarted: (callback) => ipcRenderer.on('task:started', (event, task) => callback(task)),
    onTaskProgress: (callback) => ipcRenderer.on('task:progress', (event, task, progress, message) => callback(task, progress, message)),
    onTaskCompleted: (callback) => ipcRenderer.on('task:completed', (event, task) => callback(task)),
    onTaskFailed: (callback) => ipcRenderer.on('task:failed', (event, task, error) => callback(task, error)),
    onTaskCancelled: (callback) => ipcRenderer.on('task:cancelled', (event, task) => callback(task))
  },
  taskWindow: {
    show: () => ipcRenderer.invoke('task-window:show'),
    hide: () => ipcRenderer.invoke('task-window:hide'),
    isVisible: () => ipcRenderer.invoke('task-window:isVisible'),
    onClosed: (callback) => ipcRenderer.on('task-window:closed', () => callback())
  },
  localModel: {
    download: () => ipcRenderer.invoke('localModel:download'),
    load: () => ipcRenderer.invoke('localModel:load'),
    unload: () => ipcRenderer.invoke('localModel:unload'),
    getDownloadStatus: () => ipcRenderer.invoke('localModel:getDownloadStatus'),
    getModelStatus: () => ipcRenderer.invoke('localModel:getModelStatus'),
    isDownloaded: () => ipcRenderer.invoke('localModel:isDownloaded'),
    delete: () => ipcRenderer.invoke('localModel:delete'),
    getInfo: () => ipcRenderer.invoke('localModel:getInfo'),
    setLlmMode: (mode) => ipcRenderer.invoke('localModel:setLlmMode', mode),
    getLlmMode: () => ipcRenderer.invoke('localModel:getLlmMode'),
    onDownloadProgress: (callback) => ipcRenderer.on('localModel:downloadProgress', (event, data) => callback(data)),
    removeDownloadProgressListener: () => ipcRenderer.removeAllListeners('localModel:downloadProgress')
  }
});