let documents = [];
let allTags = [];
let selectedTags = [];
let searchQuery = '';
let currentDoc = null;
let currentMenu = 'all';
let favorites = [];

// 知识图谱视口变换状态：用于平移和缩放
// scale 缩放比例，translateX/translateY 平移偏移量（在 SVG 坐标系中）
let graphViewport = { scale: 1, translateX: 0, translateY: 0 };
// 标记图谱控制按钮是否已初始化（避免重复创建）
let graphControlsInitialized = false;

// 文档列表分页状态
const PAGE_SIZE = 15;
let docPagination = {
    page: 0,
    isLoading: false,
    hasMore: true,
    error: null,
    totalLoaded: 0,
    filterKey: ''
};
let docObserver = null;

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

function highlightText(text, query) {
    if (!query || !text) return text || '';
    const regex = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return text.replace(regex, '<span class="highlight-keyword">$1</span>');
}

async function loadData() {
    try {
        allTags = await window.electronAPI.db.getAllTags();
        renderTagCloud();
        await renderDocuments();
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

async function loadTags() {
    try {
        allTags = await window.electronAPI.db.getAllTags();
        renderTagCloud();
    } catch (error) {
        console.error('加载标签失败:', error);
    }
}

function updateStats() {
    const docCountEl = document.getElementById('docCount');
    const tagCountEl = document.getElementById('tagCount');
    if (docCountEl) docCountEl.textContent = documents.length;
    if (tagCountEl) tagCountEl.textContent = allTags.length;
    updateStorageSize();
}

async function updateStorageSize() {
    try {
        const size = await window.electronAPI.db.getDatabaseSize();
        const storageSizeEl = document.getElementById('storageSize');
        if (storageSizeEl) storageSizeEl.textContent = formatFileSize(size);
    } catch (error) {
        console.error('获取数据库大小失败:', error);
        const storageSizeEl = document.getElementById('storageSize');
        if (storageSizeEl) storageSizeEl.textContent = '0KB';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0KB';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
}

function renderTagCloud() {
    const tagCloud = document.getElementById('tagCloud');
    tagCloud.innerHTML = '';

    const tagCountEl = document.getElementById('tagCount');
    if (tagCountEl) tagCountEl.textContent = allTags.length;

    allTags.forEach(function(tag) {
        const span = document.createElement('span');
        span.className = 'tag ' + (selectedTags.includes(tag) ? 'active' : '');
        span.textContent = tag;
        span.onclick = function() { toggleTag(tag); };
        tagCloud.appendChild(span);
    });
}

function toggleTag(tag) {
    const index = selectedTags.indexOf(tag);
    if (index > -1) {
        selectedTags.splice(index, 1);
    } else {
        selectedTags.push(tag);
    }
    renderTagCloud();
    renderDocuments();
}

function getDocumentsFilterKey() {
    return currentMenu + '|' + searchQuery + '|' + selectedTags.join(',');
}

async function fetchDocumentsPage(page) {
    const offset = page * PAGE_SIZE;
    const limit = PAGE_SIZE;

    if (currentMenu === 'favorites') {
        return await window.electronAPI.db.getFavoriteDocumentsPaginated(offset, limit);
    } else if (searchQuery) {
        return await window.electronAPI.db.searchDocumentsPaginated(searchQuery, offset, limit);
    } else if (selectedTags.length === 1) {
        return await window.electronAPI.db.getDocumentsByTagPaginated(selectedTags[0], offset, limit);
    } else if (selectedTags.length > 1) {
        // 多标签筛选：获取每个标签的文档，计算交集（同时包含所有标签的文档）
        const resultsByTag = await Promise.all(
            selectedTags.map(tag => window.electronAPI.db.getDocumentsByTagPaginated(tag, offset, limit))
        );

        // 计算交集：只保留在所有标签结果中都出现的文档
        if (resultsByTag.length === 0 || resultsByTag[0].length === 0) {
            return [];
        }

        // 使用第一个标签的结果作为基准，筛选出同时存在于其他所有标签结果中的文档
        const baseDocs = resultsByTag[0];
        const intersectedDocs = baseDocs.filter(doc => {
            return resultsByTag.slice(1).every(tagDocs => {
                return tagDocs.some(tagDoc => tagDoc.id === doc.id);
            });
        });

        return intersectedDocs;
    } else {
        return await window.electronAPI.db.getDocumentsPaginated(offset, limit);
    }
}

function renderEmptyState(list) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 20px; color: var(--text-secondary); min-height: 400px;';
    if (selectedTags.length > 1) {
        // 多标签筛选无结果时的特殊提示
        emptyMsg.innerHTML = '<div style="width: 64px; height: 64px; margin-bottom: 16px;"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div><div style="font-size: 16px; margin-bottom: 8px;">没有同时包含这些标签的文档</div><div style="font-size: 13px;">当前选择了 ' + selectedTags.length + ' 个标签，但没有文档同时包含所有这些标签</div>';
    } else if (currentMenu === 'favorites') {
        emptyMsg.innerHTML = '<div style="width: 64px; height: 64px; margin-bottom: 16px;"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div style="font-size: 16px; margin-bottom: 8px;">暂无收藏文档</div><div style="font-size: 13px;">点击文档卡片上的星标按钮添加收藏</div>';
    } else if (currentMenu === 'recent') {
        emptyMsg.innerHTML = '<div style="width: 64px; height: 64px; margin-bottom: 16px;"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div style="font-size: 16px; margin-bottom: 8px;">最近没有打开</div><div style="font-size: 13px;">点击文档卡片查看详情后，会显示在这里</div>';
    } else {
        emptyMsg.innerHTML = '<div style="width: 64px; height: 64px; margin-bottom: 16px;"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div><div style="font-size: 16px; margin-bottom: 8px;">暂无文档</div>';
    }
    list.appendChild(emptyMsg);
}

function renderDocumentCard(doc, list) {
    const card = document.createElement('div');
    card.className = 'document-card';

    const favoriteBtn = document.createElement('button');
    favoriteBtn.className = 'favorite-btn' + (doc.favorite === 1 ? ' active' : '');
    favoriteBtn.innerHTML = doc.favorite === 1 ? '★' : '☆';
    favoriteBtn.onclick = function(e) {
        e.stopPropagation();
        toggleFavorite(doc.id);
    };

    const headerDiv = document.createElement('div');
    headerDiv.className = 'doc-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'doc-title';
    titleSpan.innerHTML = highlightText(doc.title, searchQuery);

    const metaSpan = document.createElement('span');
    metaSpan.className = 'doc-meta';
    metaSpan.textContent = doc.year || '';

    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(favoriteBtn);
    headerDiv.appendChild(metaSpan);

    card.appendChild(headerDiv);

    const authorDiv = document.createElement('div');
    authorDiv.className = 'doc-author';
    authorDiv.innerHTML = highlightText(doc.author || '', searchQuery);
    card.appendChild(authorDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'doc-content';
    if (doc.abstract && doc.abstract.trim().length > 0) {
        contentDiv.innerHTML = highlightText(doc.abstract, searchQuery);
    } else if (doc.keywords && doc.keywords.length > 0) {
        contentDiv.innerHTML = '<span class="no-abstract">✦ 关键词: ' + doc.keywords.join(' / ') + '</span>';
    } else {
        contentDiv.innerHTML = '<span class="no-abstract">✦ 暂无摘要</span>';
    }
    card.appendChild(contentDiv);

    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'doc-tags';
    tagsDiv.innerHTML = doc.tags && doc.tags.length > 0 ?
        doc.tags.map(function(tag) {
            return '<span class="doc-tag ' + (selectedTags.includes(tag) ? 'highlight' : '') + '">' + tag + '</span>';
        }).join('') : '';
    card.appendChild(tagsDiv);

    card.onclick = function() { openModal(doc.id); };
    list.appendChild(card);

    // 添加带圆角的分隔线
    const divider = document.createElement('div');
    divider.className = 'doc-divider';
    list.appendChild(divider);
}

function renderDocListStatus(statusEl, status) {
    if (!statusEl) return;

    switch (status) {
        case 'loading':
            statusEl.innerHTML = '<div class="doc-loading"><div class="doc-loading-spinner"></div><span>加载中...</span></div>';
            break;
        case 'error':
            statusEl.innerHTML = '<div class="doc-error"><span>加载失败，请重试</span><button onclick="retryLoadDocuments()">重试</button></div>';
            break;
        case 'no-more':
            statusEl.innerHTML = '<div class="doc-no-more">— 没有更多文档了 —</div>';
            break;
        default:
            statusEl.innerHTML = '';
    }
}

async function loadDocumentsPage(isLoadMore) {
    const list = document.getElementById('documentList');
    const statusEl = document.getElementById('docListStatus');
    const filterKey = getDocumentsFilterKey();

    // 过滤条件变化时重置分页状态
    if (!isLoadMore || docPagination.filterKey !== filterKey) {
        docPagination = {
            page: 0,
            isLoading: false,
            hasMore: true,
            error: null,
            totalLoaded: 0,
            filterKey: filterKey
        };
        documents = [];
        list.innerHTML = '';
    }

    if (docPagination.isLoading || !docPagination.hasMore || docPagination.error) {
        return;
    }

    docPagination.isLoading = true;
    docPagination.error = null;
    renderDocListStatus(statusEl, 'loading');

    try {
        const pageDocs = await fetchDocumentsPage(docPagination.page);

        if (pageDocs.length === 0) {
            docPagination.hasMore = false;
            renderDocListStatus(statusEl, docPagination.totalLoaded === 0 ? '' : 'no-more');
            if (docPagination.totalLoaded === 0) {
                renderEmptyState(list);
            }
            docPagination.isLoading = false;
            return;
        }

        // 去重，防止多标签查询时同一文档重复出现
        const existingIds = new Set(documents.map(function(d) { return d.id; }));
        let newDocs = pageDocs.filter(function(d) { return !existingIds.has(d.id); });

        // recent 菜单需要过滤并按最后查看时间排序
        if (currentMenu === 'recent') {
            newDocs = newDocs.filter(function(doc) { return doc.last_viewed !== null; });
            newDocs.sort(function(a, b) {
                return new Date(b.last_viewed || 0) - new Date(a.last_viewed || 0);
            });
        }

        documents = documents.concat(newDocs);
        docPagination.totalLoaded += newDocs.length;

        newDocs.forEach(function(doc) {
            renderDocumentCard(doc, list);
        });

        // 如果本页返回数量不足一页，说明已无更多数据
        if (pageDocs.length < PAGE_SIZE) {
            docPagination.hasMore = false;
            renderDocListStatus(statusEl, 'no-more');
        } else {
            renderDocListStatus(statusEl, '');
        }

        docPagination.page++;
        updateStats();

    } catch (error) {
        console.error('获取文档失败:', error);
        docPagination.error = error;
        renderDocListStatus(statusEl, 'error');
    } finally {
        docPagination.isLoading = false;
    }
}

async function renderDocuments() {
    await loadDocumentsPage(false);
}

async function loadMoreDocuments() {
    await loadDocumentsPage(true);
}

function retryLoadDocuments() {
    docPagination.error = null;
    loadMoreDocuments();
}

function initDocPaginationObserver() {
    const sentinel = document.getElementById('docSentinel');
    const main = document.querySelector('main');
    if (!sentinel || !main) return;

    if (docObserver) {
        docObserver.disconnect();
    }

    docObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting && !docPagination.isLoading && docPagination.hasMore && !docPagination.error) {
                loadMoreDocuments();
            }
        });
    }, {
        root: main,
        rootMargin: '200px 0px 0px 0px',
        threshold: 0
    });

    docObserver.observe(sentinel);
}

async function toggleFavorite(docId) {
    try {
        await window.electronAPI.db.toggleFavorite(docId);
        await loadData();
    } catch (error) {
        console.error('切换收藏失败:', error);
    }
}

