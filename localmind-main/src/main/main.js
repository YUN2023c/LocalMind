const { app, BrowserWindow, Menu, ipcMain, dialog, screen, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

app.setName('LocalMind');

const store = new Store();

const {
    getAllDocuments,
    searchDocuments,
    getDocumentsByTag,
    getDocumentWithRelations,
    getAllTags,
    toggleFavorite,
    getFavoriteDocuments,
    updateDocument,
    getDatabaseSize,
    deleteDocument,
    deleteDocumentsNotUnderPath,
    getDocumentsPaginated,
    getFavoriteDocumentsPaginated,
    searchDocumentsPaginated,
    getDocumentsByTagPaginated
} = require('./database');

const { scanDirectory, extractHtmlFromFile } = require('./document-scanner');
const { generateGraph } = require('./knowledge-graph');
const { batchAnalyze, extractSummary, setUserDataPath } = require('./llm-analyzer');
const { askQuestion, askQuestionStream } = require('./qa-service');
const { validateConfig, callLlmApi, callLlmApiStream, getRateLimiterConfig, updateRateLimiterConfig, getRateLimiterStatus, getConcurrencyConfig, updateConcurrencyConfig, getConcurrencyStatus } = require('./llm-analyzer');
const { TaskQueue, TaskStatus } = require('./task-queue');
const taskLog = require('./task-log');
const localModelService = require('./local-model-service');

const taskQueue = new TaskQueue({ maxConcurrent: 3 });

// 任务队列窗口
let taskQueueWindow = null;
let isTaskWindowReady = false;

// 创建任务队列窗口
function createTaskQueueWindow() {
    if (taskQueueWindow && !taskQueueWindow.isDestroyed()) {
        taskQueueWindow.show();
        return taskQueueWindow;
    }

    isTaskWindowReady = false;

    const windowWidth = 320;
    const windowHeight = 320;
    const padding = 20;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const x = padding;
    const y = screenHeight - windowHeight - padding;
    
    taskQueueWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: x,
        y: y,
        minWidth: 280,
        minHeight: 300,
        frame: false,
        transparent: false,
        alwaysOnTop: true,
        resizable: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    taskQueueWindow.loadFile(path.join(__dirname, '../windows/task-queue/index.html'));

    // 窗口准备好后发送现有任务
    taskQueueWindow.webContents.on('did-finish-load', () => {
        isTaskWindowReady = true;
        // 发送当前主题
        const theme = global.mainWindow.webContents.executeJavaScript('document.body.classList.contains("theme-dark")');
        theme.then(isDark => {
            if (taskQueueWindow && !taskQueueWindow.isDestroyed()) {
                taskQueueWindow.webContents.send('theme:change', isDark ? 'dark' : 'light');
            }
        });
        // 发送所有现有任务
        const allTasks = taskQueue.getTasks();
        allTasks.forEach(task => {
            if (taskQueueWindow && !taskQueueWindow.isDestroyed()) {
                taskQueueWindow.webContents.send('task:added', task);
            }
        });
    });

    // 窗口关闭时清理引用
    taskQueueWindow.on('closed', () => {
        taskQueueWindow = null;
        isTaskWindowReady = false;
    });

    return taskQueueWindow;
}

// 显示任务队列窗口
function showTaskQueueWindow() {
    if (!taskQueueWindow || taskQueueWindow.isDestroyed()) {
        createTaskQueueWindow();
    } else {
        taskQueueWindow.show();
    }
}

// 隐藏任务队列窗口
function hideTaskQueueWindow() {
    if (taskQueueWindow && !taskQueueWindow.isDestroyed()) {
        taskQueueWindow.hide();
    }
}

// 发送任务事件到窗口
function sendTaskToWindow(eventName, ...args) {
    if (taskQueueWindow && !taskQueueWindow.isDestroyed() && isTaskWindowReady) {
        taskQueueWindow.webContents.send(eventName, ...args);
    }
}

app.commandLine.appendSwitch('lang', 'zh-CN');

Menu.setApplicationMenu(null);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    show: false,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'app-icon.ico') : path.join(__dirname, '../../../logo/ai-logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const config = store.get('localmind');
  console.log('Store path:', store.path);
  console.log('localmind config:', JSON.stringify(config));
  console.log('Has setupCompleted:', config ? config.setupCompleted : 'N/A');
  console.log('Has apiUrl:', config ? !!config.apiUrl : 'N/A');
  console.log('Has studyFolder:', config ? !!config.studyFolder : 'N/A');
  
  if (config && config.setupCompleted && config.studyFolder) {
    mainWindow.loadFile('index.html');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/welcome.html'));
  }

  global.mainWindow = mainWindow;

  // 窗口在界面框架首次绘制完成时再显示，避免 transparent 窗口出现"任务栏图标已出现但窗口仍空白"的阶段
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 手动维护窗口最大化状态，避免 transparent 窗口在 Windows 上 maximize/unmaximize API 不稳定
  // isWindowMaximized: 当前是否处于最大化状态
  // normalBounds: 最大化前窗口的 bounds，用于还原
  let isWindowMaximized = false;
  let normalBounds = mainWindow.getBounds();

  // 标志位：标记是否正在从最大化状态拖拽恢复
  // 拖拽恢复过程中，move 事件不应触发自动最大化，避免与恢复操作冲突
  global.isRestoringFromDrag = false;

  // 窗口移动事件：拖到屏幕顶部(y<=5)自动最大化
  // 拖拽恢复过程中跳过，防止恢复时窗口又被自动最大化
  mainWindow.on('move', () => {
    if (global.isRestoringFromDrag || isWindowMaximized) return;
    const bounds = mainWindow.getBounds();

    if (bounds.y <= 5) {
      // 保存当前 bounds 作为还原尺寸，然后模拟最大化
      normalBounds = { ...bounds };
      const workArea = screen.getPrimaryDisplay().workArea;
      isWindowMaximized = true;
      mainWindow.setBounds(workArea);
      mainWindow.webContents.send('window:stateChanged', true);
    } else {
      // 非最大化状态下，记录当前窗口位置尺寸作为还原基准
      normalBounds = { ...bounds };
    }
  });

  // 窗口 resize 时（非最大化状态），更新 normalBounds
  mainWindow.on('resize', () => {
    if (!isWindowMaximized && !global.isRestoringFromDrag) {
      normalBounds = mainWindow.getBounds();
    }
  });

  // 暴露给 IPC handler 使用
  global.isWindowMaximized = () => isWindowMaximized;
  global.normalBounds = () => normalBounds;
  global.setWindowMaximized = (value) => { isWindowMaximized = value; };
  global.setNormalBounds = (bounds) => { normalBounds = bounds; };

  // 主窗口关闭事件处理
  // 需求：当有活动任务（待执行或正在执行）时，点击关闭按钮应先阻止窗口关闭，
  // 弹出确认框让用户选择；用户选择"强制退出"后才真正退出应用。
  // 实现思路：
  // 1) 通过 global 全局标志位避免用户已经确认退出后，close 事件被二次触发时再次弹窗
  // 2) 通过 isConfirmDialogShowing 标志位避免用户在弹窗未关闭前再次点击关闭按钮时重复弹窗
  // 3) 用户选择"取消"时，不做任何处理，窗口保持打开
  // 4) 用户选择"强制退出"时，标记 isQuittingConfirmed 并调用 app.quit()，
  //    之后 before-quit 事件会先触发并清空任务日志，再真正关闭应用
  global.isQuittingConfirmed = global.isQuittingConfirmed || false;
  global.isConfirmDialogShowing = global.isConfirmDialogShowing || false;

  mainWindow.on('close', (event) => {
    // 用户已确认退出时（例如通过 app.quit() 触发的关闭），不再拦截，让窗口正常关闭
    if (global.isQuittingConfirmed) {
      return;
    }

    // 确认对话框已显示时，再次拦截 close 事件，避免重复弹窗
    if (global.isConfirmDialogShowing) {
      event.preventDefault();
      return;
    }

    // 仅当存在活动任务时才需要弹窗确认
    if (taskQueue.hasActiveTasks()) {
      // 阻止窗口关闭，先与用户确认
      event.preventDefault();

      const activeCount = taskQueue.getActiveTaskCount();
      global.isConfirmDialogShowing = true;

      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '确认退出',
        message: `当前有 ${activeCount} 个任务正在执行或排队中，确定要退出吗？`,
        detail: '强制退出会导致这些任务中断，可能产生不完整的数据。',
        buttons: ['取消', '强制退出'],
        defaultId: 0,
        cancelId: 0
      }).then((result) => {
        // 无论用户选了什么，弹窗已关闭，重置标志位
        global.isConfirmDialogShowing = false;

        // 用户选择"强制退出"（buttons 中索引为 1 的项）
        if (result.response === 1) {
          // 标记已确认退出，避免 close 事件再次弹窗
          global.isQuittingConfirmed = true;
          // 触发应用退出，before-quit 事件会先清空任务日志
          app.quit();
        }
        // 用户选择"取消"则不做任何处理，窗口保持打开
      });
    }
  });
}

