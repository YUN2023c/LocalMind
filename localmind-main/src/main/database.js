const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// 生产环境（asar 打包后）__dirname 指向只读的 asar 包内部，无法写入 SQLite 数据库。
// 使用 app.getPath('userData') 确保数据库文件位于可写目录，开发和生产环境均适用。
const DB_DIR = path.join(app.getPath('userData'), 'data');
const DB_PATH = path.join(DB_DIR, 'localmind.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('无法打开数据库:', err.message);
    } else {
        console.log('成功连接到 SQLite 数据库');
        initDatabase();
    }
});

function initDatabase() {
    const createDocumentsTable = `
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT,
            year INTEGER,
            abstract TEXT,
            content TEXT,
            file_path TEXT UNIQUE,
            file_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            favorite INTEGER DEFAULT 0,
            last_viewed TEXT,
            file_mtime INTEGER,
            file_size INTEGER
        );
    `;

    const createKeywordsTable = `
        CREATE TABLE IF NOT EXISTS keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT UNIQUE NOT NULL
        );
    `;

    const createTagsTable = `
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag TEXT UNIQUE NOT NULL
        );
    `;

    const createDocumentKeywordsTable = `
        CREATE TABLE IF NOT EXISTS document_keywords (
            document_id INTEGER NOT NULL,
            keyword_id INTEGER NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE,
            PRIMARY KEY (document_id, keyword_id)
        );
    `;

    const createDocumentTagsTable = `
        CREATE TABLE IF NOT EXISTS document_tags (
            document_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (document_id, tag_id)
        );
    `;

    const createFtsTable = `
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(title, content, content_rowid='id');
    `;

    const createFtsTriggerInsert = `
        CREATE TRIGGER IF NOT EXISTS fts_docs_insert AFTER INSERT ON documents
        BEGIN
            INSERT INTO fts_docs(rowid, title, content) VALUES (new.id, new.title, new.content);
        END;
    `;

    const createFtsTriggerUpdate = `
        CREATE TRIGGER IF NOT EXISTS fts_docs_update AFTER UPDATE ON documents
        BEGIN
            INSERT OR REPLACE INTO fts_docs(rowid, title, content) VALUES (new.id, new.title, new.content);
        END;
    `;

    const createFtsTriggerDelete = `
        CREATE TRIGGER IF NOT EXISTS fts_docs_delete AFTER DELETE ON documents
        BEGIN
            INSERT INTO fts_docs(fts_docs, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
        END;
    `;

    db.serialize(() => {
        db.run(createDocumentsTable);
        db.run(createKeywordsTable);
        db.run(createTagsTable);
        db.run(createDocumentKeywordsTable);
        db.run(createDocumentTagsTable);
        db.run(createFtsTable);
        db.run(createFtsTriggerInsert);
        db.run(createFtsTriggerUpdate);
        db.run(createFtsTriggerDelete);

        // 数据库迁移：为已存在的 documents 表补充公文包同步元数据列
        // file_mtime / file_size 用于记录上次同步时的文件修改时间与大小，
        // 扫描时据此判断文件是否被修改（公文包算法），与 updated_at（记录变更时间）解耦。
        // ALTER TABLE ADD COLUMN 在列已存在时会报错，此处忽略该错误以实现幂等迁移。
        db.run('ALTER TABLE documents ADD COLUMN file_mtime INTEGER', () => {});
        db.run('ALTER TABLE documents ADD COLUMN file_size INTEGER', () => {});

        console.log('数据库表初始化完成');
        rebuildFtsIndex();
    });
}

function insertDocument(doc) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO documents (title, author, year, abstract, content, file_path, file_type, favorite, file_mtime, file_size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, [
            doc.title,
            doc.author || null,
            doc.year || null,
            doc.abstract || null,
            doc.content || null,
            doc.file_path || null,
            doc.file_type || null,
            doc.favorite || 0,
            doc.file_mtime !== undefined ? doc.file_mtime : null,
            doc.file_size !== undefined ? doc.file_size : null
        ], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
}

