const fs = require('fs');
const path = require('path');
const os = require('os');

// 任务日志文件路径
const taskLogPath = path.join(os.tmpdir(), 'localmind-tasks.json');

/**
 * 获取任务日志文件路径
 */
function getTaskLogPath() {
    return taskLogPath;
}

/**
 * 读取任务状态
 */
function readTasks() {
    try {
        if (!fs.existsSync(taskLogPath)) {
            return [];
        }
        const content = fs.readFileSync(taskLogPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('[TaskLog] 读取任务日志失败:', error);
        return [];
    }
}

/**
 * 写入任务状态
 */
function writeTasks(tasks) {
    try {
        fs.writeFileSync(taskLogPath, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (error) {
        console.error('[TaskLog] 写入任务日志失败:', error);
    }
}

/**
 * 添加任务
 */
function addTask(task) {
    const tasks = readTasks();
    tasks.push(task);
    writeTasks(tasks);
}

/**
 * 更新任务
 */
function updateTask(taskId, updates) {
    const tasks = readTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) {
        tasks[index] = { ...tasks[index], ...updates };
        writeTasks(tasks);
    }
}

/**
 * 清除已完成的任务
 */
function clearCompleted() {
    const tasks = readTasks();
    const remaining = tasks.filter(t => t.status === 'pending' || t.status === 'running');
    writeTasks(remaining);
    return tasks.length - remaining.length;
}

/**
 * 清空所有任务
 */
function clearAll() {
    writeTasks([]);
}

module.exports = {
    getTaskLogPath,
    readTasks,
    writeTasks,
    addTask,
    updateTask,
    clearCompleted,
    clearAll
};