if (process.platform === 'win32') {
    app.setAppUserModelId('com.localmind.app');
}

app.whenReady().then(() => {
  createWindow();

  // 启动时自动预加载本地模型（无论当前模式如何，只要模型已下载就加载）
  setTimeout(async () => {
    try {
      const userDataPathValue = app.getPath('userData');
      if (localModelService.isModelDownloaded(userDataPathValue)) {
        console.log('[预加载] 检测到本地模型已下载，尝试自动加载...');
        const loadResult = await localModelService.loadModel(userDataPathValue);
        if (loadResult.success) {
          console.log('[预加载] 本地模型自动加载成功');
        } else {
          console.warn('[预加载] 本地模型自动加载失败:', loadResult.error);
        }
      }
    } catch (error) {
      console.error('[预加载] 自动加载本地模型时出错:', error.message);
    }
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 软件退出前清除任务日志，避免重启后出现残留任务
app.on('before-quit', () => {
    taskLog.clearAll();
});

// 监听所有窗口关闭事件
// 任务确认弹窗的逻辑已经移到 mainWindow 的 close 事件中（见 createWindow 函数内），
// 这样可以在窗口关闭前阻止关闭并弹窗提示用户。
// 此处只需在非 macOS 平台上正常退出应用即可。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('config:get', (event, key, defaultValue) => {
  return store.get(key, defaultValue);
});

ipcMain.handle('config:set', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('config:has', (event, key) => {
  return store.has(key);
});

ipcMain.handle('config:delete', (event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle('config:clear', () => {
  store.clear();
  return true;
});

ipcMain.handle('app:getPath', (event, name) => {
  return app.getPath(name);
});

ipcMain.handle('db:getDatabaseSize', async () => {
  return await getDatabaseSize();
});

ipcMain.handle('db:deleteDocument', async (event, id) => {
  return await deleteDocument(id);
});

// 删除所有 file_path 不在指定目录下的文档
// 用于用户切换学习资料文件夹时清理旧文件夹的文档
ipcMain.handle('db:deleteDocumentsNotUnderPath', async (event, basePath) => {
  if (!basePath || typeof basePath !== 'string') {
    return { success: false, error: '无效的文件夹路径', deletedCount: 0 };
  }
  try {
    const deletedCount = await deleteDocumentsNotUnderPath(basePath);
    return { success: true, deletedCount: deletedCount };
  } catch (err) {
    return { success: false, error: err.message || String(err), deletedCount: 0 };
  }
});

ipcMain.handle('app:goToMain', (event) => {
  if (global.mainWindow) {
    global.mainWindow.loadFile('index.html');
  }
  return true;
});

ipcMain.handle('db:getDocuments', async () => {
  return await getAllDocuments();
});

ipcMain.handle('db:getDocumentsPaginated', async (event, offset, limit) => {
  return await getDocumentsPaginated(offset, limit);
});

ipcMain.handle('db:searchDocuments', async (event, query) => {
  return await searchDocuments(query);
});

ipcMain.handle('db:searchDocumentsPaginated', async (event, query, offset, limit) => {
  return await searchDocumentsPaginated(query, offset, limit);
});

ipcMain.handle('db:getDocumentsByTag', async (event, tag) => {
  return await getDocumentsByTag(tag);
});

ipcMain.handle('db:getDocumentsByTagPaginated', async (event, tag, offset, limit) => {
  return await getDocumentsByTagPaginated(tag, offset, limit);
});

ipcMain.handle('db:getDocumentWithRelations', async (event, id) => {
  return await getDocumentWithRelations(id);
});

ipcMain.handle('db:getAllTags', async () => {
  return await getAllTags();
});

ipcMain.handle('db:toggleFavorite', async (event, id) => {
  return await toggleFavorite(id);
});

ipcMain.handle('db:getFavoriteDocuments', async () => {
  return await getFavoriteDocuments();
});

ipcMain.handle('db:getFavoriteDocumentsPaginated', async (event, offset, limit) => {
  return await getFavoriteDocumentsPaginated(offset, limit);
});

ipcMain.handle('db:updateDocument', async (event, doc) => {
  return await updateDocument(doc);
});

ipcMain.handle('scan', async (event, directory, options) => {
  if (!directory) {
    throw new Error('扫描目录不能为空');
  }
  const scanOptions = { ...(options || {}) };
  scanOptions.onProgress = (progress, currentFile, currentIndex, totalFiles) => {
    event.sender.send('scan:progress', {
      progress,
      currentFile,
      currentIndex,
      totalFiles
    });
  };
  return await scanDirectory(directory, scanOptions);
});

ipcMain.handle('analyze', async (event, options) => {
  const { docIds, skipAnalyzed } = options || {};
  
  let documents = [];
  if (docIds && docIds.length > 0) {
    documents = await Promise.all(
      docIds.map(id => getDocumentWithRelations(id))
    );
  } else {
    documents = await getAllDocuments();
  }
  
  if (skipAnalyzed) {
    documents = documents.filter(doc => !doc.abstract || doc.abstract.trim().length === 0);
  }
  
  return await batchAnalyze(documents, (progress) => {
    event.sender.send('analyze:progress', progress);
  });
});

ipcMain.handle('generateSummaries', async (event, docIds) => {
  console.log('[生成摘要] 开始处理，文档ID:', docIds);
  
  if (!docIds || docIds.length === 0) {
    throw new Error('请选择要生成摘要的文档');
  }
  
  const config = store.get('localmind', {});
  const llmMode = config.llmMode || 'local';
  
  if (llmMode === 'remote' && (!config.apiUrl || !config.apiKey)) {
    throw new Error('请先在设置中配置 API URL 和 API Key');
  }
  
  const documents = await Promise.all(
    docIds.map(id => getDocumentWithRelations(id))
  );
  
  const docsWithContent = documents.filter(doc => doc.content && doc.content.trim().length > 0);
  
  let success = 0;
  let failed = 0;
  
  for (const doc of docsWithContent) {
    try {
      const summary = await extractSummary(doc.content);
      await updateDocument({ id: doc.id, abstract: summary });
      success++;
    } catch (error) {
      console.error(`[生成摘要] 文档 ${doc.title} 生成失败:`, error);
      failed++;
    }
  }
  
  return { total: docIds.length, processed: docsWithContent.length, success, failed };
});

// 使用任务队列生成摘要
ipcMain.handle('generateSummariesWithTask', async (event, docIds) => {
  const config = store.get('localmind', {});
  const llmMode = config.llmMode || 'local';
  
  if (llmMode === 'remote' && (!config.apiUrl || !config.apiKey)) {
    throw new Error('请先在设置中配置 API URL 和 API Key');
  }
  
  const documents = await Promise.all(
    docIds.map(id => getDocumentWithRelations(id))
  );
  const docsWithContent = documents.filter(doc => doc.content && doc.content.trim().length > 0);
  
  taskQueue.addTask({
    name: '生成文档摘要',
    description: `为 ${docsWithContent.length} 篇文档生成摘要`,
    type: 'summary',
    total: docsWithContent.length,
    execute: async ({ onProgress }) => {
      let completed = 0;
      
      for (const doc of docsWithContent) {
        try {
          const summary = await extractSummary(doc.content);
          await updateDocument({ id: doc.id, abstract: summary });
          completed++;
          onProgress(Math.round((completed / docsWithContent.length) * 100));
        } catch (error) {
          console.error(`[任务队列] 文档 ${doc.title} 摘要生成失败:`, error);
          completed++;
          onProgress(Math.round((completed / docsWithContent.length) * 100));
        }
      }
      
      return { completed, total: docsWithContent.length };
    }
  });
  
  return { queued: true, count: docsWithContent.length };
});

ipcMain.handle('selectFolder', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择学习资料文件夹',
    message: '请选择包含学习资料的文件夹'
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return {
    canceled: false,
    filePaths: result.filePaths
  };
});

ipcMain.handle('selectFiles', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: '选择文档',
    filters: [
      { name: '支持的文档', extensions: ['pdf', 'md', 'markdown', 'txt', 'html', 'htm', 'doc', 'docx'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return {
    canceled: false,
    filePaths: result.filePaths
  };
});

ipcMain.handle('copyFile', async (event, { sourcePath, targetDir }) => {
  const fs = require('fs');
  const path = require('path');
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  
  return new Promise((resolve, reject) => {
    fs.copyFile(sourcePath, targetPath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(targetPath);
      }
    });
  });
});

ipcMain.handle('checkFileExists', async (event, filePath) => {
  const fs = require('fs');
  return fs.existsSync(filePath);
});

ipcMain.handle('deleteFile', async (event, filePath) => {
  const fs = require('fs');
  const path = require('path');
  
  console.log('===== deleteFile 开始 =====');
  console.log('文件路径:', filePath);
  
  return new Promise((resolve, reject) => {
    try {
      // 1. 检查文件是否存在
      if (!filePath) {
        console.log('文件路径为空');
        resolve({ success: false, error: '文件路径为空' });
        return;
      }
      
      if (!fs.existsSync(filePath)) {
        console.log('文件不存在:', filePath);
        resolve({ success: false, error: '文件不存在', code: 'FILE_NOT_EXISTS' });
        return;
      }
      
      console.log('文件存在，准备删除');
      
      // 2. 检查并移除只读属性
      try {
        const stats = fs.statSync(filePath);
        console.log('文件权限:', stats.mode);
        console.log('是否为只读:', !(stats.mode & 0o200));
        
        if (!(stats.mode & 0o200)) {
          console.log('文件为只读，尝试移除只读属性...');
          fs.chmodSync(filePath, 0o666);
          console.log('已移除只读属性');
        }
      } catch (attrErr) {
        console.log('检查/修改文件属性时出错（继续尝试删除）:', attrErr.message);
      }
      
      // 3. 尝试删除文件
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('删除文件失败:', err);
          console.error('错误代码:', err.code);
          console.error('错误消息:', err.message);
          console.error('系统错误:', err.syscall);
          
          // 返回详细的错误信息
          let errorMessage = err.message;
          let errorCode = 'UNKNOWN_ERROR';
          
          if (err.code === 'EPERM') {
            errorMessage = '权限不足：无法删除文件。可能需要管理员权限。';
            errorCode = 'PERMISSION_DENIED';
          } else if (err.code === 'EBUSY') {
            errorMessage = '文件被占用：文件正在被其他程序使用，请先关闭相关程序。';
            errorCode = 'FILE_IN_USE';
          } else if (err.code === 'ENOENT') {
            errorMessage = '文件不存在：文件可能已被删除或移动。';
            errorCode = 'FILE_NOT_EXISTS';
          } else if (err.code === 'EACCES') {
            errorMessage = '访问被拒绝：没有足够的权限删除此文件。';
            errorCode = 'ACCESS_DENIED';
          }
          
          console.log('===== deleteFile 失败 =====');
          resolve({ success: false, error: errorMessage, code: errorCode, originalError: err.message });
        } else {
          console.log('文件删除成功:', filePath);
          console.log('===== deleteFile 成功 =====');
          resolve({ success: true });
        }
      });
    } catch (error) {
      console.error('deleteFile 异常:', error);
      console.log('===== deleteFile 异常结束 =====');
      resolve({ success: false, error: error.message, code: 'EXCEPTION' });
    }
  });
});

ipcMain.handle('validatePdf', async (event, filePath) => {
  const fs = require('fs');
  const pdfParse = require('pdf-parse');
  
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text || '';
    
    if (text.trim().length === 0) {
      return { valid: false, error: '图片型PDF' };
    }
    
    if (text.trim().length < 100) {
      const pageCount = data.numpages || 1;
      if (pageCount > 1 || text.trim().length < 20) {
        return { valid: false, error: '图片型PDF' };
      }
    }
    
    return { valid: true };
  } catch (error) {
    if (error.message && (error.message.includes('encrypted') || error.message.includes('password'))) {
      return { valid: false, error: '加密PDF' };
    }
    return { valid: false, error: '图片型PDF' };
  }
});