function updateDocument(doc) {
    return new Promise((resolve, reject) => {
        // 构建动态更新语句，只更新提供的字段
        const updates = [];
        const values = [];
        
        if (doc.title !== undefined) { updates.push('title = ?'); values.push(doc.title); }
        if (doc.author !== undefined) { updates.push('author = ?'); values.push(doc.author || null); }
        if (doc.year !== undefined) { updates.push('year = ?'); values.push(doc.year || null); }
        if (doc.abstract !== undefined) { updates.push('abstract = ?'); values.push(doc.abstract || null); }
        if (doc.content !== undefined) { updates.push('content = ?'); values.push(doc.content || null); }
        if (doc.file_path !== undefined) { updates.push('file_path = ?'); values.push(doc.file_path || null); }
        if (doc.file_type !== undefined) { updates.push('file_type = ?'); values.push(doc.file_type || null); }
        if (doc.favorite !== undefined) { updates.push('favorite = ?'); values.push(doc.favorite || 0); }
        if (doc.last_viewed !== undefined) { updates.push('last_viewed = ?'); values.push(doc.last_viewed || null); }
        if (doc.file_mtime !== undefined) { updates.push('file_mtime = ?'); values.push(doc.file_mtime); }
        if (doc.file_size !== undefined) { updates.push('file_size = ?'); values.push(doc.file_size); }
        
        if (updates.length === 0) {
            resolve(false);
            return;
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(doc.id);
        
        const sql = `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`;
        
        db.run(sql, values, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes > 0);
            }
        });
    });
}

