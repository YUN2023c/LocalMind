const EventEmitter = require('events');

const TaskStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

class TaskQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        this.queue = [];
        this.runningTasks = [];
        this.maxConcurrent = options.maxConcurrent || 3;
        this.taskIdCounter = 0;
    }

    getNextTaskId() {
        return ++this.taskIdCounter;
    }

    addTask(options) {
        const task = {
            id: this.getNextTaskId(),
            name: options.name || '未命名任务',
            description: options.description || '',
            type: options.type || 'general',
            total: options.total || 1,
            progress: 0,
            status: TaskStatus.PENDING,
            startTime: null,
            endTime: null,
            error: null,
            result: null,
            execute: options.execute
        };

        this.queue.push(task);
        this.emit('taskAdded', task);
        
        this.processNext();
        
        return task;
    }

    async processNext() {
        if (this.runningTasks.length >= this.maxConcurrent) {
            return;
        }

        const pendingTask = this.queue.find(t => t.status === TaskStatus.PENDING);
        if (!pendingTask) {
            return;
        }

        pendingTask.status = TaskStatus.RUNNING;
        pendingTask.startTime = Date.now();
        
        const taskIndex = this.queue.indexOf(pendingTask);
        if (taskIndex !== -1) {
            this.runningTasks.push(pendingTask);
        }

        this.emit('taskStarted', pendingTask);

        try {
            const result = await pendingTask.execute({
                onProgress: (progress, message) => {
                    pendingTask.progress = progress;
                    this.emit('taskProgress', pendingTask, progress, message);
                },
                onStatus: (status) => {
                    pendingTask.status = status;
                    this.emit('taskStatusChanged', pendingTask);
                }
            });

            pendingTask.status = TaskStatus.COMPLETED;
            pendingTask.endTime = Date.now();
            pendingTask.result = result;
            this.emit('taskCompleted', pendingTask);
        } catch (error) {
            pendingTask.status = TaskStatus.FAILED;
            pendingTask.endTime = Date.now();
            pendingTask.error = error.message || error;
            this.emit('taskFailed', pendingTask, error);
        }

        const runningIndex = this.runningTasks.indexOf(pendingTask);
        if (runningIndex !== -1) {
            this.runningTasks.splice(runningIndex, 1);
        }

        this.processNext();
    }

    cancelTask(taskId) {
        const task = this.queue.find(t => t.id === taskId);
        if (task && task.status === TaskStatus.PENDING) {
            task.status = TaskStatus.CANCELLED;
            this.emit('taskCancelled', task);
            return true;
        }
        return false;
    }

    getTasks() {
        return [...this.queue];
    }

    getRunningTasks() {
        return [...this.runningTasks];
    }

    getPendingTasks() {
        return this.queue.filter(t => t.status === TaskStatus.PENDING);
    }

    getCompletedTasks() {
        return this.queue.filter(t => t.status === TaskStatus.COMPLETED);
    }

    getFailedTasks() {
        return this.queue.filter(t => t.status === TaskStatus.FAILED);
    }

    hasActiveTasks() {
        return this.queue.some(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING);
    }

    getActiveTaskCount() {
        return this.queue.filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING).length;
    }

    clearCompleted() {
        const completedCount = this.queue.filter(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED || t.status === TaskStatus.CANCELLED).length;
        this.queue = this.queue.filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING);
        return completedCount;
    }
}

module.exports = {
    TaskQueue,
    TaskStatus
};