ipcMain.handle('readFile', async (event, filePath) => {
  const fs = require('fs');
  
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      }
    });
  });
});

// 渲染进程通过文件路径获取 Word/TXT 文档的富文本 HTML 预览内容
// 异常时返回 { success: false, error: message }，避免 IPC 抛出导致渲染进程崩溃
ipcMain.handle('getDocumentHtml', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: '无效的文件路径' };
    }
    try {
        const html = await extractHtmlFromFile(filePath);
        return { success: true, html: html };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.handle('createNewDocument', async (event, { targetDir, extension }) => {
    const fs = require('fs');
    const path = require('path');

    if (!targetDir || typeof targetDir !== 'string') {
        throw new Error('无效的目标目录');
    }
    if (!extension || typeof extension !== 'string') {
        throw new Error('无效的文件扩展名');
    }

    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    let filePath;

    if (ext.toLowerCase() === '.doc') {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        let n = 1;
        while (true) {
            const fileName = `${dateStr}_${n}.DOC`;
            filePath = path.join(targetDir, fileName);
            if (!fs.existsSync(filePath)) {
                break;
            }
            n++;
        }
        fs.writeFileSync(filePath, '');
    } else if (ext.toLowerCase() === '.docx') {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        let n = 1;
        while (true) {
            const fileName = `${dateStr}_${n}.DOCX`;
            filePath = path.join(targetDir, fileName);
            if (!fs.existsSync(filePath)) {
                break;
            }
            n++;
        }
        fs.writeFileSync(filePath, '');
    } else {
        let n = 1;
        while (true) {
            const fileName = `新建文档_${n}${ext}`;
            filePath = path.join(targetDir, fileName);
            if (!fs.existsSync(filePath)) {
                break;
            }
            n++;
        }
        fs.writeFileSync(filePath, '');
    }

    return filePath;
});

ipcMain.handle('openFileWithDefaultApp', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('无效的文件路径');
    }
    return await shell.openPath(filePath);
});