function cleanTextForPreview(text) {
    if (!text) return '';
    
    let cleaned = text;
    
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');
    
    cleaned = cleaned.replace(/^\s*#+\s*/gm, '');
    cleaned = cleaned.replace(/^\s*[-*+]\s*/gm, '');
    cleaned = cleaned.replace(/^\s*\d+[\.\)]\s*/gm, '');
    cleaned = cleaned.replace(/^\s*>\s*/gm, '');
    
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/_{2}(.+?)_{2}/g, '$1');
    cleaned = cleaned.replace(/_(.+?)_/g, '$1');
    cleaned = cleaned.replace(/`{3}[^`]*`{3}/g, '');
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
    
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    cleaned = cleaned.replace(/\[([^\]]+)\]/g, '$1');
    
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    
    cleaned = cleaned.replace(/[^\u0020-\u007E\u00A0-\u00FF\u2000-\u206F\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4e00-\u9fff\uff00-\uffef\n\r]/g, '');
    
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    
    cleaned = cleaned.trim();
    
    return cleaned;
}

function textToHtml(text) {
    const cleaned = cleanTextForPreview(text);
    if (!cleaned) return '';
    const escaped = cleaned.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/\n/g, '<br>');
}

async function openModal(docId) {
    try {
        const doc = await window.electronAPI.db.getDocumentWithRelations(docId);
        if (!doc) return;

        currentDoc = doc;

        doc.last_viewed = new Date().toISOString();
        await window.electronAPI.db.updateDocument(doc);

        const modal = document.getElementById('documentModal');

        document.getElementById('modalTitle').textContent = doc.title;
        document.getElementById('modalAbstract').innerHTML = 
            doc.abstract && doc.abstract.trim() ? 
                textToHtml(doc.abstract) : 
                '<span class="no-abstract">暂无摘要</span>';
        document.getElementById('deleteAbstractBtn').style.display = 
            doc.abstract && doc.abstract.trim() ? 'inline-block' : 'none';
        document.getElementById('modalContent').innerHTML = textToHtml(doc.content || '');

        document.getElementById('modalKeywords').innerHTML =
            doc.keywords && doc.keywords.length > 0 ?
                doc.keywords.map(function(k) { return '<span class="keyword-tag">' + k + '</span>'; }).join('') : '';

        document.getElementById('modalTags').innerHTML =
            doc.tags && doc.tags.length > 0 ?
                doc.tags.map(function(tag) { return '<span class="doc-tag">' + tag + '</span>'; }).join('') : '';

        const pdfSection = document.getElementById('pdfPreviewSection');
        const mdSection = document.getElementById('mdPreviewSection');
        const contentPreviewSection = document.getElementById('contentPreviewSection');
        const wordSection = document.getElementById('wordPreviewSection');

        let isPdf = false;
        let isMd = false;
        let isWord = false;  // .doc / .docx
        let isText = false;  // .txt
        let isHtml = false;  // .html

        if (doc.file_type === 'pdf' || (doc.file_path && doc.file_path.toLowerCase().endsWith('.pdf'))) {
            isPdf = true;
        }
        if (doc.file_type === 'markdown' || (doc.file_path && doc.file_path.toLowerCase().endsWith('.md'))) {
            isMd = true;
        }
        if (doc.file_type === 'doc' || (doc.file_path && doc.file_path.toLowerCase().endsWith('.doc'))) {
            isWord = true;
        }
        if (doc.file_type === 'docx' || (doc.file_path && doc.file_path.toLowerCase().endsWith('.docx'))) {
            isWord = true;
        }
        if (doc.file_type === 'text' || (doc.file_path && doc.file_path.toLowerCase().endsWith('.txt'))) {
            isText = true;
        }
        if (doc.file_type === 'html' || (doc.file_path && doc.file_path.toLowerCase().endsWith('.html'))) {
            isHtml = true;
        }

        console.log('文档信息:', doc.title, 'file_type:', doc.file_type, 'file_path:', doc.file_path, 'isPdf:', isPdf, 'isMd:', isMd, 'isWord:', isWord, 'isText:', isText, 'isHtml:', isHtml);

        if (isPdf && doc.file_path) {
            pdfSection.style.display = 'block';
            mdSection.style.display = 'none';
            contentPreviewSection.style.display = 'none';
            wordSection.style.display = 'none';
            console.log('显示 PDF 预览');
        } else if (isMd && doc.file_path) {
            pdfSection.style.display = 'none';
            mdSection.style.display = 'block';
            contentPreviewSection.style.display = 'none';
            wordSection.style.display = 'none';
            console.log('显示 MD 预览');
        } else if ((isWord || isText) && doc.file_path) {
            pdfSection.style.display = 'none';
            mdSection.style.display = 'none';
            contentPreviewSection.style.display = 'none';
            wordSection.style.display = 'block';
            console.log('显示 Word/TXT 预览');
        } else if (isHtml && doc.file_path) {
            pdfSection.style.display = 'none';
            mdSection.style.display = 'none';
            contentPreviewSection.style.display = 'none';
            wordSection.style.display = 'block';
            console.log('显示 HTML 预览');
        } else {
            pdfSection.style.display = 'none';
            mdSection.style.display = 'none';
            contentPreviewSection.style.display = 'block';
            wordSection.style.display = 'none';
            console.log('显示内容预览');
        }

        switchTab('detail');
        modal.classList.add('active');

        if (isPdf && doc.file_path) {
            initPdfViewer(doc.file_path);
        } else if (isMd && doc.file_path) {
            initMdViewer(doc.file_path);
        } else if ((isWord || isText) && doc.file_path) {
            loadWordPreview(doc.file_path);
        } else if (isHtml && doc.file_path) {
            loadHtmlPreview(doc.file_path);
        }
    } catch (error) {
        console.error('打开文档详情失败:', error);
    }
}

// 加载 Word/TXT 文档的富文本 HTML 预览
// 通过 IPC 调用主进程的 extractHtmlFromFile，将返回的 HTML 注入 wordViewer 容器
async function loadWordPreview(filePath) {
    const viewer = document.getElementById('wordViewer');
    if (!viewer) {
        console.error('未找到 wordViewer 容器');
        return;
    }
    // 初始加载提示
    viewer.innerHTML = '<div class="word-loading">正在加载文档预览...</div>';
    try {
        const result = await window.electronAPI.dialog.getDocumentHtml(filePath);
        if (result && result.success && result.html) {
            viewer.innerHTML = result.html;
        } else {
            const errMsg = (result && result.error) ? result.error : '未知错误';
            viewer.innerHTML = '<div class="word-error">文档预览不可用：' + errMsg + '</div>';
        }
    } catch (err) {
        console.error('加载 Word/TXT 预览失败:', err);
        viewer.innerHTML = '<div class="word-error">文档预览不可用：' + (err.message || err) + '</div>';
    }
}

async function loadHtmlPreview(filePath) {
    const viewer = document.getElementById('wordViewer');
    if (!viewer) {
        console.error('未找到 wordViewer 容器');
        return;
    }
    viewer.innerHTML = '<div class="word-loading">正在加载 HTML 预览...</div>';
    try {
        const result = await window.electronAPI.dialog.getDocumentHtml(filePath);
        if (result && result.success && result.html) {
            viewer.innerHTML = result.html;
        } else {
            const errMsg = (result && result.error) ? result.error : '未知错误';
            viewer.innerHTML = '<div class="word-error">HTML 预览不可用：' + errMsg + '</div>';
        }
    } catch (err) {
        console.error('加载 HTML 预览失败:', err);
        viewer.innerHTML = '<div class="word-error">HTML 预览不可用：' + (err.message || err) + '</div>';
    }
}

function closeModal() {
    const modal = document.getElementById('documentModal');
    modal.classList.remove('active');
}

async function openCurrentDocInEditor() {
    if (!currentDoc || !currentDoc.file_path) {
        showToast('无法获取文档路径');
        return;
    }
    try {
        await window.electronAPI.dialog.openFileWithDefaultApp(currentDoc.file_path);
    } catch (error) {
        console.error('打开文档失败:', error);
        showToast('打开文档失败: ' + error.message);
    }
}

async function deleteCurrentDocument() {
    if (!currentDoc) return;
    if (!confirm('确定要删除这篇文档吗？此操作不可撤销。')) return;

    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    try {
        loadingText.textContent = '正在删除文档...';
        loadingOverlay.style.display = 'flex';

        const docId = currentDoc.id;
        const docPath = currentDoc.file_path;

        await window.electronAPI.db.deleteDocument(docId);

        if (docPath) {
            await window.electronAPI.dialog.deleteFile(docPath);
        }

        closeModal();
        await loadData();

        loadingOverlay.style.display = 'none';
        showToast('文档已删除');
    } catch (error) {
        console.error('删除文档失败:', error);
        loadingOverlay.style.display = 'none';
        showToast('删除失败: ' + error.message);
    }
}

async function deleteCurrentDocAbstract() {
    if (!currentDoc) return;
    if (!confirm('确定要删除这篇文档的摘要吗？')) return;
    
    try {
        await window.electronAPI.db.updateDocument({ id: currentDoc.id, abstract: null });
        await loadData();
        
        // 刷新当前文档详情
        await openModal(currentDoc.id);
        
        showToast('摘要已删除');
    } catch (error) {
        console.error('删除摘要失败:', error);
        showToast('删除失败: ' + error.message);
    }
}

function switchTab(tab) {
    document.querySelectorAll('.modal-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.modal-tab').forEach(function(t) {
        if ((tab === 'detail' && t.textContent.includes('详情')) ||
            (tab === 'graph' && t.textContent.includes('图谱'))) {
            t.classList.add('active');
        }
    });

    document.getElementById('tabDetail').style.display = tab === 'detail' ? 'block' : 'none';
    document.getElementById('tabGraph').style.display = tab === 'graph' ? 'block' : 'none';

    if (tab === 'graph' && currentDoc) {
        renderGraph();
    }
}

// 渲染知识图谱：调用本地算法（关键词共现 + 力导向布局）生成图谱并用 SVG 绘制
// 算法在主进程 knowledge-graph.js 中实现，通过 graph:generate IPC 调用
async function renderGraph() {
    const svg = document.getElementById('graphSvg');
    const container = svg.parentElement;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    // 设置 SVG 视口
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = '';

    // 重置视口变换状态（每次重新渲染都回到默认 1 倍缩放、无平移）
    graphViewport = { scale: 1, translateX: 0, translateY: 0 };

    // 加载中提示
    const loadingText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    loadingText.setAttribute('x', width / 2);
    loadingText.setAttribute('y', height / 2);
    loadingText.setAttribute('text-anchor', 'middle');
    loadingText.setAttribute('dominant-baseline', 'middle');
    loadingText.setAttribute('fill', '#08db77');
    loadingText.setAttribute('font-size', '14');
    loadingText.textContent = '正在生成知识图谱...';
    svg.appendChild(loadingText);

    if (!currentDoc) {
        svg.innerHTML = '';
        renderGraphEmpty(svg, width, height, '请先选择一个文档');
        return;
    }

    // 优先使用文档全文内容生成图谱；若没有 content 则用 abstract 兜底
    const textSource = (currentDoc.content && currentDoc.content.trim()) ||
                       (currentDoc.abstract && currentDoc.abstract.trim()) ||
                       '';

    if (!textSource) {
        svg.innerHTML = '';
        renderGraphEmpty(svg, width, height, '该文档没有可分析的文本内容');
        return;
    }

    let result;
    try {
        // 调用主进程的本地知识图谱算法
        result = await window.electronAPI.graph.generate(textSource, {
            title: currentDoc.title,
            width: width,
            height: height,
            maxKeywords: 12,
            iterations: 300
        });
    } catch (err) {
        svg.innerHTML = '';
        renderGraphEmpty(svg, width, height, '生成失败：' + (err.message || err));
        return;
    }

    svg.innerHTML = '';

    if (!result || !result.success || !result.graph) {
        renderGraphEmpty(svg, width, height, '生成失败：' + (result && result.error ? result.error : '未知错误'));
        return;
    }

    const graph = result.graph;
    const nodes = graph.nodes || [];
    const links = graph.links || [];

    if (nodes.length === 0) {
        renderGraphEmpty(svg, width, height, '未能从文档中提取到关键词');
        return;
    }

    // 创建视口 <g> 元素：所有节点和边放入其中，通过对它应用 transform 实现整体平移和缩放
    // 统计信息和控制按钮不放入此 group，保持固定位置
    const viewportGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    viewportGroup.setAttribute('id', 'graphViewportGroup');
    svg.appendChild(viewportGroup);

    // 构建 id → node 映射，便于边查找端点
    const nodeMap = new Map();
    nodes.forEach(n => nodeMap.set(n.id, n));

    // ========== 渲染边 ==========
    // 共现边（关键词-关键词）用较粗样式；keyword-link 边（中心-关键词）用细线
    const maxLinkWeight = Math.max(1, ...links.map(l => l.weight || 1));

    links.forEach(function(link) {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', source.x);
        line.setAttribute('y1', source.y);
        line.setAttribute('x2', target.x);
        line.setAttribute('y2', target.y);
        line.setAttribute('data-source', link.source);
        line.setAttribute('data-target', link.target);

        if (link.type === 'cooccurrence') {
            // 共现边：粗细反映共现次数，颜色更突出
            const w = 1 + (link.weight / maxLinkWeight) * 3;
            line.setAttribute('stroke', '#08db77');
            line.setAttribute('stroke-width', w.toFixed(2));
            line.setAttribute('stroke-opacity', (0.3 + 0.5 * (link.weight / maxLinkWeight)).toFixed(2));
        } else {
            // 中心-关键词边：细线，弱化
            line.setAttribute('stroke', '#3a7a5a');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-opacity', '0.4');
            line.setAttribute('stroke-dasharray', '4 3');
        }
        line.classList.add('graph-link');
        viewportGroup.appendChild(line);
    });

    // ========== 渲染节点 ==========
    // 将圆形节点改为文本框
    nodes.forEach(function(node) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('graph-node');
        group.setAttribute('data-id', node.id);

        const isDoc = node.type === 'document';
        const fontSize = isDoc ? 13 : 12;
        let label = node.label || '';
        
        // 计算文本框的尺寸
        let textWidth = 0;
        for (const ch of label) {
            textWidth += /[\u4e00-\u9fa5]/.test(ch) ? fontSize : fontSize * 0.6;
        }
        // 添加内边距
        textWidth += 16; // 左右各8px内边距
        const textHeight = fontSize + 12; // 上下各6px内边距
        
        // 文本框位置（居中对齐）
        const rectX = node.x - textWidth / 2;
        const rectY = node.y - textHeight / 2;

        // 文本框背景
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', rectX);
        rect.setAttribute('y', rectY);
        rect.setAttribute('width', textWidth);
        rect.setAttribute('height', textHeight);
        rect.setAttribute('rx', '8'); // 圆角
        rect.setAttribute('ry', '8');
        // 中心节点用深色，关键词节点用浅色
        rect.setAttribute('fill', isDoc ? '#06b863' : '#0fdc78');
        rect.setAttribute('stroke', isDoc ? '#048c4a' : '#08db77');
        rect.setAttribute('stroke-width', isDoc ? '2' : '1');

        // 文字
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y);
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#ffffff');
        text.setAttribute('font-weight', isDoc ? '600' : '500');
        text.setAttribute('font-size', fontSize);
        text.textContent = label;

        group.appendChild(rect);
        group.appendChild(text);

        // 点击高亮：当前节点及其相邻边/节点高亮，其他淡化
        group.addEventListener('click', function(e) {
            e.stopPropagation();
            const isActive = group.classList.contains('active');
            // 清除所有 active 和 dimmed 状态
            viewportGroup.querySelectorAll('.graph-node').forEach(function(n) {
                n.classList.remove('active', 'dimmed');
            });
            viewportGroup.querySelectorAll('.graph-link').forEach(function(l) {
                l.classList.remove('active', 'dimmed');
            });

            if (isActive) return; // 再次点击取消高亮

            group.classList.add('active');

            // 找出与该节点相邻的边和节点
            const neighborIds = new Set([node.id]);
            viewportGroup.querySelectorAll('.graph-link').forEach(function(line) {
                const s = line.getAttribute('data-source');
                const t = line.getAttribute('data-target');
                if (s === node.id || t === node.id) {
                    line.classList.add('active');
                    neighborIds.add(s);
                    neighborIds.add(t);
                } else {
                    line.classList.add('dimmed');
                }
            });

            // 非相邻节点淡化
            viewportGroup.querySelectorAll('.graph-node').forEach(function(n) {
                const id = n.getAttribute('data-id');
                if (!neighborIds.has(id)) {
                    n.classList.add('dimmed');
                }
            });
        });

        viewportGroup.appendChild(group);
    });

    // 统计信息直接放在 svg 上（不参与缩放，固定在左下角）
    if (graph.stats) {
        const statsText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        statsText.setAttribute('x', 12);
        statsText.setAttribute('y', height - 12);
        statsText.setAttribute('fill', '#6c757d');
        statsText.setAttribute('font-size', '11');
        const s = graph.stats;
        statsText.textContent = `关键词 ${s.keywordCount || 0} · 共现边 ${s.cooccurrenceEdgeCount || 0} · 句子 ${s.sentenceCount || 0}`;
        svg.appendChild(statsText);
    }

    // 初始化图谱交互（平移、缩放、控制按钮），仅绑定一次事件
    initGraphInteraction(svg, container, viewportGroup, width, height);
}

/**
 * 初始化知识图谱的平移和缩放交互
 * - 鼠标滚轮：以鼠标位置为中心缩放
 * - 鼠标拖拽空白处：平移整个图谱
 * - 双击：重置缩放和平移
 * - 控制按钮：放大、缩小、重置
 * 事件绑定只在首次调用时执行，后续调用仅更新 viewportGroup 引用和尺寸
 */
function initGraphInteraction(svg, container, viewportGroup, width, height) {
    // 保存当前 viewportGroup 引用，供事件处理器使用
    svg._viewportGroup = viewportGroup;
    svg._graphWidth = width;
    svg._graphHeight = height;

    // 应用当前变换到 viewportGroup
    function applyTransform() {
        const vg = svg._viewportGroup;
        if (!vg) return;
        vg.setAttribute('transform',
            `translate(${graphViewport.translateX}, ${graphViewport.translateY}) scale(${graphViewport.scale})`);
    }

    // 立即应用一次（默认状态）
    applyTransform();

    // 更新控制按钮的缩放比例显示
    const zoomLabel = document.getElementById('graphZoomLabel');
    if (zoomLabel) {
        zoomLabel.textContent = Math.round(graphViewport.scale * 100) + '%';
    }

    // 只在首次调用时绑定事件和创建控制按钮，避免重复绑定
    if (graphControlsInitialized) return;
    graphControlsInitialized = true;

    // ========== 创建控制按钮（放大 / 缩小 / 重置） ==========
    const controls = document.createElement('div');
    controls.className = 'graph-controls';
    controls.innerHTML = `
        <button class="graph-ctrl-btn" id="graphZoomIn" title="放大">+</button>
        <span class="graph-zoom-label" id="graphZoomLabel">100%</span>
        <button class="graph-ctrl-btn" id="graphZoomOut" title="缩小">−</button>
        <button class="graph-ctrl-btn" id="graphZoomReset" title="重置">⟲</button>
    `;
    container.appendChild(controls);

    // 以 SVG 坐标系中的指定点 (anchorX, anchorY) 为中心进行缩放
    // anchorX/anchorY 是相对于 SVG 左上角的像素坐标
    function zoomAt(anchorX, anchorY, newScale) {
        const s = Math.max(0.3, Math.min(3, newScale));
        if (s === graphViewport.scale) return;
        // 保持锚点在缩放前后位于同一屏幕位置：
        // anchorX = translateX + svgPointX * scale
        // svgPointX = (anchorX - translateX) / scale
        // 缩放后：anchorX = newTranslateX + svgPointX * s
        // 解得：newTranslateX = anchorX - svgPointX * s
        const svgPointX = (anchorX - graphViewport.translateX) / graphViewport.scale;
        const svgPointY = (anchorY - graphViewport.translateY) / graphViewport.scale;
        graphViewport.scale = s;
        graphViewport.translateX = anchorX - svgPointX * s;
        graphViewport.translateY = anchorY - svgPointY * s;
        applyTransform();
        const label = document.getElementById('graphZoomLabel');
        if (label) label.textContent = Math.round(s * 100) + '%';
    }

    // 按钮点击：以画布中心为锚点缩放
    document.getElementById('graphZoomIn').addEventListener('click', function() {
        zoomAt(svg._graphWidth / 2, svg._graphHeight / 2, graphViewport.scale * 1.2);
    });
    document.getElementById('graphZoomOut').addEventListener('click', function() {
        zoomAt(svg._graphWidth / 2, svg._graphHeight / 2, graphViewport.scale / 1.2);
    });
    document.getElementById('graphZoomReset').addEventListener('click', function() {
        graphViewport = { scale: 1, translateX: 0, translateY: 0 };
        applyTransform();
        const label = document.getElementById('graphZoomLabel');
        if (label) label.textContent = '100%';
        // 同时清除节点高亮状态
        svg.querySelectorAll('.graph-node').forEach(function(n) {
            n.classList.remove('active', 'dimmed');
        });
        svg.querySelectorAll('.graph-link').forEach(function(l) {
            l.classList.remove('active', 'dimmed');
        });
    });

    // ========== 滚轮缩放：以鼠标位置为锚点 ==========
    svg.addEventListener('wheel', function(e) {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        const anchorX = e.clientX - rect.left;
        const anchorY = e.clientY - rect.top;
        // 向上滚（deltaY < 0）放大，向下滚缩小
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAt(anchorX, anchorY, graphViewport.scale * factor);
    }, { passive: false });

    // ========== 鼠标拖拽平移 ==========
    let isPanning = false;
    let panStart = { x: 0, y: 0, tx: 0, ty: 0 };
    // 标记本次拖拽是否产生过移动，用于区分"点击空白"和"拖拽结束"
    let panMoved = false;

    svg.addEventListener('mousedown', function(e) {
        // 仅在点击空白处（非节点）时启动平移
        if (e.target.closest('.graph-node')) return;
        isPanning = true;
        panMoved = false;
        panStart = {
            x: e.clientX,
            y: e.clientY,
            tx: graphViewport.translateX,
            ty: graphViewport.translateY
        };
        svg.style.cursor = 'grabbing';
    });

    svg.addEventListener('mousemove', function(e) {
        if (!isPanning) return;
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panMoved = true;
        graphViewport.translateX = panStart.tx + dx;
        graphViewport.translateY = panStart.ty + dy;
        applyTransform();
    });

    function endPan() {
        if (!isPanning) return;
        isPanning = false;
        svg.style.cursor = '';
    }
    svg.addEventListener('mouseup', endPan);
    svg.addEventListener('mouseleave', endPan);

    // 点击空白处取消高亮（仅在未发生拖拽移动时生效）
    svg.addEventListener('click', function(e) {
        if (panMoved) {
            panMoved = false;
            return;
        }
        // 点击节点时节点自己 stopPropagation，不会走到这里
        if (e.target.closest('.graph-node')) return;
        svg.querySelectorAll('.graph-node').forEach(function(n) {
            n.classList.remove('active', 'dimmed');
        });
        svg.querySelectorAll('.graph-link').forEach(function(l) {
            l.classList.remove('active', 'dimmed');
        });
    });

    // 双击重置视口
    svg.addEventListener('dblclick', function(e) {
        if (e.target.closest('.graph-node')) return;
        graphViewport = { scale: 1, translateX: 0, translateY: 0 };
        applyTransform();
        const label = document.getElementById('graphZoomLabel');
        if (label) label.textContent = '100%';
    });
}

// 渲染图谱区域的空状态提示
function renderGraphEmpty(svg, width, height, message) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', width / 2);
    text.setAttribute('y', height / 2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', '#6c757d');
    text.setAttribute('font-size', '14');
    text.textContent = message;
    svg.appendChild(text);
}

async function triggerUpload() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    
    try {
        const localmindConfig = await window.electronAPI.config.get('localmind');
        const studyFolder = localmindConfig ? localmindConfig.studyFolder : null;
        
        if (!studyFolder) {
            showToast('请先在设置中配置学习资料文件夹');
            return;
        }

        // 显示加载动画
        loadingText.textContent = '正在选择文件...';
        loadingOverlay.style.display = 'flex';

        const result = await window.electronAPI.dialog.selectFiles();
        
        if (!result || result.filePaths.length === 0) {
            loadingOverlay.style.display = 'none';
            return;
        }

        // 更新加载文本
        loadingText.textContent = `正在处理 ${result.filePaths.length} 个文件...`;

        let successCount = 0;
        let errorMessages = [];

        for (let i = 0; i < result.filePaths.length; i++) {
            const filePath = result.filePaths[i];
            const fileName = filePath.split(/[/\\]/).pop();
            const targetPath = studyFolder.replace(/[/\\]$/, '') + '\\' + fileName;

            const existsInFolder = await window.electronAPI.dialog.checkFileExists(targetPath);
            
            if (existsInFolder) {
                errorMessages.push(`${fileName} 已存在于学习资料文件夹中`);
                continue;
            }

            const ext = fileName.split('.').pop().toLowerCase();
            
            if (!['pdf', 'md', 'markdown', 'txt', 'html', 'htm', 'doc', 'docx'].includes(ext)) {
                errorMessages.push(`${fileName} 不支持的格式`);
                continue;
            }

            try {
                if (ext === 'pdf') {
                    const pdfResult = await window.electronAPI.dialog.validatePdf(filePath);
                    if (!pdfResult.valid) {
                        errorMessages.push(`${fileName} 是${pdfResult.error}，不支持`);
                        continue;
                    }
                }

                await window.electronAPI.dialog.copyFile(filePath, studyFolder);
                
                successCount++;
            } catch (err) {
                errorMessages.push(`${fileName} 处理失败: ${err.message}`);
            }
        }

        // 更新加载文本
        if (successCount > 0) {
            loadingText.textContent = '正在索引文档...';
        }
        
        if (successCount > 0) {
            await window.electronAPI.scan.scanDocuments(studyFolder);
            await loadData();
            showToast(`成功添加 ${successCount} 个文档`);
        } else if (errorMessages.length > 0) {
            showToast(errorMessages.join('；') || '部分文档添加失败');
        } else {
            showToast('添加失败');
        }

        // 隐藏加载动画
        loadingOverlay.style.display = 'none';

    } catch (error) {
        console.error('添加文档失败:', error);
        showToast('添加文档失败: ' + error.message);
        loadingOverlay.style.display = 'none';
    }
}

function openNewDocumentModal() {
    const modal = document.getElementById('newDocModal');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    window.electronAPI.config.get('localmind').then(function(localmindConfig) {
        const studyFolder = localmindConfig ? localmindConfig.studyFolder : null;

        if (!studyFolder) {
            showToast('请先在设置中配置学习资料文件夹');
            return;
        }

        modal.classList.add('active');
    }).catch(function(error) {
        console.error('获取配置失败:', error);
        showToast('获取配置失败: ' + error.message);
    });
}

function closeNewDocumentModal() {
    const modal = document.getElementById('newDocModal');
    modal.classList.remove('active');
}

async function createNewDocumentByType(type) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    try {
        closeNewDocumentModal();

        loadingText.textContent = '正在创建文档...';
        loadingOverlay.style.display = 'flex';

        const localmindConfig = await window.electronAPI.config.get('localmind');
        const studyFolder = localmindConfig ? localmindConfig.studyFolder : null;

        if (!studyFolder) {
            showToast('请先在设置中配置学习资料文件夹');
            loadingOverlay.style.display = 'none';
            return;
        }

        const filePath = await window.electronAPI.dialog.createNewDocument(studyFolder, type);

        if (filePath) {
            await window.electronAPI.dialog.openFileWithDefaultApp(filePath);
        }

        loadingText.textContent = '正在索引文档...';
        await window.electronAPI.scan.scanDocuments(studyFolder);
        await loadData();

        loadingOverlay.style.display = 'none';
        showToast('文档创建成功');
    } catch (error) {
        console.error('创建文档失败:', error);
        showToast('创建文档失败: ' + error.message);
        loadingOverlay.style.display = 'none';
    }
}

function filterByMenu(menu) {
    currentMenu = menu;
    document.querySelectorAll('.menu-item').forEach(function(item) {
        item.classList.remove('active');
    });
    document.querySelector('.menu-item[data-menu="' + menu + '"]').classList.add('active');

    if (menu === 'settings') {
        openSettingsModal();
        return;
    }

    if (menu === 'qa') {
        showQaView();
        return;
    }

    hideQaView();
    selectedTags = [];
    renderTagCloud();
    renderDocuments();
}

function collapseTagCloudSection() {
    const tagCloudSection = document.getElementById('tagCloudSection');
    if (tagCloudSection) tagCloudSection.classList.add('collapsed');
}

function expandTagCloudSection() {
    const tagCloudSection = document.getElementById('tagCloudSection');
    if (tagCloudSection) tagCloudSection.classList.remove('collapsed');
}

function showQaView() {
    document.getElementById('documentList').style.display = 'none';
    const statusEl = document.getElementById('docListStatus');
    const sentinelEl = document.getElementById('docSentinel');
    if (statusEl) statusEl.style.display = 'none';
    if (sentinelEl) sentinelEl.style.display = 'none';
    document.getElementById('qaContainer').style.display = 'block';
    collapseTagCloudSection();
    renderQaHistory();
    initQaHistoryToggle();
    initTokenSaveMode();
    updateSendButtonState();
}

function hideQaView() {
    document.getElementById('documentList').style.display = 'grid';
    const statusEl = document.getElementById('docListStatus');
    const sentinelEl = document.getElementById('docSentinel');
    if (statusEl) statusEl.style.display = '';
    if (sentinelEl) sentinelEl.style.display = '';
    document.getElementById('qaContainer').style.display = 'none';
    expandTagCloudSection();
}

// 初始化问答历史侧栏切换
let qaHistoryVisible = true;

// ===== 流式渲染状态机 =====
// 将"数据接收"（onStreamChunk 写缓冲）与"视觉渲染"（requestAnimationFrame 推进打字机）解耦，
// 解决高频 IPC 回调直接操作 DOM 导致的掉帧与"处理重复"渲染 bug。
let qaIsLoading = false;        // 请求防抖锁，防止并发请求覆盖（isLoading guard）
let streamBuffer = '';          // 流式累积全文缓冲（由 IPC fullAnswer 更新，不再在回调中操作 DOM）
let displayPosition = 0;        // 打字机当前显示位置（每帧推进，单位：字符）
let rafId = null;               // requestAnimationFrame 句柄，用于取消未完成的渲染循环
let userScrolledUp = false;     // 智能滚动：用户是否主动上滑离开底部（true 时停止自动滚动）
let abortController = null;     // 前端 AbortController，用于"停止生成"（与主进程的 currentAbortController 配合）
let streamEnded = false;        // 流式是否已结束（控制 rAF 是否继续推进剩余缓冲）

function initQaHistoryToggle() {
    const toggleBtn = document.getElementById('qaHistoryToggle');
    const sidebar = document.getElementById('qaHistorySidebar');

    if (!toggleBtn || !sidebar) return;

    // 从localStorage读取状态
    const savedState = localStorage.getItem('qa-history-visible');
    qaHistoryVisible = savedState === 'true';

    updateQaHistorySidebar();

    toggleBtn.onclick = function() {
        qaHistoryVisible = !qaHistoryVisible;
        localStorage.setItem('qa-history-visible', qaHistoryVisible);
        updateQaHistorySidebar();
    };
}

function updateQaHistorySidebar() {
    const toggleBtn = document.getElementById('qaHistoryToggle');
    const sidebar = document.getElementById('qaHistorySidebar');

    if (!toggleBtn || !sidebar) return;

    if (qaHistoryVisible) {
        sidebar.classList.remove('collapsed');
        toggleBtn.classList.add('active');
    } else {
        sidebar.classList.add('collapsed');
        toggleBtn.classList.remove('active');
    }
}

function handleQaKeyPress(event) {
    if (event.key === 'Enter') {
        // isLoading guard：流式请求进行中时忽略 Enter 提交，防止并发请求覆盖
        if (qaIsLoading) {
            console.log('[前端] 流式请求进行中，忽略 Enter 提交');
            return;
        }
        submitQuestion();
    }
}

function updateSendButtonState() {
    const input = document.getElementById('qaInput');
    const btn = document.getElementById('qaSubmitBtn');
    if (input && btn) {
        const hasText = input.value.trim().length > 0;
        btn.disabled = !hasText;
    }
}

async function submitQuestion() {
    const question = document.getElementById('qaInput').value.trim();
    if (!question) {
        showToast('请输入问题');
        return;
    }

    // ===== isLoading 防抖锁 =====
    // 防止用户在流式请求进行中再次提交（点击发送或按 Enter），导致：
    // 1) 重复绑定 onStreamChunk 监听器（虽然 preload 已做幂等，但仍是脏状态）
    // 2) 旧请求的回调覆盖新请求的渲染状态
    if (qaIsLoading) {
        console.log('[前端] 已有流式请求进行中，忽略重复提交');
        return;
    }
    qaIsLoading = true;

    // 中止之前可能存在的请求（防止并发问题）
    if (abortController) {
        abortController.abort();
    }

    // 重置流式状态机：每次提交前清空缓冲、停止旧 rAF、重置滚动行为标记
    abortController = new AbortController();
    streamBuffer = '';
    displayPosition = 0;
    streamEnded = false;
    userScrolledUp = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const submitBtn = document.getElementById('qaSubmitBtn');
    const loading = document.getElementById('qaLoading');
    const loadingText = document.getElementById('qaLoadingText');
    const result = document.getElementById('qaResult');
    const answer = document.getElementById('qaAnswer');
    const error = document.getElementById('qaError');
    const referencesSection = document.getElementById('qaReferencesSection');

    submitBtn.disabled = true;

    // 显示"停止生成"按钮
    const stopBtn = document.getElementById('qaStopBtn');
    if (stopBtn) stopBtn.style.display = 'flex';

    // 智能滚动监听：用命名函数 + removeEventListener 避免每次提交都累加监听器
    result.removeEventListener('scroll', handleQaResultScroll);
    result.addEventListener('scroll', handleQaResultScroll);

    // 重置加载动画状态（确保再次提问时动画能正常显示）
    loading.classList.remove('fade-out');
    loading.style.opacity = '1';
    loading.style.transform = 'translateY(0)';

    // 重置错误显示
    error.style.display = 'none';
    referencesSection.style.display = 'none';

    // 隐藏上一次的回答结果
    result.style.display = 'none';

    // 显示加载动画
    loading.style.display = 'flex';

    // 清空之前的回答内容
    answer.textContent = '';
    answer.innerHTML = '';

    // 加载状态文字轮换
    const loadingMessages = [
        '正在分析文档...',
        '正在深度思考...',
        '正在整合信息...',
        '正在解锁文档...',
        '正在检索相关内容...',
        '正在构建答案...'
    ];
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        loadingText.classList.add('fade-out');
        setTimeout(() => {
            loadingText.textContent = loadingMessages[messageIndex];
            loadingText.classList.remove('fade-out');
        }, 200);
    }, 1800);

    // 先设置流式响应监听器，再调用 API
    let streamStarted = false;

    // ===== 数据接收与渲染解耦 =====
    // onStreamChunk 仅更新 streamBuffer（写缓冲），不操作 DOM。
    // 渲染由 startStreamRenderLoop 中的 requestAnimationFrame 驱动（按帧推进 displayPosition）。
    // 这样即使 IPC 高频回调（每 token 一次），DOM 写入也被节流到 ~60fps，避免掉帧。
    window.electronAPI.qa.onStreamChunk((data) => {
        console.log('[前端] 收到流式数据:', data.fullAnswer ? data.fullAnswer.substring(0, 50) + '...' : '空');
        // 仅更新缓冲区，不操作 DOM（渲染由 requestAnimationFrame 驱动）
        // data.fullAnswer 是后端累积的全文（后端 onChunk 已改为发送 delta，但 fullAnswer 仍是累积值）
        if (data.fullAnswer !== undefined && data.fullAnswer !== null) {
            streamBuffer = data.fullAnswer;
        }
        // 第一次收到流式数据时，隐藏加载动画、显示结果区域、启动 rAF 渲染循环
        if (!streamStarted) {
            streamStarted = true;
            clearInterval(messageInterval);
            loading.classList.add('fade-out');
            setTimeout(() => { loading.style.display = 'none'; }, 200);
            result.style.display = 'block';
            answer.innerHTML = '';
            // 启动 rAF 渲染循环（数据接收与视觉渲染解耦的核心）
            startStreamRenderLoop(answer, result);
        }
    });

    // 超时兜底：45秒内没收到流式数据，自动隐藏加载动画
    const streamTimeout = setTimeout(() => {
        if (!streamStarted) {
            console.log('[前端] 流式响应超时，强制隐藏加载动画');
            clearInterval(messageInterval);
            loading.classList.add('fade-out');
            setTimeout(() => { loading.style.display = 'none'; }, 400);
            result.style.display = 'block';
            answer.textContent = '请求超时，请重试';
            submitBtn.disabled = false;
        }
    }, 45000);

    // 监听流式响应结束
    try {
        // 调用流式响应 API，传递Token节省模式状态
        const response = await window.electronAPI.qa.askQuestionStream(question, tokenSaveMode);

        // 清除超时定时器
        clearTimeout(streamTimeout);

        // 清理监听器
        clearInterval(messageInterval);
        window.electronAPI.qa.removeStreamChunkListener();

        if (!response.success) {
            // 淡出加载动画
            loading.classList.add('fade-out');
            setTimeout(() => {
                loading.style.display = 'none';
            }, 400);
            displayQaError(response.error);
            return;
        }

        // ===== 流式结束处理 =====
        // 标记流式结束，rAF 会渲染完剩余内容后自动停止
        streamEnded = true;
        // 立即停止 rAF（下方会用完整文本做一次完整解析，避免渐进解析的截断补齐差异）
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

        // 渲染 Markdown 格式（添加淡入效果避免视觉跳变）
        if (response.answer) {
            // 诊断日志：验证前端收到的 response.answer 是否包含正确的文件名
            console.log('[前端-流式完成] response.answer 长度:', response.answer.length, '包含 .md:', response.answer.includes('.md'), '引用来源段:', response.answer.substring(response.answer.indexOf('## 引用来源')));
            // 流式结束后用完整文本做一次完整 Markdown 解析
            // （渐进解析可能因截断补齐产生细微差异，最终态以完整解析为准）
            answer.style.transition = 'opacity 0.2s ease-out';
            answer.style.opacity = '0';
            setTimeout(() => {
                // 同步缓冲与显示位置到完整态，保持状态机一致
                streamBuffer = response.answer;
                displayPosition = response.answer.length;
                answer.innerHTML = markdownToHtml(response.answer);
                answer.style.opacity = '1';
                // 智能滚动：仅当用户未主动上滑时滚动到底部
                if (!userScrolledUp) {
                    result.scrollTop = result.scrollHeight;
                }
            }, 200);
        } else {
            answer.textContent = '无回答内容';
        }

        // 防御性处理：确保加载动画被隐藏，结果区域被显示
        if (loading.style.display !== 'none') {
            loading.classList.add('fade-out');
            setTimeout(() => { loading.style.display = 'none'; }, 400);
        }
        if (result.style.display === 'none') {
            result.style.display = 'block';
        }

        // 保存到历史记录
        saveQaHistory(question, response.answer);

        // 保存问题以便重新回答
        localStorage.setItem('lastQaQuestion', question);

        // 清空输入框并更新发送按钮状态
        document.getElementById('qaInput').value = '';
        updateSendButtonState();

    } catch (err) {
        clearInterval(messageInterval);
        loading.classList.add('fade-out');
        setTimeout(() => {
            loading.style.display = 'none';
        }, 400);
        displayQaError(err.message);
        window.electronAPI.qa.removeStreamChunkListener();
    } finally {
        // ===== 状态机复位 =====
        // 无论成功/失败/中止，都重置防抖锁与缓冲，恢复 UI 可提交状态。
        // 注意：rAF 在 try 成功路径中已停止；这里再做一次防御性清理。
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        streamEnded = true;
        qaIsLoading = false;
        abortController = null;
        streamBuffer = '';
        displayPosition = 0;
        if (stopBtn) stopBtn.style.display = 'none';
        submitBtn.disabled = false;
        updateSendButtonState();
    }
}

function retryQuestion() {
    const lastQuestion = localStorage.getItem('lastQaQuestion');
    if (!lastQuestion) {
        showToast('没有可重试的问题');
        return;
    }
    document.getElementById('qaInput').value = lastQuestion;
    updateSendButtonState();
    submitQuestion();
}

/**
 * 智能滚动处理器：监听 qaResult 滚动，用户主动上滑后停止自动滚动到底部。
 * 用户回到底部附近时恢复自动滚动。命名函数以便 removeEventListener 去重。
 */
function handleQaResultScroll() {
    const result = document.getElementById('qaResult');
    if (!result) return;
    // 距底部 80px 内视为"在底部"，恢复自动滚动；否则视为用户主动上滑
    const nearBottom = (result.scrollHeight - result.scrollTop - result.clientHeight) <= 80;
    userScrolledUp = !nearBottom;
}

/**
 * requestAnimationFrame 渲染循环：按帧推进 displayPosition，增量渲染 Markdown。
 * 数据接收（onStreamChunk 写 streamBuffer）与视觉渲染（本函数）解耦，
 * 避免高频 DOM 操作导致掉帧。同时支持打字机效果与渐进 Markdown 解析。
 * @param {HTMLElement} answerEl 回答容器
 * @param {HTMLElement} resultEl 结果滚动容器
 */
function startStreamRenderLoop(answerEl, resultEl) {
    const CHARS_PER_FRAME = 8; // 每帧推进字符数（约 8 字符/16ms ≈ 500 字符/秒，兼顾流畅与性能）
    function renderFrame() {
        // 推进显示位置：从当前 displayPosition 向 streamBuffer.length 逼近
        if (displayPosition < streamBuffer.length) {
            displayPosition = Math.min(displayPosition + CHARS_PER_FRAME, streamBuffer.length);
            const visibleText = streamBuffer.slice(0, displayPosition);
            // 渐进 Markdown 解析（处理语义截断：未闭合代码块/行内代码）
            answerEl.innerHTML = safeMarkdownParse(visibleText);
            // 智能滚动：仅当用户未主动上滑时滚动到底部
            if (!userScrolledUp) {
                resultEl.scrollTop = resultEl.scrollHeight;
            }
        }
        // 流式未结束 或 还有未渲染内容 → 继续下一帧
        if (!streamEnded || displayPosition < streamBuffer.length) {
            rafId = requestAnimationFrame(renderFrame);
        } else {
            // 全部渲染完毕且流式已结束：清理句柄，循环自动停止
            rafId = null;
        }
    }
    rafId = requestAnimationFrame(renderFrame);
}

/**
 * 停止生成：通过 AbortController 中止后端请求，停止 rAF，恢复 UI。
 * 后端在中止时会 resolve 已累积的部分内容（不 reject），前端拿到后照常渲染。
 */
async function stopGeneration() {
    // 通过 IPC 通知主进程中止 LLM 请求（后端会 resolve 已累积的部分内容）
    try {
        await window.electronAPI.qa.stopStream();
    } catch (e) {
        console.warn('[前端] 停止生成 IPC 调用失败:', e.message);
    }
    // 前端 AbortController 也触发 abort（用于本地信号传播）
    if (abortController) {
        abortController.abort();
    }
    // 标记流式结束，让 rAF 把剩余缓冲渲染完毕后自动停止
    streamEnded = true;
    
    // 立即重置状态，确保用户可以再次提交问题
    // 即使后端没有立即返回，前端也能恢复响应
    qaIsLoading = false;
    const stopBtn = document.getElementById('qaStopBtn');
    if (stopBtn) stopBtn.style.display = 'none';
    const submitBtn = document.getElementById('qaSubmitBtn');
    if (submitBtn) submitBtn.disabled = false;
    updateSendButtonState();
}

function displayQaResult(response) {
    const result = document.getElementById('qaResult');
    const answer = document.getElementById('qaAnswer');
    const referencesSection = document.getElementById('qaReferencesSection');
    const references = document.getElementById('qaReferences');

    answer.textContent = response.answer || '无回答内容';

    if (response.references && response.references.length > 0) {
        referencesSection.style.display = 'block';
        references.innerHTML = response.references.map(function(ref) {
            return '<div class="qa-reference-item"><div class="qa-reference-title">' + ref.title + '</div><div class="qa-reference-content">' + ref.content + '</div></div>';
        }).join('');
    } else {
        referencesSection.style.display = 'none';
    }

    result.style.display = 'block';
}

function displayQaError(message) {
    const error = document.getElementById('qaError');
    const errorMessage = document.getElementById('qaErrorMessage');
    
    errorMessage.textContent = message;
    error.style.display = 'flex';
}

// 问答历史记录功能
const QA_HISTORY_KEY = 'qaHistory';
const MAX_HISTORY_ITEMS = 50;

// Token节省模式开关状态
const TOKEN_SAVE_MODE_KEY = 'tokenSaveMode';
let tokenSaveMode = true; // 默认开启

function toggleTokenSaveMode() {
    const checkbox = document.getElementById('tokenSaveToggle');
    if (checkbox) {
        tokenSaveMode = checkbox.checked;
        localStorage.setItem(TOKEN_SAVE_MODE_KEY, tokenSaveMode);
    }
}

function updateTokenSaveToggleUI() {
    const checkbox = document.getElementById('tokenSaveToggle');
    if (!checkbox) return;

    checkbox.checked = tokenSaveMode;
}

function initTokenSaveMode() {
    const savedState = localStorage.getItem(TOKEN_SAVE_MODE_KEY);
    tokenSaveMode = savedState !== 'false'; // 默认开启，只有明确设置为false才关闭
    updateTokenSaveToggleUI();
}

function getQaHistory() {
    try {
        const history = localStorage.getItem(QA_HISTORY_KEY);
        return history ? JSON.parse(history) : [];
    } catch (e) {
        console.error('获取历史记录失败:', e);
        return [];
    }
}

function saveQaHistory(question, answer) {
    if (!question || !answer) return;
    
    try {
        let history = getQaHistory();
        
        // 添加新记录到开头
        history.unshift({
            question: question,
            answer: answer,
            time: new Date().toISOString()
        });
        
        // 限制历史记录数量
        if (history.length > MAX_HISTORY_ITEMS) {
            history = history.slice(0, MAX_HISTORY_ITEMS);
        }
        
        localStorage.setItem(QA_HISTORY_KEY, JSON.stringify(history));
        renderQaHistory();
    } catch (e) {
        console.error('保存历史记录失败:', e);
    }
}

function renderQaHistory() {
    const historyList = document.getElementById('qaHistoryList');
    if (!historyList) return;
    
    const history = getQaHistory();
    
    if (history.length === 0) {
        historyList.innerHTML = '<div class="qa-history-empty">暂无历史记录</div>';
        return;
    }
    
    historyList.innerHTML = history.map((item, index) => {
        const time = formatHistoryTime(item.time);
        return '<div class="qa-history-item" onclick="loadQaHistoryItem(' + index + ')">' +
            '<div class="qa-history-question">' + escapeHtml(item.question) + '</div>' +
            '<div class="qa-history-answer">' + escapeHtml(item.answer.substring(0, 100)) + (item.answer.length > 100 ? '...' : '') + '</div>' +
            '<div class="qa-history-time">' + time + '</div>' +
        '</div>';
    }).join('');
}

function loadQaHistoryItem(index) {
    const history = getQaHistory();
    if (index >= 0 && index < history.length) {
        const item = history[index];
        const answer = document.getElementById('qaAnswer');
        const result = document.getElementById('qaResult');
        const input = document.getElementById('qaInput');

        input.value = item.question;
        answer.innerHTML = markdownToHtml(item.answer);
        result.style.display = 'block';
    }
}

function clearQaHistory() {
    if (confirm('确定要清空所有历史记录吗？')) {
        localStorage.removeItem(QA_HISTORY_KEY);
        renderQaHistory();
    }
}

function formatHistoryTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    
    return date.toLocaleDateString('zh-CN');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    collapseTagCloudSection();
    updateSettingsThemeButtons();
    await loadSettingsConfig();
    modal.classList.add('active');
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('active');
    expandTagCloudSection();
    filterByMenu('all');
}

function updateSettingsThemeButtons() {
    const isDark = document.body.classList.contains('theme-dark');
    document.getElementById('settingsThemeLight').classList.toggle('active', !isDark);
    document.getElementById('settingsThemeDark').classList.toggle('active', isDark);
}

function setTheme(theme) {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');

    if (theme === 'dark') {
        body.classList.add('theme-dark');
        themeToggle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        localStorage.setItem('localmind-theme', 'dark');
    } else {
        body.classList.remove('theme-dark');
        themeToggle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        localStorage.setItem('localmind-theme', 'light');
    }
    updateSettingsThemeButtons();
    window.electronAPI.ipcRenderer.send('theme:change', theme);
}

function clearFavorites() {
    if (confirm('确定要清空所有收藏吗？')) {
        favorites = [];
        localStorage.removeItem('localmind-favorites');
        renderDocuments();
        alert('收藏夹已清空');
    }
}

async function clearCache() {
    if (confirm('确定要清理所有缓存吗？这将重置主题、收藏设置和配置，下次启动将重新显示欢迎界面。')) {
        try {
            await window.electronAPI.config.clear();
            localStorage.clear();
            favorites = [];
            document.body.classList.remove('theme-dark');
            document.getElementById('themeToggle').innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            renderDocuments();
            updateSettingsThemeButtons();
            alert('缓存已清理，下次启动将重新显示欢迎界面');
        } catch (error) {
            console.error('清除缓存失败:', error);
            alert('清除缓存失败: ' + error.message);
        }
    }
}

async function loadSettingsConfig() {
    try {
        const localmind = await window.electronAPI.config.get('localmind', {});
        console.log('[API Key加载] 从config读取的localmind:', JSON.stringify(localmind));

        document.getElementById('llmApiUrl').value = localmind.apiUrl || '';
        document.getElementById('llmModel').value = localmind.modelName || 'gpt-4o-mini';
        document.getElementById('studyFolderPath').value = localmind.studyFolder || '';
        
        const keychainResult = await window.electronAPI.keychain.getApiKey();
        console.log('[API Key加载] keychain.getApiKey结果:', JSON.stringify(keychainResult));
        
        if (keychainResult.success && keychainResult.apiKey) {
            document.getElementById('llmApiKey').value = keychainResult.apiKey;
            console.log('[API Key加载] 使用keychain中的apiKey，长度:', keychainResult.apiKey.length);
        } else if (localmind.apiKey) {
            document.getElementById('llmApiKey').value = localmind.apiKey;
            console.log('[API Key加载] 使用localmind中的apiKey，长度:', localmind.apiKey.length);
        } else {
            console.log('[API Key加载] 未找到apiKey');
        }

        const llmMode = await window.electronAPI.localModel.getLlmMode();
        document.getElementById('modeRemote').classList.toggle('active', llmMode === 'remote');
        document.getElementById('modeLocal').classList.toggle('active', llmMode === 'local');
        document.getElementById('remoteConfigSection').style.display = llmMode === 'remote' ? 'block' : 'none';
        document.getElementById('localModelSection').style.display = llmMode === 'local' ? 'block' : 'none';

        if (llmMode === 'local') {
            await updateLocalModelStatus();
        }

        document.getElementById('llmApiUrl').addEventListener('input', debounceAutoSave);
        document.getElementById('llmApiKey').addEventListener('input', debounceAutoSave);
        document.getElementById('llmModel').addEventListener('input', debounceAutoSave);
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

function validateApiUrl(url) {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return { valid: false, error: 'API URL 不能为空' };
    }

    try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { valid: false, error: 'API URL 必须使用 http 或 https 协议' };
        }
        if (!parsed.hostname || parsed.hostname.length === 0) {
            return { valid: false, error: 'API URL 主机名不能为空' };
        }
        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'API URL 格式不正确: ' + e.message };
    }
}

function validateApiKeyInput(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return { valid: false, error: 'API Key 不能为空' };
    }
    if (apiKey.trim().length < 10) {
        return { valid: false, error: 'API Key 长度不足，请检查是否正确' };
    }
    return { valid: true };
}

function validateModelInput(model) {
    if (!model || typeof model !== 'string' || model.trim().length === 0) {
        return { valid: false, error: '模型名称不能为空' };
    }
    return { valid: true };
}

async function testApiConnection() {
    const btn = document.getElementById('testApiBtn');
    const resultDiv = document.getElementById('apiTestResult');
    
    btn.disabled = true;
    btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 测试中...';
    resultDiv.style.display = 'none';

    try {
        const response = await window.electronAPI.qa.testApi();
        
        resultDiv.style.display = 'block';
        if (response.success) {
            resultDiv.innerHTML = '<div class="settings-api-test-success"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ' + response.message + '</div>';
        } else {
            resultDiv.innerHTML = '<div class="settings-api-test-error"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ' + response.error + '</div>';
        }
    } catch (error) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div class="settings-api-test-error"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> 测试失败: ' + error.message + '</div>';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> 测试连接';
    }
}

async function saveLlmConfig() {
    const rawApiUrl = document.getElementById('llmApiUrl').value;
    const apiUrl = normalizeApiUrl(rawApiUrl);
    const apiKey = document.getElementById('llmApiKey').value;
    const model = document.getElementById('llmModel').value;

    const urlValidation = validateApiUrl(apiUrl);
    if (!urlValidation.valid) {
        alert('URL 验证失败: ' + urlValidation.error);
        return;
    }

    const keyValidation = validateApiKeyInput(apiKey);
    if (!keyValidation.valid) {
        alert('API Key 验证失败: ' + keyValidation.error);
        return;
    }

    const modelValidation = validateModelInput(model);
    if (!modelValidation.valid) {
        alert('模型验证失败: ' + modelValidation.error);
        return;
    }

    try {
        const localmind = await window.electronAPI.config.get('localmind', {});
        
        console.log('[API Key保存] 输入的apiKey长度:', apiKey ? apiKey.length : 0, '前4位:', apiKey ? apiKey.substring(0, 4) : 'empty');
        console.log('[API Key保存] 当前localmind对象:', JSON.stringify(localmind));
        
        await window.electronAPI.config.set('localmind', {
            ...localmind,
            apiUrl,
            apiKey,
            modelName: model
        });
        
        console.log('[API Key保存] config.set调用完成');
        
        await window.electronAPI.keychain.saveApiKey(apiKey);
        
        console.log('[API Key保存] keychain.saveApiKey调用完成');
        
        // 验证保存是否成功
        const verifyConfig = await window.electronAPI.config.get('localmind', {});
        console.log('[API Key保存] 验证读取到的apiKey长度:', verifyConfig.apiKey ? verifyConfig.apiKey.length : 0);
        
        if (apiUrl !== rawApiUrl.trim()) {
            document.getElementById('llmApiUrl').value = apiUrl;
        }
        alert('LLM 配置保存成功');
    } catch (error) {
        console.error('保存配置失败:', error);
        alert('保存配置失败: ' + error.message);
    }
}

let autoSaveTimeout = null;

function debounceAutoSave() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    autoSaveTimeout = setTimeout(async function() {
        await autoSaveLlmConfig();
    }, 500);
}

async function autoSaveLlmConfig() {
    const rawApiUrl = document.getElementById('llmApiUrl').value;
    const apiUrl = normalizeApiUrl(rawApiUrl);
    const apiKey = document.getElementById('llmApiKey').value;
    const model = document.getElementById('llmModel').value;

    if (!apiUrl && !apiKey && !model) {
        return;
    }

    try {
        const localmind = await window.electronAPI.config.get('localmind', {});

        await window.electronAPI.config.set('localmind', {
            ...localmind,
            apiUrl,
            apiKey,
            modelName: model
        });

        await window.electronAPI.keychain.saveApiKey(apiKey);

        if (apiUrl !== rawApiUrl.trim()) {
            document.getElementById('llmApiUrl').value = apiUrl;
        }

        console.log('[自动保存] LLM 配置已保存');
    } catch (error) {
        console.error('[自动保存] 保存配置失败:', error);
    }
}

async function selectStudyFolder() {
    try {
        const result = await window.electronAPI.dialog.selectFolder();
        if (result && !result.canceled && result.filePaths.length > 0) {
            const folderPath = result.filePaths[0];
            const localmindConfig = await window.electronAPI.config.get('localmind') || {};
            const oldFolder = localmindConfig.studyFolder;

            // 文件夹未改变，无需清理
            if (oldFolder === folderPath) {
                document.getElementById('studyFolderPath').value = folderPath;
                return;
            }

            document.getElementById('studyFolderPath').value = folderPath;
            localmindConfig.studyFolder = folderPath;
            await window.electronAPI.config.set('localmind', localmindConfig);

            // 文件夹已切换：清理旧文件夹中的文档（file_path 不在新文件夹下的所有文档）
            const deleteResult = await window.electronAPI.db.deleteDocumentsNotUnderPath(folderPath);
            if (deleteResult && deleteResult.success && deleteResult.deletedCount > 0) {
                showToast(`已切换文件夹，清理了 ${deleteResult.deletedCount} 个旧文档`);
            }

            // 刷新文档列表与标签云，让旧文档立即从界面消失
            await loadData();
            if (typeof updateStats === 'function') {
                updateStats();
            }
        }
    } catch (error) {
        console.error('选择文件夹失败:', error);
        alert('选择文件夹失败: ' + error.message);
    }
}

function showSettingsProgress(show, progress = 0, message = '') {
    const container = document.querySelector('.settings-progress-container');
    const bar = document.getElementById('settingsProgressBar');
    const text = document.getElementById('settingsProgressText');

    if (show) {
        container.classList.add('active');
        bar.innerHTML = `<div class="settings-progress-bar-inner" style="width: ${progress}%"></div>`;
        text.textContent = message;
    } else {
        container.classList.remove('active');
        bar.innerHTML = '';
        text.textContent = '';
    }
}

function showScanProgress(show, progress = 0, message = '') {
    const container = document.getElementById('scanProgressContainer');
    const bar = document.getElementById('scanProgressBar');
    const text = document.getElementById('scanProgressText');

    if (show) {
        container.style.display = 'block';
        bar.innerHTML = `<div class="scan-progress-bar-inner" style="width: ${progress}%"></div>`;
        text.textContent = message;
    } else {
        container.style.display = 'none';
        bar.innerHTML = '';
        text.textContent = '';
    }
}

function showAnalyzeProgress(show, progress = 0, message = '') {
    const container = document.getElementById('analyzeProgressContainer');
    const bar = document.getElementById('analyzeProgressBar');
    const text = document.getElementById('analyzeProgressText');

    if (show) {
        container.style.display = 'block';
        bar.innerHTML = `<div class="analyze-progress-bar-inner" style="width: ${progress}%"></div>`;
        text.textContent = message;
    } else {
        container.style.display = 'none';
        bar.innerHTML = '';
        text.textContent = '';
    }
}

async function startScanDocuments() {
    const folderPath = document.getElementById('studyFolderPath').value;
    
    if (!folderPath) {
        alert('请先选择学习资料文件夹');
        return;
    }

    showSettingsProgress(true, 0, '正在准备扫描...');

    const handleProgress = function(data) {
        const { progress, currentFile, currentIndex, totalFiles } = data;
        showSettingsProgress(true, progress, `正在扫描 (${currentIndex}/${totalFiles}): ${currentFile}`);
    };

    window.electronAPI.scan.onScanProgress(handleProgress);

    try {
        const result = await window.electronAPI.scan.scanDocuments(folderPath);

        showSettingsProgress(true, 100, `扫描完成！共扫描 ${result.totalScanned} 个文件，新增 ${result.newFiles} 个，已存在 ${result.existingFiles} 个`);

        if (result.errors && result.errors.length > 0) {
            const pdfErrors = result.errors.filter(e => e.error && e.error.includes('PDF'));
            if (pdfErrors.length > 0) {
                showToast(`检测到 ${pdfErrors.length} 个不支持的PDF文件（非文字型或已加密），已跳过`);
            }
        }

        // 先设置定时隐藏进度条，避免 loadData 耗时导致进度条长时间不消失
        setTimeout(() => {
            showSettingsProgress(false);
        }, 3000);

        // 然后刷新数据（即使耗时也不会影响进度条按时隐藏）
        await loadData();
    } catch (error) {
        console.error('扫描文档失败:', error);
        showSettingsProgress(true, 0, '扫描失败: ' + error.message);
        setTimeout(() => {
            showSettingsProgress(false);
        }, 3000);
    } finally {
        window.electronAPI.scan.removeScanProgressListener();
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

let selectedSummaryIds = [];

function openSummaryModal() {
    const modal = document.getElementById('summaryModal');
    selectedSummaryIds = [];
    updateSummaryCount();
    renderSummaryList();
    modal.classList.add('active');
}

function closeSummaryModal() {
    const modal = document.getElementById('summaryModal');
    modal.classList.remove('active');
}

async function renderSummaryList() {
    const list = document.getElementById('summaryList');
    list.innerHTML = '';

    try {
        const allDocs = await window.electronAPI.db.getDocuments();
        const docsWithoutSummary = allDocs.filter(doc => !doc.abstract || doc.abstract.trim().length === 0);

        if (docsWithoutSummary.length === 0) {
            list.innerHTML = '<div class="empty-state">所有文档都已生成摘要</div>';
            return;
        }

        docsWithoutSummary.forEach(function(doc) {
            const item = document.createElement('div');
            item.className = 'export-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'export-checkbox';
            checkbox.dataset.id = doc.id;
            checkbox.onchange = function() {
                const docId = parseInt(doc.id);
                if (this.checked) {
                    if (!selectedSummaryIds.includes(docId)) {
                        selectedSummaryIds.push(docId);
                    }
                } else {
                    selectedSummaryIds = selectedSummaryIds.filter(id => id !== docId);
                }
                updateSummarySelectAll();
            };

            const title = document.createElement('span');
            title.className = 'export-title';
            title.textContent = doc.title;

            item.appendChild(checkbox);
            item.appendChild(title);
            list.appendChild(item);
        });

        updateSummarySelectAll();
    } catch (error) {
        console.error('加载文档列表失败:', error);
        list.innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

function selectAllSummary() {
    const checkboxes = document.querySelectorAll('#summaryModal .export-checkbox');
    const selectAllBtn = document.getElementById('selectAllSummary');
    
    checkboxes.forEach(function(checkbox) {
        checkbox.checked = selectAllBtn.checked;
        if (checkbox.checked) {
            if (!selectedSummaryIds.includes(parseInt(checkbox.dataset.id))) {
                selectedSummaryIds.push(parseInt(checkbox.dataset.id));
            }
        } else {
            selectedSummaryIds = selectedSummaryIds.filter(id => id !== parseInt(checkbox.dataset.id));
        }
    });

    updateSummarySelectAll();
}

function updateSummarySelectAll() {
    const checkboxes = document.querySelectorAll('#summaryModal .export-checkbox');
    const selectAllBtn = document.getElementById('selectAllSummary');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const noneChecked = Array.from(checkboxes).every(cb => !cb.checked);
    
    selectAllBtn.checked = allChecked;
    selectAllBtn.indeterminate = !allChecked && !noneChecked;
    updateSummaryCount();
}

function updateSummaryCount() {
    const countEl = document.getElementById('summaryCount');
    if (countEl) {
        countEl.textContent = '已选择 ' + selectedSummaryIds.length + ' 篇';
    }
}

let isGeneratingSummary = false;

async function generateSummaries() {
    openSummaryModal();
}

async function confirmGenerateSummaries() {
    if (isGeneratingSummary) {
        showToast('正在生成中，请稍后');
        return;
    }
    
    if (selectedSummaryIds.length === 0) {
        showToast('请先选择要生成摘要的文档');
        return;
    }

    try {
        const docsWithContent = [];
        const docsWithoutContent = [];

        for (const docId of selectedSummaryIds) {
            const doc = await window.electronAPI.db.getDocumentWithRelations(docId);
            if (doc && doc.content && doc.content.trim().length > 0) {
                docsWithContent.push(docId);
            } else {
                docsWithoutContent.push(doc ? doc.title : `ID: ${docId}`);
            }
        }

        if (docsWithContent.length === 0) {
            showToast('所选文档都没有实际内容，无法生成摘要');
            return;
        }

        if (docsWithoutContent.length > 0) {
            const msg = `${docsWithoutContent.length} 篇文档没有实际内容，将跳过：${docsWithoutContent.slice(0, 2).join('、')}${docsWithoutContent.length > 2 ? '...' : ''}`;
            showToast(msg);
        }

        closeSummaryModal();
        
        isGeneratingSummary = true;

        // 添加到任务队列
        await window.electronAPI.scan.generateSummariesWithTask(docsWithContent);

    } catch (error) {
        console.error('生成摘要失败:', error);
        closeSummaryModal();
        showToast('生成失败: ' + error.message);
    } finally {
        isGeneratingSummary = false;
    }
}

// 删除文档相关变量和函数
let selectedDeleteIds = [];

function openDeleteModal() {
    const modal = document.getElementById('deleteModal');
    selectedDeleteIds = [];
    renderDeleteList();
    modal.classList.add('active');
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.classList.remove('active');
    filterByMenu('all');
}

async function renderDeleteList() {
    const list = document.getElementById('deleteList');
    list.innerHTML = '';

    try {
        const allDocs = await window.electronAPI.db.getDocuments();

        allDocs.forEach(function(doc) {
            const item = document.createElement('div');
            item.className = 'export-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'export-item-checkbox';
            checkbox.checked = selectedDeleteIds.includes(doc.id);
            checkbox.onchange = function() {
                if (this.checked) {
                    if (!selectedDeleteIds.includes(doc.id)) {
                        selectedDeleteIds.push(doc.id);
                    }
                } else {
                    selectedDeleteIds = selectedDeleteIds.filter(function(id) { return id !== doc.id; });
                }
                updateDeleteCount();
            };

            const info = document.createElement('div');
            info.className = 'export-item-info';
            info.innerHTML = '<div class="export-item-title">' + doc.title + '</div>' +
                '<div class="export-item-meta">' + (doc.author || '') + ' · ' + (doc.year || '') + '</div>';

            item.appendChild(checkbox);
            item.appendChild(info);

            item.onclick = function(e) {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.onchange();
                }
            };

            list.appendChild(item);
        });

        updateDeleteCount();
    } catch (error) {
        console.error('获取删除文档列表失败:', error);
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">获取文档列表失败</div>';
    }
}

function updateDeleteCount() {
    document.getElementById('deleteCount').textContent = '已选择 ' + selectedDeleteIds.length + ' 篇';
}

async function selectAllDelete() {
    const allDocs = await window.electronAPI.db.getDocuments();
    const allDocIds = allDocs.map(function(doc) { return doc.id; });
    
    const isAllSelected = allDocIds.length > 0 && selectedDeleteIds.length === allDocIds.length && allDocIds.every(function(id) {
        return selectedDeleteIds.includes(id);
    });
    
    if (isAllSelected) {
        selectedDeleteIds = [];
    } else {
        selectedDeleteIds = allDocIds;
    }
    
    renderDeleteList();
}

async function deleteSelected() {
    if (selectedDeleteIds.length === 0) {
        showToast('请至少选择一篇文档');
        return;
    }

    console.log('===== 删除文档开始 =====');
    console.log('选中的文档ID:', selectedDeleteIds);

    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = '正在删除文档...';
    loadingOverlay.style.display = 'flex';

    try {
        let deletedCount = 0;
        let fileErrors = [];
        let errorDetails = [];

        for (let i = 0; i < selectedDeleteIds.length; i++) {
            const docId = selectedDeleteIds[i];
            console.log(`\n--- 处理文档 ${i + 1}/${selectedDeleteIds.length}, ID: ${docId} ---`);
            
            try {
                console.log('获取文档信息...');
                const doc = await window.electronAPI.db.getDocumentWithRelations(docId);
                console.log('文档信息:', doc);
                
                if (doc) {
                    console.log('文档标题:', doc.title);
                    console.log('文档文件路径:', doc.file_path);
                    
                    if (doc.file_path) {
                        try {
                            console.log('检查文件是否存在:', doc.file_path);
                            const fileExists = await window.electronAPI.dialog.checkFileExists(doc.file_path);
                            console.log('文件存在:', fileExists);
                            
                            if (fileExists) {
                                console.log('删除文件:', doc.file_path);
                                const deleteFileResult = await window.electronAPI.dialog.deleteFile(doc.file_path);
                                console.log('文件删除结果:', deleteFileResult);
                                
                                // 处理新的返回格式：{ success: boolean, error?: string, code?: string }
                                if (deleteFileResult && deleteFileResult.success) {
                                    console.log('文件删除成功');
                                } else if (deleteFileResult && deleteFileResult.error) {
                                    fileErrors.push(doc.title);
                                    errorDetails.push(`${doc.title}: ${deleteFileResult.error}`);
                                    console.error('文件删除失败:', deleteFileResult.error);
                                }
                            } else {
                                console.log('文件不存在，跳过文件删除');
                            }
                        } catch (fileErr) {
                            fileErrors.push(doc.title);
                            errorDetails.push(`${doc.title}: ${fileErr.message}`);
                            console.error('删除文件时出现异常:', doc.file_path, fileErr);
                        }
                    } else {
                        console.log('文档没有文件路径，跳过文件删除');
                    }

                    console.log('删除数据库记录, ID:', docId);
                    const deleteResult = await window.electronAPI.db.deleteDocument(docId);
                    console.log('数据库删除结果:', deleteResult);
                    
                    if (deleteResult) {
                        deletedCount++;
                        console.log('数据库删除成功，已删除计数:', deletedCount);
                    } else {
                        console.log('数据库删除失败或未删除任何记录');
                    }
                } else {
                    console.log('文档不存在:', docId);
                }
            } catch (error) {
                console.error('删除文档失败:', docId, error);
            }
        }

        console.log('\n===== 删除文档结束 =====');
        console.log('已删除数量:', deletedCount);
        console.log('文件错误数量:', fileErrors.length);
        if (errorDetails.length > 0) {
            console.log('错误详情:', errorDetails);
        }

        loadingOverlay.style.display = 'none';
        
        if (deletedCount > 0) {
            await loadData();
            let msg = '成功删除 ' + deletedCount + ' 篇文档';
            if (fileErrors.length > 0) {
                msg += '\n部分文件删除失败:\n' + errorDetails.join('\n');
                // 使用更长的提示时间
                showToast(msg);
            } else {
                showToast(msg);
            }
        } else {
            if (errorDetails.length > 0) {
                showToast('删除失败:\n' + errorDetails.join('\n'));
            } else {
                showToast('删除失败');
            }
        }
        
        closeDeleteModal();
    } catch (error) {
        console.error('删除文档失败:', error);
        loadingOverlay.style.display = 'none';
        showToast('删除失败: ' + error.message);
    }
}

let pdfDoc = null;
let currentPage = 1;
let pdfZoom = 1;

async function initPdfViewer(filePath) {
    try {
        const viewer = document.getElementById('pdfViewer');
        viewer.innerHTML = '<div class="pdf-loading"><div class="pdf-spinner"></div><div class="pdf-loading-text">加载中...</div></div>';
        
        const pdfData = await window.electronAPI.dialog.readFile(filePath);
        const pdfBytes = new Uint8Array(pdfData);
        
        const pdfjsLib = await import('../../node_modules/pdfjs-dist/build/pdf.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
        
        pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        
        currentPage = 1;
        pdfZoom = 1;
        
        updatePdfPageInfo();
        await renderPdfPage(currentPage);
        
        console.log('PDF 加载成功:', filePath, '页数:', pdfDoc.numPages);
    } catch (error) {
        console.error('加载 PDF 失败:', error);
        const viewer = document.getElementById('pdfViewer');
        viewer.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 40px;">无法加载 PDF 文件: ' + error.message + '</div>';
    }
}

async function renderPdfPage(pageNum) {
    if (!pdfDoc) return;
    
    const page = await pdfDoc.getPage(pageNum);
    const scale = pdfZoom;
    const viewport = page.getViewport({ scale: scale });
    
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    const ctx = canvas.getContext('2d');
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    const viewer = document.getElementById('pdfViewer');
    viewer.innerHTML = '';
    viewer.appendChild(canvas);
}

function updatePdfPageInfo() {
    if (!pdfDoc) return;
    const pageInfo = document.getElementById('pdfPageInfo');
    const zoomLevel = document.getElementById('pdfZoomLevel');
    if (pageInfo) {
        pageInfo.textContent = currentPage + ' / ' + pdfDoc.numPages;
    }
    if (zoomLevel) {
        zoomLevel.textContent = Math.round(pdfZoom * 100) + '%';
    }
}

function pdfPrevPage() {
    if (!pdfDoc || currentPage <= 1) return;
    currentPage--;
    updatePdfPageInfo();
    renderPdfPage(currentPage);
}

function pdfNextPage() {
    if (!pdfDoc || currentPage >= pdfDoc.numPages) return;
    currentPage++;
    updatePdfPageInfo();
    renderPdfPage(currentPage);
}

function pdfZoomIn() {
    pdfZoom += 0.25;
    updatePdfPageInfo();
    renderPdfPage(currentPage);
}

function pdfZoomOut() {
    if (pdfZoom <= 0.25) return;
    pdfZoom -= 0.25;
    updatePdfPageInfo();
    renderPdfPage(currentPage);
}

async function initMdViewer(filePath) {
    try {
        const mdData = await window.electronAPI.dialog.readFile(filePath);
        const mdText = new TextDecoder('utf-8').decode(mdData);
        
        const viewer = document.getElementById('mdViewer');
        viewer.innerHTML = markdownToHtml(mdText);
        
        console.log('MD 加载成功:', filePath);
    } catch (error) {
        console.error('加载 MD 失败:', error);
        const viewer = document.getElementById('mdViewer');
        viewer.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 40px;">无法加载 Markdown 文件: ' + error.message + '</div>';
    }
}

/**
 * 流式渐进 Markdown 解析：处理语义截断（未闭合代码块/行内代码），临时补齐后再解析。
 * 流式过程中文本可能被截断在代码块中间，直接解析会产生错误 HTML 结构（如未闭合的 <pre>）。
 * 采用"补齐法"：检测到未闭合围栏/反引号时，临时追加闭合标记后解析，最终态由 markdownToHtml 兜底。
 * @param {string} text 当前已显示的部分文本（streamBuffer.slice(0, displayPosition)）
 * @returns {string} 安全解析后的 HTML
 */
function safeMarkdownParse(text) {
    if (!text) return '';
    let safe = text;
    // 检测未闭合的代码围栏 ```（奇数个则补一个闭合标记）
    const fenceCount = (safe.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
        safe += '\n```';
    } else {
        // 仅当代码围栏成对时检测行内代码（代码块内不检测，避免误判）
        // 移除成对的三反引号代码块后，统计剩余单反引号
        const withoutFences = safe.replace(/```[\s\S]*?```/g, '');
        const backtickCount = (withoutFences.match(/`/g) || []).length;
        if (backtickCount % 2 !== 0) {
            safe += '`';
        }
    }
    return markdownToHtml(safe);
}

