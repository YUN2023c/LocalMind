const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const wordExtractor = new WordExtractor();
const { db, insertDocument, insertKeywords, insertTags, deleteDocument, updateDocument, cleanupOrphanedTags, cleanupOrphanedKeywords } = require('./database');
const { extractKeywords, generateTags } = require('./keyword-library');

const SUPPORTED_EXTENSIONS = ['.pdf', '.md', '.doc', '.docx', '.txt', '.html'];

async function getExistingFilePaths() {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT file_path FROM documents WHERE file_path IS NOT NULL';
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const paths = new Set(rows.map(row => row.file_path));
                resolve(paths);
            }
        });
    });
}

async function getExistingDocumentsWithMtime() {
    return new Promise((resolve, reject) => {
        // 获取公文包同步元数据：file_mtime / file_size 为上次同步时记录的文件修改时间与大小
        const sql = 'SELECT id, file_path, file_mtime, file_size FROM documents WHERE file_path IS NOT NULL';
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const docs = new Map();
                for (const row of rows) {
                    docs.set(row.file_path, { id: row.id, file_mtime: row.file_mtime, file_size: row.file_size });
                }
                resolve(docs);
            }
        });
    });
}

function isSupportedFile(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
}

function getFileType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.pdf') return 'pdf';
    if (ext === '.md') return 'markdown';
    if (ext === '.doc') return 'doc';
    if (ext === '.docx') return 'docx';
    if (ext === '.txt') return 'text';
    if (ext === '.html') return 'html';
    return 'unknown';
}

function extractTitle(filePath) {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);
    return fileName.replace(new RegExp(`${ext}$`), '');
}

async function parsePdfFile(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    try {
        const data = await pdfParse(dataBuffer);
        const text = data.text || '';
        
        if (text.trim().length === 0) {
            throw new Error('该PDF非文字型PDF或已经加密');
        }
        
        if (text.trim().length < 100) {
            const pageCount = data.numpages || 1;
            if (pageCount > 1 || text.trim().length < 20) {
                throw new Error('该PDF非文字型PDF或已经加密');
            }
        }
        
        return text;
    } catch (error) {
        if (error.message.includes('encrypted') || error.message.includes('password')) {
            throw new Error('该PDF非文字型PDF或已经加密');
        }
        throw new Error('该PDF非文字型PDF或已经加密');
    }
}

async function parseMarkdownFile(filePath) {
    return fs.readFileSync(filePath, 'utf-8');
}

async function parseDocxFile(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        const text = result && result.value ? result.value : '';
        return text;
    } catch (err) {
        console.log('mammoth 解析 DOCX 失败，返回空内容:', filePath, err.message);
        return '';
    }
}

async function parseDocFile(filePath) {
    try {
        const doc = await wordExtractor.extract(filePath);
        const body = doc.getBody ? doc.getBody() : '';
        const header = doc.getHeaders ? (doc.getHeaders() || '') : '';
        const text = (header ? header + '\n\n' : '') + (body || '');
        if (text.trim().length > 0) {
            return text;
        }
    } catch (err) {
        console.log('word-extractor 解析失败，回退到纯文本读取:', filePath, err.message);
    }
    const text = fs.readFileSync(filePath, 'utf-8');
    return text;
}

async function parseTextFile(filePath) {
    // 以 UTF-8 读取 TXT，遇到无效字节使用替换字符（U+FFFD）容忍
    return fs.readFileSync(filePath, 'utf-8');
}

async function parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
        return parsePdfFile(filePath);
    } else if (ext === '.md') {
        return parseMarkdownFile(filePath);
    } else if (ext === '.docx') {
        return parseDocxFile(filePath);
    } else if (ext === '.doc') {
        return parseDocFile(filePath);
    } else if (ext === '.txt') {
        return parseTextFile(filePath);
    } else if (ext === '.html') {
        return parseTextFile(filePath);
    }
    return '';
}

// 将文本按段落包装为 HTML：<p>段落</p>，空行作为段落分隔符
function wrapTextAsHtml(text) {
    if (!text) return '';
    // HTML 实体转义，避免注入
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    // 按空行分段，再按单换行分段，包装为 <p>
    const paragraphs = escaped.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    if (paragraphs.length === 0) return '';
    return paragraphs.map(p => '<p>' + p.replace(/\n/g, '<br/>') + '</p>').join('');
}