// 知识图谱生成：从文档文本生成本地知识图谱（关键词共现 + 力导向布局）
ipcMain.handle('graph:generate', async (event, text, options) => {
    if (!text || typeof text !== 'string') {
        return { success: false, error: '无效的文本内容', graph: { nodes: [], links: [], stats: {} } };
    }
    try {
        const graph = generateGraph(text, options || {});
        return { success: true, graph: graph };
    } catch (err) {
        return { success: false, error: err.message || String(err), graph: { nodes: [], links: [], stats: {} } };
    }
});

ipcMain.handle('qa:askQuestion', async (event, question) => {
  return await askQuestion(question);
});

// 当前流式请求的 AbortController（用于"停止生成"功能）
// 模块级变量：每次开始流式请求前重置为新的 AbortController，请求结束后置 null
let currentAbortController = null;

// 流式问答接口
ipcMain.handle('qa:askQuestionStream', async (event, question, tokenSaveMode) => {
  try {
    // 在主进程内累积流式输出，确保前端收到的是累积的 fullAnswer 而非单次 chunk
    // 引用来源段的修正由 qa-service.js 的 enforceCitationSection 在流式结束后统一处理
    // 不在流式过程中做实时替换，避免每个 chunk 都做字符串分割/正则匹配导致 CPU 飙升和卡顿
    // 注意：后端 onChunk 现已改为发送真实 delta（chunk 参数），前端不再依赖此字段而是用 fullAnswer
    let accumulated = '';
    // 创建本次请求的 AbortController，供 qa:stopStream 中止使用
    currentAbortController = new AbortController();
    // 将 signal 作为第 4 个参数透传给 askQuestionStream → callLlmApiStream → callModelStream
    // 后端在中止时会 resolve 已累积的部分内容（不 reject），保证前端能拿到部分回答
    const result = await askQuestionStream(question, (chunk) => {
      accumulated += chunk;
      // 通过 IPC 发送累积的全部内容到渲染进程（chunk 为本次增量，fullAnswer 为累积全文）
      event.sender.send('qa:streamChunk', { chunk, fullAnswer: accumulated });
    }, tokenSaveMode, currentAbortController.signal);
    console.log('[QA流式] 响应结果:', result.success ? '成功' : '失败', result.error || '');
    return result;
  } catch (error) {
    console.error('[QA流式] 异常:', error.message);
    return { success: false, error: error.message };
  } finally {
    // 请求结束（成功/失败/中止）后清理 AbortController，避免内存泄漏和误中止下次请求
    currentAbortController = null;
  }
});