function markdownToHtml(text) {
    if (!text) return '';

    let html = text;

    // 修复 LLM 小模型列表项序号错误（如每项都写"1."）
    // 将连续多行的"数字. xxx"重写为"1. xxx\n2. yyy\n3. zzz"，让后续流程正确分组
    html = renumberSequentialListItems(html);

    // HTML 转义
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 预处理1：把"- ## 标题：内容"（列表项里的不规范标题）剥成两行
    html = html.replace(/^(\s*[-*+]\s+)#{1,6}\s*([^：:\n]{1,30})\s*[:：]\s*(.+)$/gm, '$1$2\n$1$3');

    // 预处理2：把"## 标题：内容"（行首不规范标题）转为规范 Markdown
    html = html.replace(/^#{1,6}\s*([^：:\n]{1,30})\s*[:：]\s*(.+)$/gm, '## $1\n$2');

    // 标题（## 后必须有空格）
    html = html.replace(/^#{6}\s(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#{5}\s(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#{4}\s(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^#{3}\s(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#{2}\s(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#{1}\s(.+)$/gm, '<h1>$1</h1>');

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
        return '<pre><code>' + code.trim() + '</code></pre>';
    });

    html = html.replace(/^>\s(.+)$/gm, '<blockquote>$1</blockquote>');

    html = html.replace(/^-{3,}$/gm, '<hr>');

    html = html.replace(/^(\d+)\.\s(.+)$/gm, '<ol><li>$2</li></ol>');
    html = html.replace(/<\/ol>\n<ol>/g, '');

    html = html.replace(/^[-*+]\s(.+)$/gm, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\n<ul>/g, '');

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%;">');

    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    html = html.replace(/<p><\/p>/g, '');

    html = html.replace(/<p><(h[1-6]|ul|ol|pre|blockquote|hr)/g, '<$1');
    html = html.replace(/<\/(h[1-6]|ul|ol|pre|blockquote|hr)><\/p>/g, '</$1>');

    return html;
}

/**
 * 修复 LLM 输出列表项序号错误
 * 1.5B 等小模型常常把有序列表的每一项都写成"1."，导致浏览器渲染时全部显示"1."。
 * 本函数将连续多行"数字. xxx"重新编号为 1, 2, 3, ...，不修改其他内容。
 *
 * @param {string} text 原始文本
 * @returns {string} 重新编号后的文本
 */
function renumberSequentialListItems(text) {
    if (!text) return text;
    const lines = text.split('\n');
    const result = [];
    let buffer = [];

    function flush() {
        // 仅当连续 ≥ 2 条列表项时才重新编号，避免影响单条列表
        if (buffer.length >= 2) {
            buffer.forEach((line, idx) => {
                result.push(line.replace(/^\s*\d+\.\s?/, `${idx + 1}. `));
            });
        } else if (buffer.length === 1) {
            // 单条列表项：把数字归一为 1（防止模型写"5."这种孤立序号）
            result.push(buffer[0].replace(/^\s*\d+\.\s?/, '1. '));
        }
        buffer = [];
    }

    for (const line of lines) {
        if (/^\s*\d+\.\s/.test(line)) {
            buffer.push(line);
        } else {
            flush();
            result.push(line);
        }
    }
    flush();
    return result.join('\n');
}

async function setLlmMode(mode) {
    try {
        await window.electronAPI.localModel.setLlmMode(mode);
        document.getElementById('modeRemote').classList.toggle('active', mode === 'remote');
        document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
        document.getElementById('remoteConfigSection').style.display = mode === 'remote' ? 'block' : 'none';
        document.getElementById('localModelSection').style.display = mode === 'local' ? 'block' : 'none';
        if (mode === 'local') {
            await updateLocalModelStatus();
        }
        showToast(mode === 'remote' ? '已切换到远程API模式' : '已切换到本地模型模式');
    } catch (error) {
        console.error('切换模式失败:', error);
        showToast('切换模式失败: ' + error.message);
    }
}

async function downloadLocalModel() {
    const btn = document.getElementById('downloadModelBtn');
    const progressContainer = document.getElementById('modelDownloadProgress');
    const progressBar = document.getElementById('modelDownloadProgressBar');
    const progressText = document.getElementById('modelDownloadProgressText');
    const statusEl = document.getElementById('localModelStatus');

    btn.disabled = true;
    btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 下载中...';
    progressContainer.style.display = 'block';
    statusEl.textContent = '下载中...';

    window.electronAPI.localModel.onDownloadProgress((data) => {
        progressBar.style.width = data.progress + '%';
        progressText.textContent = data.message || `下载进度: ${data.progress}%`;
    });

    try {
        const result = await window.electronAPI.localModel.download();
        if (result.success) {
            progressBar.style.width = '100%';
            progressText.textContent = '下载完成';
            statusEl.textContent = '已下载';
            document.getElementById('downloadModelBtn').style.display = 'none';
            document.getElementById('loadModelBtn').style.display = 'inline-block';
            showToast('模型下载完成');
        } else {
            statusEl.textContent = '下载失败';
            showToast('模型下载失败: ' + result.error);
        }
    } catch (error) {
        console.error('下载模型失败:', error);
        statusEl.textContent = '下载失败';
        showToast('模型下载失败: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 下载模型';
        window.electronAPI.localModel.removeDownloadProgressListener();
    }
}

async function loadLocalModel() {
    const btn = document.getElementById('loadModelBtn');
    const statusEl = document.getElementById('localModelStatus');

    btn.disabled = true;
    btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 加载中...';
    statusEl.textContent = '加载中...';

    try {
        const result = await window.electronAPI.localModel.load();
        if (result.success) {
            statusEl.textContent = '已加载';
            document.getElementById('loadModelBtn').style.display = 'none';
            showToast('模型加载成功，可以开始使用本地模型');
        } else {
            statusEl.textContent = '加载失败';
            showToast('模型加载失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        console.error('加载模型失败:', error);
        statusEl.textContent = '加载失败';
        showToast('模型加载失败: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg> 加载模型';
    }
}

async function unloadLocalModel() {
    const statusEl = document.getElementById('localModelStatus');

    try {
        await window.electronAPI.localModel.unload();
        statusEl.textContent = '已卸载';
        document.getElementById('loadModelBtn').style.display = 'inline-block';
        showToast('模型已卸载');
    } catch (error) {
        console.error('卸载模型失败:', error);
        showToast('卸载模型失败: ' + error.message);
    }
}

async function updateLocalModelStatus() {
    try {
        const isDownloaded = await window.electronAPI.localModel.isDownloaded();
        const modelStatus = await window.electronAPI.localModel.getModelStatus();
        const statusEl = document.getElementById('localModelStatus');
        const downloadBtn = document.getElementById('downloadModelBtn');
        const loadBtn = document.getElementById('loadModelBtn');
        const progressContainer = document.getElementById('modelDownloadProgress');

        if (modelStatus.isLoaded) {
            statusEl.textContent = '已加载';
            downloadBtn.style.display = 'none';
            loadBtn.style.display = 'none';
            progressContainer.style.display = 'none';
        } else if (isDownloaded) {
            statusEl.textContent = '已下载';
            downloadBtn.style.display = 'none';
            loadBtn.style.display = 'inline-block';
            progressContainer.style.display = 'none';
        } else {
            statusEl.textContent = '未下载';
            downloadBtn.style.display = 'inline-block';
            loadBtn.style.display = 'none';
            progressContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('更新本地模型状态失败:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // ========================================================================
    // 阶段一：同步初始化（确保界面框架和主题立即可见、可交互）
    // 主题类已由 index.html 中的内联脚本在 body 渲染前同步应用，
    // 此处只需同步主题切换按钮图标，并完成所有事件绑定，使界面立即进入可交互状态。
    // ========================================================================

    // 同步主题切换按钮图标，使其与已应用的 body 主题类保持一致
    const savedTheme = localStorage.getItem('localmind-theme');
    const themeToggle = document.getElementById('themeToggle');
    // 暗色主题图标（月亮）
    const moonIconSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    // 亮色主题图标（太阳）
    const sunIconSvg = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    if (savedTheme !== 'light') {
        // body 已由内联脚本添加 theme-dark，此处仅补齐按钮图标
        themeToggle.innerHTML = moonIconSvg;
    } else {
        themeToggle.innerHTML = sunIconSvg;
    }

    // 加载本地收藏夹数据（同步，来自 localStorage）
    const savedFavorites = localStorage.getItem('localmind-favorites');
    if (savedFavorites) {
        favorites = JSON.parse(savedFavorites);
    }

    // 立即在文档列表容器内部显示居中加载动画，避免界面出现空白
    const statusEl = document.getElementById('docListStatus');
    if (statusEl) {
        renderDocListStatus(statusEl, 'loading');
    }
    const docListEl = document.getElementById('documentList');
    if (docListEl) {
        docListEl.innerHTML = '<div class="doc-list-placeholder-loading"><div class="doc-list-placeholder-spinner"></div><span>正在加载文档列表...</span></div>';
    }

    // 初始化文档列表分页观察器
    initDocPaginationObserver();

    document.querySelectorAll('.menu-item').forEach(function(item) {
        item.addEventListener('click', function() {
            filterByMenu(this.getAttribute('data-menu'));
        });
    });

    document.getElementById('searchInput').addEventListener('input', function(e) {
        searchQuery = e.target.value;
        renderDocuments();
    });

    document.getElementById('documentModal').addEventListener('click', function(e) {
        if (e.target === document.getElementById('documentModal')) {
            closeModal();
        }
    });

    document.getElementById('settingsModal').addEventListener('click', function(e) {
        if (e.target === document.getElementById('settingsModal')) {
            closeSettingsModal();
        }
    });

    document.getElementById('deleteModal').addEventListener('click', function(e) {
        if (e.target === document.getElementById('deleteModal')) {
            closeDeleteModal();
        }
    });

    document.getElementById('newDocModal').addEventListener('click', function(e) {
        if (e.target === document.getElementById('newDocModal')) {
            closeNewDocumentModal();
        }
    });

    document.getElementById('themeToggle').addEventListener('click', function() {
        const body = document.body;

        if (body.classList.contains('theme-dark')) {
            body.classList.remove('theme-dark');
            themeToggle.innerHTML = sunIconSvg;
            localStorage.setItem('localmind-theme', 'light');
            window.electronAPI.ipcRenderer.send('theme:change', 'light');
        } else {
            body.classList.add('theme-dark');
            themeToggle.innerHTML = moonIconSvg;
            localStorage.setItem('localmind-theme', 'dark');
            window.electronAPI.ipcRenderer.send('theme:change', 'dark');
        }
    });

    document.getElementById('generateSummaryBtn').addEventListener('click', function() {
        openSummaryModal();
    });

    // 任务状态按钮：弹出任务队列窗口
    document.getElementById('taskListBtn').addEventListener('click', function() {
        window.electronAPI.taskWindow.show();
    });

    // 监听任务窗口关闭事件，刷新主界面数据
    window.electronAPI.taskWindow.onClosed(() => {
        loadData();
    });

    // 自定义标题栏窗口控制
    document.getElementById('windowMinimize').addEventListener('click', () => {
        window.electronAPI.window.minimize();
    });

    // 最大化按钮点击：使用 invoke 等待主进程处理完成，再用返回值更新 UI
    document.getElementById('windowMaximize').addEventListener('click', async () => {
        const isMaximized = await window.electronAPI.window.maximize();
        updateWindowState(isMaximized);
    });

    document.getElementById('windowClose').addEventListener('click', () => {
        window.electronAPI.window.close();
    });

    // 初始化窗口状态
    const titleBar = document.getElementById('customTitleBar');
    const maximizeBtn = document.getElementById('windowMaximize');
    // 最大化状态图标：单个矩形
    const maximizeIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter"><rect x="3" y="3" width="18" height="18"/></svg>';
    // 还原状态图标：两个重叠的矩形
    const restoreIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter"><rect x="3" y="3" width="13" height="13"/><rect x="8" y="8" width="13" height="13"/></svg>';
    // isRestoring: 标记是否正在从最大化拖拽恢复中
    // 恢复期间保持 no-drag 模式，手动移动窗口，直到用户松开鼠标
    let isRestoring = false;
    // 更新窗口状态 UI（按钮图标、标题栏拖拽模式、CSS 类）
    // isMaximized 参数可选，不传则查询主进程
    async function updateWindowState(isMaximized) {
        if (typeof isMaximized !== 'boolean') {
            isMaximized = await window.electronAPI.window.isMaximized();
        }
        if (isMaximized) {
            document.documentElement.classList.remove('window-not-maximized');
            document.body.classList.remove('window-not-maximized');
            if (titleBar) titleBar.style.webkitAppRegion = 'no-drag';
            // 最大化状态下按钮显示"还原"图标
            if (maximizeBtn) {
                maximizeBtn.title = '还原';
                maximizeBtn.innerHTML = restoreIcon;
            }
        } else {
            document.documentElement.classList.add('window-not-maximized');
            document.body.classList.add('window-not-maximized');
            if (titleBar && !isRestoring) titleBar.style.webkitAppRegion = 'drag';
            // 非最大化状态下按钮显示"最大化"图标
            if (maximizeBtn) {
                maximizeBtn.title = '最大化';
                maximizeBtn.innerHTML = maximizeIcon;
            }
        }
    }
    updateWindowState();

    // 监听主进程的窗口状态变化通知（最大化/取消最大化事件）
    // 这样无论窗口状态如何变化（拖到顶部、拖拽恢复），UI 都能及时更新
    window.electronAPI.window.onWindowStateChanged((isMaximized) => {
        updateWindowState(isMaximized);
    });

    // 监听窗口大小变化（作为补充通知机制）
    window.addEventListener('resize', () => updateWindowState());

    // 最大化窗口拖拽恢复功能
    // 最大化时 mousedown 记录起始位置，mousemove 超过阈值后才触发恢复
    // 单纯点击不触发，只有真正拖动才会恢复窗口
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    const dragThreshold = 3; // 3像素阈值，防止误触

    if (titleBar) {
        titleBar.addEventListener('mousedown', async (e) => {
            if (e.target.closest('button')) return;
            if (e.target.closest('input')) return;

            const isMaximized = await window.electronAPI.window.isMaximized();
            if (isMaximized) {
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            if (!isRestoring) {
                // 检测是否超过拖动阈值
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;
                if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
                // 超过阈值，触发恢复
                isRestoring = true;
                window.electronAPI.window.restoreFromMaximize();
            } else {
                // 恢复后继续移动窗口，跟随鼠标
                window.electronAPI.window.moveWindow();
            }
        });

        document.addEventListener('mouseup', async () => {
            if (isRestoring) {
                isRestoring = false;
                // 通知主进程拖拽恢复结束，恢复 move 事件的自动最大化功能
                window.electronAPI.window.endDragRestore();
                // 只有当窗口不是最大化状态时才切回系统拖拽
                // 如果拖拽过程中窗口被其他方式最大化（如拖到顶部），则保持 no-drag
                const isMaximized = await window.electronAPI.window.isMaximized();
                if (titleBar && !isMaximized) {
                    titleBar.style.webkitAppRegion = 'drag';
                }
            }
            isDragging = false;
        });
    }

    // ========================================================================
    // 阶段二：延迟加载（界面框架绘制完成后再加载文档列表与背景动画）
    // 使用 requestAnimationFrame + setTimeout 确保浏览器先完成首次绘制，
    // 再开始执行较重的数据加载与动画初始化，从而让用户第一时间看到完整界面。
    // ========================================================================
    requestAnimationFrame(function () {
        setTimeout(function () {
            // 先加载文档列表（标签云 + 文档分页），完成后再执行启动自动扫描
            loadData().then(async () => {
                try {
                    console.log('=== 启动自动扫描 ===');
                    const localmindConfig = await window.electronAPI.config.get('localmind');
                    const studyFolder = localmindConfig ? localmindConfig.studyFolder : null;
                    console.log('学习资料文件夹:', studyFolder);

                    if (studyFolder) {
                        console.log('开始扫描目录:', studyFolder);
                        const result = await window.electronAPI.scan.scanDocuments(studyFolder, {
                            checkModified: true,
                            verbose: true
                        });
                        console.log('扫描结果:', result);

                        await loadData();

                        const hasChanges = result.newFiles > 0 || result.modifiedFiles > 0 || result.deletedFiles > 0;
                        if (hasChanges) {
                            let toastMsg = '自动扫描完成';
                            if (result.newFiles > 0) toastMsg += `，新增 ${result.newFiles} 个文档`;
                            if (result.modifiedFiles > 0) toastMsg += `，更新 ${result.modifiedFiles} 个文档`;
                            if (result.deletedFiles > 0) toastMsg += `，移除 ${result.deletedFiles} 个文档`;
                            showToast(toastMsg);
                        }

                        if (result.errors && result.errors.length > 0) {
                            console.warn('扫描过程中有错误:', result.errors);
                        }
                    }
                } catch (error) {
                    console.error('自动扫描失败:', error);
                }
            });

            // 文档列表加载启动后再初始化背景二进制雨动画（视觉装饰，不阻塞功能与文档加载）
            initBinaryRain();
        }, 0);
    });
});