function getDocument(id) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM documents WHERE id = ?';
        db.get(sql, [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function addRelationsToDocuments(documents) {
    return new Promise((resolve) => {
        if (!documents || documents.length === 0) {
            resolve(documents);
            return;
        }
        
        const ids = documents.map(d => d.id);
        const placeholders = ids.map(() => '?').join(',');
        
        const keywordsSql = `
            SELECT dk.document_id, k.keyword FROM keywords k
            JOIN document_keywords dk ON k.id = dk.keyword_id
            WHERE dk.document_id IN (${placeholders})
        `;
        
        const tagsSql = `
            SELECT dt.document_id, t.tag FROM tags t
            JOIN document_tags dt ON t.id = dt.tag_id
            WHERE dt.document_id IN (${placeholders})
        `;
        
        db.all(keywordsSql, ids, (err, keywords) => {
            db.all(tagsSql, ids, (err, tags) => {
                const keywordsMap = {};
                (keywords || []).forEach(k => {
                    if (!keywordsMap[k.document_id]) {
                        keywordsMap[k.document_id] = [];
                    }
                    keywordsMap[k.document_id].push(k.keyword);
                });
                
                const tagsMap = {};
                (tags || []).forEach(t => {
                    if (!tagsMap[t.document_id]) {
                        tagsMap[t.document_id] = [];
                    }
                    tagsMap[t.document_id].push(t.tag);
                });
                
                documents.forEach(doc => {
                    doc.keywords = keywordsMap[doc.id] || [];
                    doc.tags = tagsMap[doc.id] || [];
                });
                
                resolve(documents);
            });
        });
    });
}

function getAllDocuments() {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM documents ORDER BY updated_at DESC';
        db.all(sql, [], (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

function searchDocuments(query) {
    return new Promise((resolve, reject) => {
        // query 可能是 "关键词1 关键词2 ..." 这样的多关键词（来自 qa-service 的 extractKeywords）
        // 用空格拆分成 OR 列表，分别查询 title/author/abstract/content
        const keywords = query.split(/\s+/).filter(k => k.length > 0);
        if (keywords.length === 0) {
            resolve([]);
            return;
        }
        const patterns = keywords.map(k => `%${k}%`);

        // 构建动态 SQL：每个关键词一组 LIKE 条件
        const orGroups = keywords.map(() =>
            '(title LIKE ? OR author LIKE ? OR abstract LIKE ? OR content LIKE ?)'
        ).join(' OR ');

        const sql = `
            SELECT *,
                CASE
                    WHEN title = ? THEN 100
                    WHEN title LIKE ? THEN 80
                    WHEN title LIKE ? THEN 60
                    WHEN author LIKE ? THEN 40
                    WHEN abstract LIKE ? THEN 20
                    WHEN content LIKE ? THEN 10
                    ELSE 0
                END as search_score
            FROM documents
            WHERE ${orGroups}
            ORDER BY search_score DESC, updated_at DESC
        `;

        const firstKw = keywords[0];
        // 排序 CASE 的参数（仅使用第一个关键词做"完全匹配"判定）
        const orderParams = [
            firstKw,                  // title = ?
            `${firstKw}%`,            // title LIKE ?
            `%${firstKw}%`,           // title LIKE ?
            `%${firstKw}%`,           // author LIKE ?
            `%${firstKw}%`,           // abstract LIKE ?
            `%${firstKw}%`            // content LIKE ?
        ];
        // 每个关键词 4 个参数（title/author/abstract/content）
        const whereParams = [];
        keywords.forEach(kw => {
            const pat = `%${kw}%`;
            whereParams.push(pat, pat, pat, pat);
        });

        const allParams = [...orderParams, ...whereParams];

        db.all(sql, allParams, (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

/**
 * 中文友好检索：基于 extractKeywords 提取的 ≥2 字完整中文词做 LIKE
 * - 使用关键词数组（callers 自己提取），不必再次解析
 * - 召回后按"命中关键词数"降序排序
 * - 用于本地模型问答时 FTS5 不支持中文分词的回退路径
 *
 * @param {string[]} keywords - 已提取的关键词数组（通常由 extractKeywords 返回，已过滤停用词）
 * @param {number} [limit=5] - 最多返回文档数
 * @returns {Promise<Array>} 文档列表（含原始字段），按命中关键词数排序
 */
function searchChineseDocuments(keywords, limit = 5) {
    return new Promise((resolve, reject) => {
        // 仅保留 ≥2 字关键词（1 字容易误命中、且 1.5B 模型无法利用）
        const validKeywords = (keywords || []).filter(k => typeof k === 'string' && k.length >= 2);
        if (validKeywords.length === 0) {
            resolve([]);
            return;
        }

        // 每个关键词在 (title || abstract || content) 中命中一次记 1 分
        const hitSumExpr = validKeywords
            .map(() => '(CASE WHEN title LIKE ? OR abstract LIKE ? OR content LIKE ? THEN 1 ELSE 0 END)')
            .join(' + ');

        const whereExpr = validKeywords
            .map(() => '(title LIKE ? OR abstract LIKE ? OR content LIKE ?)')
            .join(' OR ');

        const sql = `
            SELECT *,
                (${hitSumExpr}) AS hit_count
            FROM documents
            WHERE ${whereExpr}
            ORDER BY hit_count DESC, updated_at DESC
            LIMIT ?
        `;

        const params = [];
        // hit_count 参数：每个关键词 3 个（title/abstract/content）
        validKeywords.forEach(kw => {
            const pat = `%${kw}%`;
            params.push(pat, pat, pat);
        });
        // WHERE 参数：每个关键词 3 个
        validKeywords.forEach(kw => {
            const pat = `%${kw}%`;
            params.push(pat, pat, pat);
        });
        params.push(limit);

        db.all(sql, params, (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

function toggleFavorite(id) {
    return new Promise((resolve, reject) => {
        const sql = `
            UPDATE documents
            SET favorite = CASE WHEN favorite = 0 THEN 1 ELSE 0 END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        db.run(sql, [id], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes > 0);
            }
        });
    });
}

function insertKeywords(docId, keywords) {
    return new Promise((resolve, reject) => {
        const insertKeywordSql = 'INSERT OR IGNORE INTO keywords (keyword) VALUES (?)';
        const insertRelationSql = 'INSERT OR IGNORE INTO document_keywords (document_id, keyword_id) VALUES (?, ?)';
        
        let completed = 0;
        const total = keywords.length;
        
        if (total === 0) {
            resolve();
            return;
        }
        
        keywords.forEach(keyword => {
            db.run(insertKeywordSql, [keyword], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.get('SELECT id FROM keywords WHERE keyword = ?', [keyword], (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (row) {
                        db.run(insertRelationSql, [docId, row.id], (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            completed++;
                            if (completed === total) {
                                resolve();
                            }
                        });
                    } else {
                        completed++;
                        if (completed === total) {
                            resolve();
                        }
                    }
                });
            });
        });
    });
}

function insertTags(docId, tags) {
    return new Promise((resolve, reject) => {
        const insertTagSql = 'INSERT OR IGNORE INTO tags (tag) VALUES (?)';
        const insertRelationSql = 'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)';
        
        let completed = 0;
        const total = tags.length;
        
        if (total === 0) {
            resolve();
            return;
        }
        
        tags.forEach(tag => {
            db.run(insertTagSql, [tag], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.get('SELECT id FROM tags WHERE tag = ?', [tag], (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (row) {
                        db.run(insertRelationSql, [docId, row.id], (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            completed++;
                            if (completed === total) {
                                resolve();
                            }
                        });
                    } else {
                        completed++;
                        if (completed === total) {
                            resolve();
                        }
                    }
                });
            });
        });
    });
}

function getDocumentWithRelations(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM documents WHERE id = ?', [id], (err, document) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!document) {
                resolve(null);
                return;
            }
            
            const keywordsSql = `
                SELECT k.keyword FROM keywords k
                JOIN document_keywords dk ON k.id = dk.keyword_id
                WHERE dk.document_id = ?
            `;
            
            const tagsSql = `
                SELECT t.tag FROM tags t
                JOIN document_tags dt ON t.id = dt.tag_id
                WHERE dt.document_id = ?
            `;
            
            db.all(keywordsSql, [id], (err, keywords) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.all(tagsSql, [id], (err, tags) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    document.keywords = keywords.map(k => k.keyword);
                    document.tags = tags.map(t => t.tag);
                    resolve(document);
                });
            });
        });
    });
}

function deleteDocument(id) {
    return new Promise((resolve, reject) => {
        console.log('===== deleteDocument 开始 =====');
        console.log('删除文档ID:', id);
        
        db.serialize(() => {
            // 先临时禁用FTS触发器
            db.run('DROP TRIGGER IF EXISTS fts_docs_delete', function(err) {
                if (err) {
                    console.log('删除触发器失败（继续）:', err.message);
                } else {
                    console.log('已删除fts_docs_delete触发器');
                }
                
                // 检查文档是否存在
                db.get('SELECT id, title FROM documents WHERE id = ?', [id], (err, doc) => {
                    if (err) {
                        console.error('查询文档失败:', err);
                        reject(err);
                        return;
                    }
                    
                    if (!doc) {
                        console.log('文档不存在，ID:', id);
                        // 重新创建触发器
                        recreateFtsTrigger();
                        resolve(false);
                        return;
                    }
                    
                    console.log('找到文档:', doc.title);
                    
                    // 删除关联数据
                    db.run('DELETE FROM document_keywords WHERE document_id = ?', [id], function(err) {
                        if (err) {
                            console.error('删除document_keywords失败:', err.message);
                        } else {
                            console.log('删除document_keywords成功，影响行数:', this.changes);
                        }
                        
                        db.run('DELETE FROM document_tags WHERE document_id = ?', [id], function(err) {
                            if (err) {
                                console.error('删除document_tags失败:', err.message);
                            } else {
                                console.log('删除document_tags成功，影响行数:', this.changes);
                            }
                            
                            // 删除文档主记录
                            db.run('DELETE FROM documents WHERE id = ?', [id], function(err) {
                                if (err) {
                                    console.error('删除documents失败:', err.message);
                                    console.error('错误详情:', JSON.stringify(err));
                                    recreateFtsTrigger();
                                    reject(err);
                                } else {
                                    const changes = this.changes;
                                    console.log('删除documents成功，影响行数:', changes);
                                    
                                    // 手动删除FTS索引
                                    db.run('DELETE FROM fts_docs WHERE rowid = ?', [id], function(err) {
                                        if (err) {
                                            console.log('删除FTS索引失败（忽略）:', err.message);
                                        } else {
                                            console.log('删除FTS索引成功');
                                        }
                                        
                                        // 重新创建触发器
                                        recreateFtsTrigger();
                                        console.log('===== deleteDocument 成功 =====');
                                        resolve(changes > 0);
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
}

// 重新创建FTS触发器
function recreateFtsTrigger() {
    const createFtsTriggerDelete = `
        CREATE TRIGGER IF NOT EXISTS fts_docs_delete AFTER DELETE ON documents
        BEGIN
            INSERT INTO fts_docs(fts_docs, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
        END;
    `;
    db.run(createFtsTriggerDelete, function(err) {
        if (err) {
            console.log('重新创建触发器失败:', err.message);
        } else {
            console.log('已重新创建fts_docs_delete触发器');
        }
    });
}

function getFavoriteDocuments() {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM documents WHERE favorite = 1 ORDER BY updated_at DESC';
        db.all(sql, [], (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

function getDocumentsByTag(tag) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT DISTINCT d.* FROM documents d
            JOIN document_tags dt ON d.id = dt.document_id
            JOIN tags t ON dt.tag_id = t.id
            WHERE t.tag = ?
            ORDER BY d.updated_at DESC
        `;
        db.all(sql, [tag], (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

// 分页获取文档列表
function getDocumentsPaginated(offset, limit) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM documents ORDER BY updated_at DESC LIMIT ? OFFSET ?';
        db.all(sql, [limit, offset], (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

// 分页获取收藏文档
function getFavoriteDocumentsPaginated(offset, limit) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM documents WHERE favorite = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?';
        db.all(sql, [limit, offset], (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

// 分页搜索文档
function searchDocumentsPaginated(query, offset, limit) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT *,
                CASE
                    WHEN title = ? THEN 100
                    WHEN title LIKE ? THEN 80
                    WHEN title LIKE ? THEN 60
                    WHEN author LIKE ? THEN 40
                    WHEN abstract LIKE ? THEN 20
                    WHEN content LIKE ? THEN 10
                    ELSE 0
                END as search_score
            FROM documents
            WHERE title LIKE ? OR author LIKE ? OR abstract LIKE ? OR content LIKE ?
            ORDER BY search_score DESC, updated_at DESC
            LIMIT ? OFFSET ?
        `;
        const exactPattern = query;
        const startsWithPattern = `${query}%`;
        const containsPattern = `%${query}%`;
        db.all(sql, [
            exactPattern,
            startsWithPattern,
            containsPattern,
            containsPattern,
            containsPattern,
            containsPattern,
            containsPattern,
            containsPattern,
            containsPattern,
            containsPattern,
            limit,
            offset
        ], (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

// 分页按标签获取文档
function getDocumentsByTagPaginated(tag, offset, limit) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT DISTINCT d.* FROM documents d
            JOIN document_tags dt ON d.id = dt.document_id
            JOIN tags t ON dt.tag_id = t.id
            WHERE t.tag = ?
            ORDER BY d.updated_at DESC
            LIMIT ? OFFSET ?
        `;
        db.all(sql, [tag, limit, offset], (err, documents) => {
            if (err) {
                reject(err);
                return;
            }
            addRelationsToDocuments(documents).then(resolve).catch(resolve);
        });
    });
}

function getAllTags() {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT tag FROM tags ORDER BY tag';
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(r => r.tag));
            }
        });
    });
}

function getAllKeywords() {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT keyword FROM keywords ORDER BY keyword';
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(r => r.keyword));
            }
        });
    });
}

function getDatabaseSize() {
    return new Promise((resolve) => {
        fs.stat(DB_PATH, (err, stats) => {
            if (err) {
                resolve(0);
                return;
            }
            resolve(stats.size);
        });
    });
}

function cleanupOrphanedTags() {
    return new Promise((resolve, reject) => {
        const sql = `
            DELETE FROM tags 
            WHERE id NOT IN (SELECT DISTINCT tag_id FROM document_tags)
        `;
        db.run(sql, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
}

function cleanupOrphanedKeywords() {
    return new Promise((resolve, reject) => {
        const sql = `
            DELETE FROM keywords
            WHERE id NOT IN (SELECT DISTINCT keyword_id FROM document_keywords)
        `;
        db.run(sql, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
}

// 删除所有 file_path 不在指定目录下的文档
// 用于用户切换学习资料文件夹时清理旧文件夹的文档
// basePath: 新的学习资料文件夹路径
// 返回删除的文档数量
async function deleteDocumentsNotUnderPath(basePath) {
    if (!basePath) return 0;

    // 规范化 basePath：去除末尾分隔符后补一个，避免 C:\Users 误匹配 C:\Users_other
    const normalizedBase = basePath.replace(/[/\\]+$/, '') + path.sep;

    // 查询所有 file_path 不在 basePath 下的文档 id
    // LIKE 不区分大小写（SQLite 默认对 ASCII 字母），LOWER() 仅为明确
    const idsToDelete = await new Promise((resolve, reject) => {
        const sql = `SELECT id FROM documents WHERE file_path IS NOT NULL AND LOWER(file_path) NOT LIKE LOWER(?) || '%'`;
        db.all(sql, [normalizedBase], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => r.id));
        });
    });

    if (idsToDelete.length === 0) {
        return 0;
    }

    // 分批删除（SQLite 单条语句参数数量有限制，每批 500 个）
    const batchSize = 500;
    for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        const placeholders = batch.map(() => '?').join(',');

        await new Promise((resolve, reject) => {
            db.serialize(() => {
                // 临时禁用 FTS 删除触发器，避免逐条触发带来开销
                db.run('DROP TRIGGER IF EXISTS fts_docs_delete', () => {
                    // 按依赖顺序删除关联数据 → FTS 索引 → 主记录
                    db.run(`DELETE FROM document_keywords WHERE document_id IN (${placeholders})`, batch, (err) => {
                        if (err) console.error('批量删除 document_keywords 失败:', err.message);

                        db.run(`DELETE FROM document_tags WHERE document_id IN (${placeholders})`, batch, (err) => {
                            if (err) console.error('批量删除 document_tags 失败:', err.message);

                            db.run(`DELETE FROM fts_docs WHERE rowid IN (${placeholders})`, batch, (err) => {
                                if (err) console.log('批量删除 fts_docs 失败（忽略）:', err.message);

                                db.run(`DELETE FROM documents WHERE id IN (${placeholders})`, batch, (err) => {
                                    if (err) {
                                        console.error('批量删除 documents 失败:', err.message);
                                    }
                                    // 无论是否出错都继续，重建触发器并 resolve
                                    recreateFtsTrigger();
                                    resolve();
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    // 清理删除后孤立的标签与关键词
    await cleanupOrphanedTags();
    await cleanupOrphanedKeywords();

    console.log(`已删除 ${idsToDelete.length} 个不在 ${basePath} 下的文档`);
    return idsToDelete.length;
}

function searchFtsDocuments(query, limit = 5) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT d.id, d.title, d.content, d.file_path, d.file_type,
                   fts_docs.rank
            FROM fts_docs
            JOIN documents d ON fts_docs.rowid = d.id
            WHERE fts_docs MATCH ?
            ORDER BY fts_docs.rank
            LIMIT ?
        `;
        db.all(sql, [query, limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const results = rows.map(row => ({
                    id: row.id,
                    title: row.title,
                    // 不在搜索阶段截断 content，保留完整内容供 qa-service 做关键词精准切片
                    content: row.content || '',
                    filePath: row.file_path,
                    fileType: row.file_type,
                    rank: row.rank
                }));
                resolve(results);
            }
        });
    });
}

function rebuildFtsIndex() {
    db.serialize(() => {
        db.run('DELETE FROM fts_docs');
        db.run('INSERT INTO fts_docs(rowid, title, content) SELECT id, title, content FROM documents');
        console.log('全文索引重建完成');
    });
}

module.exports = {
    db,
    insertDocument,
    updateDocument,
    getDocument,
    getAllDocuments,
    searchDocuments,
    searchChineseDocuments,
    toggleFavorite,
    insertKeywords,
    insertTags,
    getDocumentWithRelations,
    deleteDocument,
    getFavoriteDocuments,
    getDocumentsByTag,
    getDocumentsPaginated,
    getFavoriteDocumentsPaginated,
    searchDocumentsPaginated,
    getDocumentsByTagPaginated,
    getAllTags,
    getAllKeywords,
    getDatabaseSize,
    cleanupOrphanedTags,
    cleanupOrphanedKeywords,
    deleteDocumentsNotUnderPath,
    searchFtsDocuments,
    rebuildFtsIndex
};