// 停止流式生成接口：前端调用后中止当前 LLM 流式请求
// 后端会 resolve 已累积的部分内容，前端拿到后照常渲染（不视为错误）
ipcMain.handle('qa:stopStream', async () => {
  if (currentAbortController) {
    currentAbortController.abort();
    return { success: true };
  }
  return { success: false, error: '没有正在进行的流式请求' };
});

ipcMain.handle('qa:testApi', async () => {
    try {
        const configResult = await validateConfig();
        if (!configResult.valid) {
            return { success: false, error: configResult.error };
        }

        console.log('[测试连接] 配置验证通过，开始调用 API...');
        const result = await callLlmApi('你是一个测试助手。请用简短的一句话（不超过20个字）回复"连接正常"，不要加其他内容。', 50);
        console.log('[测试连接] API 返回:', result);
        
        // 只要API能正常返回非空内容，就认为连接成功
        // 不同模型对"OK"的理解和回复方式不同，不应严格匹配"OK"
        if (result && typeof result === 'string' && result.trim().length > 0) {
            return { success: true, message: 'API 连接测试成功！', response: result.trim() };
        } else {
            return { success: false, error: 'API 返回内容为空，请检查配置' };
        }
    } catch (error) {
        console.error('[测试连接] 错误:', error);
        console.error('[测试连接] 错误详情:', error.message, error.code);
        return { success: false, error: error.message };
    }
});

