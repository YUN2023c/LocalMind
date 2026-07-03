let currentStep = 1;
const totalSteps = 3;

function initBinaryRain() {
    const canvas = document.getElementById('binary-rain');
    const ctx = canvas.getContext('2d');

    let width, height;
    let chars = [];

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    class Char {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * -height;
            this.speed = 1 + Math.random() * 3;
            this.char = Math.random() > 0.5 ? '1' : '0';
            this.fontSize = 10 + Math.random() * 8;
            this.opacity = 0.3 + Math.random() * 0.5;
        }

        update() {
            this.y += this.speed;

            if (Math.random() < 0.05) {
                this.char = Math.random() > 0.5 ? '1' : '0';
            }

            if (this.y > height) {
                this.reset();
            }
        }

        draw() {
            ctx.font = this.fontSize + 'px Consolas, Monaco, Courier New';
            ctx.fillStyle = 'rgba(8, 219, 119, ' + this.opacity + ')';
            ctx.shadowColor = '#0fdc78';
            ctx.shadowBlur = 10;
            ctx.fillText(this.char, this.x, this.y);
            ctx.shadowBlur = 0;
        }
    }

    function initChars() {
        chars = [];
        const count = Math.floor((width * height) / 1500);
        for (let i = 0; i < count; i++) {
            chars.push(new Char());
        }
    }

    function animate() {
        ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
        ctx.fillRect(0, 0, width, height);

        chars.forEach(function(char) {
            char.update();
            char.draw();
        });

        requestAnimationFrame(animate);
    }

    resize();
    initChars();
    animate();

    window.addEventListener('resize', function() {
        resize();
        initChars();
    });
}

async function loadConfig() {
    try {
        const config = await window.electronAPI.config.get('localmind');
        if (config) {
            document.getElementById('apiUrl').value = config.apiUrl || '';
            document.getElementById('apiKey').value = config.apiKey || '';
            document.getElementById('modelName').value = config.modelName || 'gpt-4o-mini';
            document.getElementById('studyFolder').value = config.studyFolder || '';
        } else {
            document.getElementById('modelName').value = 'gpt-4o-mini';
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        document.getElementById('modelName').value = 'gpt-4o-mini';
    }
}

function updateProgress() {
    const progress = (currentStep / totalSteps) * 100;
    document.getElementById('progressFill').style.width = progress + '%';

    const indicators = document.querySelectorAll('.step-indicator');
    indicators.forEach((indicator, index) => {
        if (index < currentStep) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    });
}

function showStep(stepId) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(stepId).classList.add('active');
}

function skipApi() {
    currentStep = 2;
    updateProgress();
    showStep('stepFolder');
}

function nextStep() {
    if (currentStep === 1) {
        const apiUrl = document.getElementById('apiUrl').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();

        if (!apiUrl) {
            showError('apiUrl', '请输入 API URL');
            return;
        }

        if (!apiKey) {
            showError('apiKey', '请输入 API Key');
            return;
        }

        hideError('apiUrl');
        hideError('apiKey');
    }

    currentStep++;
    updateProgress();

    if (currentStep === 2) {
        showStep('stepFolder');
    } else if (currentStep === 3) {
        showStep('stepComplete');
    }
}

function prevStep() {
    currentStep--;
    updateProgress();

    if (currentStep === 1) {
        showStep('stepApi');
    } else if (currentStep === 2) {
        showStep('stepFolder');
    }
}

async function selectFolder() {
    try {
        const result = await window.electronAPI.dialog.selectFolder();
        if (result && result.filePaths && result.filePaths.length > 0) {
            document.getElementById('studyFolder').value = result.filePaths[0];
            hideError('studyFolder');
        }
    } catch (error) {
        console.error('选择文件夹失败:', error);
    }
}

async function completeSetup() {
    const studyFolder = document.getElementById('studyFolder').value.trim();

    if (!studyFolder) {
        showError('studyFolder', '请选择学习资料文件夹');
        return;
    }

    hideError('studyFolder');

    const rawApiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const hasApiConfig = rawApiUrl && apiKey;
    
    const config = {
        apiUrl: normalizeApiUrl(rawApiUrl),
        apiKey: apiKey,
        modelName: document.getElementById('modelName').value.trim() || 'gpt-4o-mini',
        studyFolder: studyFolder,
        setupCompleted: true,
        llmMode: hasApiConfig ? 'remote' : 'local'
    };

    try {
        await window.electronAPI.config.set('localmind', config);
        nextStep();
    } catch (error) {
        console.error('保存配置失败:', error);
        alert('保存配置失败，请重试');
    }
}

/**
 * 规范化 API URL
 * 自动将 Base URL 补全为完整的 API 端点路径
 */
function normalizeApiUrl(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }

    let normalized = url.trim();

    // 去除末尾多余的斜杠
    while (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }

    // 如果已经是完整路径，直接返回
    if (normalized.endsWith('/chat/completions')) {
        return normalized;
    }

    // 追加端点路径
    return normalized + '/chat/completions';
}

function goToSetup() {
    document.getElementById('welcomeCard').style.display = 'none';
    document.getElementById('setupCard').style.display = 'block';
}

async function goToMain() {
    try {
        await window.electronAPI.app.goToMain();
    } catch (error) {
        console.error('跳转主界面失败:', error);
        window.location.href = '../index.html';
    }
}

function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    field.style.borderColor = '#ef4444';
    
    let errorDiv = field.parentElement.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        field.parentElement.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

function hideError(fieldId) {
    const field = document.getElementById(fieldId);
    field.style.borderColor = '';
    
    const errorDiv = field.parentElement.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.classList.remove('show');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadConfig();
    updateProgress();
});