// 根据文件扩展名生成富文本 HTML 预览内容
// - .docx 使用 mammoth 转换为 HTML（保留段落、列表、表格等结构）
// - .doc 使用 word-extractor 提取文本后按段落包装为 <p>
// - .txt 读取文本后按段落包装为 <p>
// 其他扩展名抛出错误
async function extractHtmlFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.docx') {
        try {
            const result = await mammoth.convertToHtml({ path: filePath });
            const html = result && result.value ? result.value : '';
            if (html.trim().length === 0) {
                return '<p style="color:#999;">该文档未提取到任何内容</p>';
            }
            return html;
        } catch (err) {
            throw new Error('DOCX 解析失败：' + (err.message || err));
        }
    } else if (ext === '.doc') {
        let text = '';
        try {
            // 优先使用 word-extractor 提取真正的 OLE2 .doc 文件
            const doc = await wordExtractor.extract(filePath);
            const body = doc.getBody ? doc.getBody() : '';
            const header = doc.getHeaders ? (doc.getHeaders() || '') : '';
            text = (header ? header + '\n\n' : '') + (body || '');
        } catch (err) {
            // word-extractor 解析失败时，回退到按纯文本读取
            console.log('word-extractor 解析失败，回退到纯文本读取:', filePath, err.message);
            text = fs.readFileSync(filePath, 'utf-8');
        }
        const html = wrapTextAsHtml(text);
        if (html.length === 0) {
            return '<p style="color:#999;">该文档未提取到任何内容</p>';
        }
        return html;
    } else if (ext === '.txt') {
        try {
            const text = fs.readFileSync(filePath, 'utf-8');
            const html = wrapTextAsHtml(text);
            if (html.length === 0) {
                return '<p style="color:#999;">该文档未提取到任何内容</p>';
            }
            return html;
        } catch (err) {
            throw new Error('TXT 读取失败：' + (err.message || err));
        }
    } else if (ext === '.html') {
        try {
            const html = fs.readFileSync(filePath, 'utf-8');
            if (html.trim().length === 0) {
                return '<p style="color:#999;">该文档未提取到任何内容</p>';
            }
            return html;
        } catch (err) {
            throw new Error('HTML 读取失败：' + (err.message || err));
        }
    }
    throw new Error('不支持的预览格式：' + ext);
}

// 获取文件的同步元数据（修改时间 + 大小），用于公文包算法的变更检测
// 返回 { mtime, size } 或 null（文件不可访问时）
function getFileSyncStats(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return { mtime: stats.mtime.getTime(), size: stats.size };
    } catch (err) {
        console.log('获取文件状态失败:', filePath, err.message);
        return null;
    }
}

function collectFiles(directory) {
    const filePaths = [];

    function collectRecursively(dir) {
        let files;
        try {
            files = fs.readdirSync(dir, { withFileTypes: true });
        } catch (err) {
            return;
        }

        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                collectRecursively(fullPath);
            } else if (file.isFile() && isSupportedFile(file.name)) {
                filePaths.push(fullPath);
            }
        }
    }

    collectRecursively(directory);
    return filePaths;
}