// 速率限制器配置接口
ipcMain.handle('rateLimiter:getConfig', () => {
    return getRateLimiterConfig();
});

ipcMain.handle('rateLimiter:updateConfig', (event, config) => {
    try {
        updateRateLimiterConfig(config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('rateLimiter:getStatus', () => {
    return getRateLimiterStatus();
});

// 并发控制器配置接口
ipcMain.handle('concurrency:getConfig', () => {
    return getConcurrencyConfig();
});

ipcMain.handle('concurrency:updateConfig', (event, config) => {
    try {
        updateConcurrencyConfig(config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('concurrency:getStatus', () => {
    return getConcurrencyStatus();
});

// 密钥存储服务接口
ipcMain.handle('keychain:saveApiKey', async (event, apiKey) => {
    try {
        await saveApiKey(apiKey);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('keychain:getApiKey', async () => {
    try {
        const apiKey = await getApiKey();
        return { success: true, apiKey: apiKey || '' };
    } catch (error) {
        return { success: false, error: error.message, apiKey: '' };
    }
});

ipcMain.handle('keychain:migrateApiKey', async () => {
    try {
        const migrated = await migrateApiKey();
        return { success: true, migrated };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('keychain:getStorageMethod', () => {
    return getStorageMethod();
});

taskQueue.on('taskAdded', (task) => {
    console.log('[TaskQueue] taskAdded:', task);
    
    // 写入日志文件
    taskLog.addTask(task);
    
    // 自动显示任务队列窗口
    showTaskQueueWindow();
    
    // 发送到主窗口
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('task:added', task);
    }
    
    // 发送到任务队列窗口
    sendTaskToWindow('task:added', task);
});

taskQueue.on('taskStarted', (task) => {
    console.log('[TaskQueue] taskStarted:', task);
    
    // 更新日志文件
    taskLog.updateTask(task.id, { ...task, status: 'running' });
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('task:started', task);
    }
    sendTaskToWindow('task:started', task);
});

taskQueue.on('taskProgress', (task, progress, message) => {
    console.log('[TaskQueue] taskProgress:', task.id, progress);
    
    // 更新日志文件
    taskLog.updateTask(task.id, { ...task, progress });
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('task:progress', task, progress, message);
    }
    sendTaskToWindow('task:progress', task, progress, message);
});

taskQueue.on('taskCompleted', (task) => {
    console.log('[TaskQueue] taskCompleted:', task);
    
    // 更新日志文件
    taskLog.updateTask(task.id, { ...task, status: 'completed', progress: 100 });
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('task:completed', task);
    }
    sendTaskToWindow('task:completed', task);
});

taskQueue.on('taskFailed', (task, error) => {
    console.log('[TaskQueue] taskFailed:', task, error);
    
    // 更新日志文件
    taskLog.updateTask(task.id, { ...task, status: 'failed', error: error.message });
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('task:failed', task, error.message);
    }
    sendTaskToWindow('task:failed', task, error.message);
});

taskQueue.on('taskCancelled', (task) => {
    console.log('[TaskQueue] taskCancelled:', task);
    
    // 更新日志文件
    taskLog.updateTask(task.id, { ...task, status: 'cancelled' });
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('task:cancelled', task);
    }
    sendTaskToWindow('task:cancelled', task);
});

ipcMain.handle('task:getTasks', () => {
    return taskQueue.getTasks();
});

ipcMain.handle('task:getActiveCount', () => {
    return taskQueue.getActiveTaskCount();
});

ipcMain.handle('task:hasActiveTasks', () => {
    return taskQueue.hasActiveTasks();
});

ipcMain.handle('task:addTask', async (event, options) => {
    return taskQueue.addTask(options);
});

ipcMain.handle('task:cancelTask', (event, taskId) => {
    return taskQueue.cancelTask(taskId);
});

ipcMain.handle('task:clearCompleted', () => {
    taskQueue.clearCompleted();
    taskLog.clearCompleted();
    return true;
});

// 任务日志文件路径
ipcMain.handle('task:getLogPath', () => {
    return taskLog.getTaskLogPath();
});

// 主窗口控制
ipcMain.on('window:minimize', () => {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.minimize();
    }
});

// 最大化/还原切换（按钮点击）
// 使用 ipcMain.handle 返回 Promise，让渲染进程可以等待操作完成
// 由于 transparent 窗口在 Windows 上 maximize/unmaximize API 不稳定，使用手动状态管理
ipcMain.handle('window:maximize', () => {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        const win = global.mainWindow;
        if (global.isWindowMaximized()) {
            // 还原：使用保存的 normalBounds，若不存在则使用默认居中尺寸
            global.isRestoringFromDrag = true;
            const bounds = global.normalBounds() || {};
            const screenSize = screen.getPrimaryDisplay().workAreaSize;
            const defaultX = Math.floor((screenSize.width - 1200) / 2);
            const defaultY = Math.max(50, Math.floor((screenSize.height - 750) / 2));
            win.setBounds({
                width: bounds.width || 1200,
                height: bounds.height || 750,
                x: typeof bounds.x === 'number' ? bounds.x : defaultX,
                y: typeof bounds.y === 'number' ? bounds.y : defaultY
            });
            global.setWindowMaximized(false);
            global.isRestoringFromDrag = false;
            win.webContents.send('window:stateChanged', false);
            return false;
        } else {
            // 最大化：保存当前 bounds，然后设置为主显示器工作区大小
            global.setNormalBounds(win.getBounds());
            const workArea = screen.getPrimaryDisplay().workArea;
            win.setBounds(workArea);
            global.setWindowMaximized(true);
            win.webContents.send('window:stateChanged', true);
            return true;
        }
    }
    return false;
});

ipcMain.on('window:close', () => {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.close();
    }
});

ipcMain.handle('window:isMaximized', () => {
    return global.mainWindow && !global.mainWindow.isDestroyed() && global.isWindowMaximized();
});

// 从最大化状态拖拽恢复
// 当用户在最大化状态下拖拽标题栏时，恢复窗口到常规大小并跟随鼠标移动
// 位置计算：窗口水平居中于鼠标，鼠标位于标题栏顶部下方约20像素处
// 设置 isRestoringFromDrag 标志位，防止 move 事件在恢复过程中触发自动最大化
ipcMain.on('window:restoreFromMaximize', (event, dragEvent) => {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        if (global.isWindowMaximized()) {
            // 获取鼠标在屏幕上的位置
            const cursorPos = screen.getCursorScreenPoint();
            const windowWidth = 1200;
            const windowHeight = 750;

            // 设置标志位，防止 move 事件触发自动最大化
            global.isRestoringFromDrag = true;

            // 先保存新的 normalBounds，再设置窗口为常规大小
            global.setWindowMaximized(false);
            global.setNormalBounds({
                width: windowWidth,
                height: windowHeight,
                x: Math.floor(cursorPos.x - windowWidth / 2),
                y: Math.max(50, Math.floor(cursorPos.y - 20))
            });
            global.mainWindow.setBounds(global.normalBounds());
        }
    }
});

// 拖拽恢复后继续移动窗口
// 根据鼠标屏幕坐标更新窗口位置，保持鼠标在标题栏区域
// 使用 setBounds 同时固定窗口大小，防止 Windows 在拖拽过程中自动改变窗口尺寸
// 如果窗口已最大化（如被拖到顶部自动最大化），则跳过
ipcMain.on('window:moveWindow', (event) => {
    if (global.mainWindow && !global.mainWindow.isDestroyed() && !global.isWindowMaximized()) {
        const cursorPos = screen.getCursorScreenPoint();
        const windowWidth = 1200;
        const windowHeight = 750;
        global.mainWindow.setBounds({
            width: windowWidth,
            height: windowHeight,
            x: Math.floor(cursorPos.x - windowWidth / 2),
            y: Math.max(50, Math.floor(cursorPos.y - 20))
        });
    }
});

// 拖拽恢复结束
// 延迟清除 isRestoringFromDrag 标志位，确保所有 pending 的异步 move 事件都被跳过
// 防止拖拽恢复后窗口在顶部附近时，残余的 move 事件触发自动最大化
ipcMain.on('window:endDragRestore', (event) => {
    const win = global.mainWindow;
    if (win && !win.isDestroyed() && !global.isWindowMaximized()) {
        global.setNormalBounds(win.getBounds());
    }
    setTimeout(() => {
        global.isRestoringFromDrag = false;
    }, 300);
});

// 任务队列窗口控制
ipcMain.on('task-window:minimize', () => {
    hideTaskQueueWindow();
});

ipcMain.on('theme:change', (event, theme) => {
    if (taskQueueWindow && !taskQueueWindow.isDestroyed()) {
        taskQueueWindow.webContents.send('theme:change', theme);
    }
});

ipcMain.on('task-window:close', () => {
    // 清除已完成的任务
    taskLog.clearCompleted();

    // 通知主界面刷新数据
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send('task-window:closed');
    }

    // 关闭任务窗口
    if (taskQueueWindow && !taskQueueWindow.isDestroyed()) {
        taskQueueWindow.destroy();
    }
});

ipcMain.handle('task-window:show', () => {
    showTaskQueueWindow();
});

ipcMain.handle('task-window:hide', () => {
    hideTaskQueueWindow();
});

ipcMain.handle('task-window:isVisible', () => {
    return taskQueueWindow && !taskQueueWindow.isDestroyed() && taskQueueWindow.isVisible();
});

// 本地模型服务 IPC 接口
ipcMain.handle('localModel:download', async (event) => {
    const userDataPath = app.getPath('userData');
    setUserDataPath(userDataPath);
    
    try {
        await localModelService.downloadModel(userDataPath, (progress, message) => {
            event.sender.send('localModel:downloadProgress', { progress, message });
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('localModel:load', async () => {
    const userDataPath = app.getPath('userData');
    setUserDataPath(userDataPath);
    return await localModelService.loadModel(userDataPath);
});

ipcMain.handle('localModel:unload', () => {
    localModelService.unloadModel();
    return { success: true };
});

ipcMain.handle('localModel:getDownloadStatus', () => {
    return localModelService.getDownloadStatus();
});

ipcMain.handle('localModel:getModelStatus', () => {
    return localModelService.getModelStatus();
});

ipcMain.handle('localModel:isDownloaded', () => {
    const userDataPath = app.getPath('userData');
    return localModelService.isModelDownloaded(userDataPath);
});

ipcMain.handle('localModel:delete', () => {
    const userDataPath = app.getPath('userData');
    const result = localModelService.deleteModel(userDataPath);
    return { success: result };
});

ipcMain.handle('localModel:getInfo', () => {
    return localModelService.MODEL_INFO;
});

// 设置 LLM 模式
ipcMain.handle('localModel:setLlmMode', (event, mode) => {
    const localmind = store.get('localmind', {});
    store.set('localmind', { ...localmind, llmMode: mode });
    return { success: true };
});

// 获取当前 LLM 模式
ipcMain.handle('localModel:getLlmMode', () => {
    const localmind = store.get('localmind', {});
    return localmind.llmMode || 'local';
});