async function scanDirectory(directory, options = {}) {
    const { checkModified = true, verbose = false, onProgress = null } = options;
    
    const existingPaths = await getExistingFilePaths();
    const existingDocsWithMtime = checkModified ? await getExistingDocumentsWithMtime() : null;
    
    const result = {
        totalScanned: 0,
        newFiles: 0,
        existingFiles: 0,
        modifiedFiles: 0,
        deletedFiles: 0,
        errors: [],
        scannedFiles: []
    };

    const foundPaths = new Set();

    const filePaths = collectFiles(directory);
    const totalFiles = filePaths.length;
    result.totalScanned = totalFiles;

    for (let i = 0; i < filePaths.length; i++) {
        const fullPath = filePaths[i];
        const file = { name: path.basename(fullPath) };
        foundPaths.add(fullPath);

        if (existingPaths.has(fullPath)) {
            let isModified = false;
            let currentStats = null;
            let needsMetadataMigration = false; // 旧数据迁移：仅更新同步元数据，不重新解析内容
            let existingDoc = null;

            if (checkModified && existingDocsWithMtime) {
                existingDoc = existingDocsWithMtime.get(fullPath);
                if (existingDoc) {
                    // 公文包算法：获取当前文件元数据
                    currentStats = getFileSyncStats(fullPath);
                    if (currentStats) {
                        const storedMtime = existingDoc.file_mtime;
                        const storedSize = existingDoc.file_size;
                        // 比较"当前文件 mtime/size"与"上次同步记录的 mtime/size"
                        // 若任一属性不同，则判定为已修改
                        if (storedMtime === null || storedMtime === undefined) {
                            // 旧记录无同步元数据：执行轻量迁移（仅记录元数据，不重新解析内容）
                            needsMetadataMigration = true;
                        } else if (currentStats.mtime !== storedMtime || currentStats.size !== storedSize) {
                            isModified = true;
                        }
                    }
                }
            }

            if (isModified) {
                try {
                    const content = await parseFile(fullPath);

                    // 若尚未获取文件状态（如 checkModified 为 false），此处补充获取
                    if (!currentStats) {
                        currentStats = getFileSyncStats(fullPath);
                    }

                    const updateDoc = {
                        id: existingDoc.id,
                        title: extractTitle(fullPath),
                        content: content,
                        file_path: fullPath,
                        file_type: getFileType(file.name),
                        file_mtime: currentStats ? currentStats.mtime : null,
                        file_size: currentStats ? currentStats.size : null
                    };

                    await updateDocument(updateDoc);

                    const keywords = extractKeywords(content);
                    const tags = generateTags(content);

                    await db.run('DELETE FROM document_keywords WHERE document_id = ?', [existingDoc.id]);
                    await db.run('DELETE FROM document_tags WHERE document_id = ?', [existingDoc.id]);

                    if (keywords.length > 0) {
                        await insertKeywords(existingDoc.id, keywords);
                    }
                    if (tags.length > 0) {
                        await insertTags(existingDoc.id, tags);
                    }

                    result.modifiedFiles++;
                    result.scannedFiles.push({
                        path: fullPath,
                        status: 'modified',
                        title: updateDoc.title,
                        type: updateDoc.file_type,
                        keywords: keywords,
                        tags: tags
                    });
                } catch (err) {
                    result.errors.push({ path: fullPath, error: err.message });
                    result.scannedFiles.push({
                        path: fullPath,
                        status: 'error',
                        title: extractTitle(fullPath),
                        type: getFileType(file.name),
                        error: err.message
                    });
                }
            } else {
                // 旧数据迁移：仅更新同步元数据（不重新解析内容），供后续公文包算法比对
                if (needsMetadataMigration && existingDoc && currentStats) {
                    try {
                        await updateDocument({
                            id: existingDoc.id,
                            file_mtime: currentStats.mtime,
                            file_size: currentStats.size
                        });
                    } catch (err) {
                        console.log('迁移文件元数据失败:', fullPath, err.message);
                    }
                }

                result.existingFiles++;
                result.scannedFiles.push({
                    path: fullPath,
                    status: 'existing',
                    title: extractTitle(fullPath),
                    type: getFileType(file.name)
                });
            }
        } else {
            try {
                const content = await parseFile(fullPath);
                // 记录新文件的同步元数据，供后续公文包算法比对
                const fileStats = getFileSyncStats(fullPath);
                const doc = {
                    title: extractTitle(fullPath),
                    content: content,
                    file_path: fullPath,
                    file_type: getFileType(file.name),
                    file_mtime: fileStats ? fileStats.mtime : null,
                    file_size: fileStats ? fileStats.size : null
                };

                const docId = await insertDocument(doc);

                const keywords = extractKeywords(content);
                const tags = generateTags(content);

                if (keywords.length > 0) {
                    await insertKeywords(docId, keywords);
                }
                if (tags.length > 0) {
                    await insertTags(docId, tags);
                }

                result.newFiles++;
                result.scannedFiles.push({
                    path: fullPath,
                    status: 'new',
                    title: doc.title,
                    type: doc.file_type,
                    keywords: keywords,
                    tags: tags
                });
            } catch (err) {
                result.errors.push({ path: fullPath, error: err.message });
                result.scannedFiles.push({
                    path: fullPath,
                    status: 'error',
                    title: extractTitle(fullPath),
                    type: getFileType(file.name),
                    error: err.message
                });
            }
        }

        if (onProgress && totalFiles > 0) {
            const progress = Math.round(((i + 1) / totalFiles) * 100);
            const currentFileName = extractTitle(fullPath);
            onProgress(progress, currentFileName, i + 1, totalFiles);
        }
    }

    for (const existingPath of existingPaths) {
        if (!foundPaths.has(existingPath)) {
            await deleteDocumentByFilePath(existingPath);
            result.deletedFiles++;
            result.scannedFiles.push({
                path: existingPath,
                status: 'deleted',
                title: extractTitle(existingPath)
            });
        }
    }

    const cleanedTags = await cleanupOrphanedTags();
    const cleanedKeywords = await cleanupOrphanedKeywords();
    
    if (cleanedTags > 0) {
        result.scannedFiles.push({
            status: 'cleanup',
            message: `清理了 ${cleanedTags} 个无关联标签`
        });
    }
    if (cleanedKeywords > 0) {
        result.scannedFiles.push({
            status: 'cleanup',
            message: `清理了 ${cleanedKeywords} 个无关联关键词`
        });
    }

    if (verbose) {
        console.log(`扫描完成: 总数=${result.totalScanned}, 新增=${result.newFiles}, 修改=${result.modifiedFiles}, 已存在=${result.existingFiles}, 删除=${result.deletedFiles}`);
    }

    return result;
}

async function deleteDocumentByFilePath(filePath) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM documents WHERE file_path = ?', [filePath], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            if (row) {
                deleteDocument(row.id).then(resolve).catch(reject);
            } else {
                resolve(false);
            }
        });
    });
}

module.exports = {
    scanDirectory,
    parseFile,
    isSupportedFile,
    getFileType,
    extractHtmlFromFile
};