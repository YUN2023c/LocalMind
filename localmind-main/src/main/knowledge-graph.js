// @ts-nocheck
/**
 * 知识图谱生成模块（纯本地算法，不依赖 LLM）
 *
 * 算法流程：
 * 1. 文本预处理：按标点符号分割句子
 * 2. 关键词提取：基于 N-gram + 词频统计，过滤停用词
 * 3. 共现矩阵构建：统计关键词对在同一句子中的共现次数
 * 4. 力导向布局（Force-Directed Layout）：迭代计算排斥力与吸引力，生成节点坐标
 *
 * 参考算法：
 * - Fruchterman-Reingold 力导向布局算法
 * - 关键词共现分析（Keyword Co-occurrence Analysis）
 */

// ==================== 停用词表 ====================

// 中文常见停用词，提取关键词时过滤这些无实际语义的词
const STOP_WORDS = new Set([
    '我们', '你们', '他们', '她们', '它们', '这个', '那个', '这些', '那些', '什么', '怎么',
    '可以', '应该', '需要', '必须', '可能', '或者', '但是', '因为', '所以', '如果', '虽然',
    '然而', '因此', '而且', '并且', '或者', '还是', '就是', '只是', '还是', '也是', '都是',
    '一个', '一些', '一种', '一样', '一直', '一定', '一般', '一起', '一切', '一方面',
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '上', '也', '很',
    '到', '说', '要', '去', '会', '着', '没有', '看', '好', '自己', '这', '那', '它', '他',
    '她', '与', '及', '或', '但', '而', '则', '为', '以', '于', '对', '从', '把', '被', '让',
    '使', '给', '向', '往', '由', '由于', '对于', '关于', '至于', '除了',
    '进行', '通过', '根据', '按照', '随着', '沿着', '本着',
    '现在', '目前', '将来', '过去', '未来', '今天', '明天', '昨天',
    '非常', '十分', '特别', '尤其', '尤其', '格外', '相当', '比较', '稍微',
    '已经', '正在', '将要', '即将', '刚刚', '才', '就', '还', '再', '又',
    '更', '最', '很', '太', '极', '颇', '稍', '颇',
    '的话', '的话', '之类', '等等', '之类的', '什么的',
    '不仅', '不但', '而且', '还', '反而', '反之',
    '即', '便', '就', '才', '则',
    '吧', '吗', '呢', '啊', '哦', '嗯', '呀', '哇', '哈',
    '你们', '我们', '他们', '大家', '咱们',
    '里面', '外面', '上面', '下面', '前面', '后面', '左面', '右面', '中间',
    '里面', '其中', '此外', '另外', '同时', '与此同时',
    '本文', '本节', '本章', '本书', '本研究', '本项目',
    '如图', '如下', '如下所示', '如上所述', '如表所示',
    '总之', '总的来看', '总的来说', '综合来看', '由此可见', '由此可知',
    '例如', '比如', '譬如', '如同', '好像', '似乎', '仿佛',
    '即', '也就是', '那就是', '也就是指',
    '不仅', '而且', '还', '同时', '此外',
    '尽管', '即使', '哪怕', '就算',
    '的话',
    '之后', '之前', '之间', '之内', '之外', '之上', '之下',
    '多', '少', '大', '小', '高', '低', '长', '短', '宽', '窄', '厚', '薄',
    '新', '旧', '好', '坏', '快', '慢', '强', '弱', '重', '轻',
    '第一', '第二', '第三', '第四', '第五', '最后',
    '一些', '许多', '大量', '少量', '所有', '全部', '全', '都', '每个', '每',
    '个', '种', '类', '样', '次', '回', '遍', '趟', '场', '件',
]);

// ==================== 文本预处理 ====================

/**
 * 将文本按句子分割
 * 中文句号、问号、叹号、分号以及换行符都作为句子分隔符
 * @param {string} text - 原始文本
 * @returns {string[]} 句子数组（已去除空白和过短片段）
 */
function splitSentences(text) {
    if (!text || typeof text !== 'string') return [];
    // 按中英文标点符号和换行符分割
    const sentences = text.split(/[。！？；\n\r.!?;]+/);
    // 过滤空白和过短句子（少于 4 字符的句子信息量不足）
    return sentences
        .map(s => s.trim())
        .filter(s => s.length >= 4);
}

// ==================== 关键词提取 ====================

/**
 * 判断字符是否为词边界字符（标点、数字、空白等）
 * @param {string} ch - 单个字符
 * @returns {boolean} 是否为边界字符
 */
function isBoundaryChar(ch) {
    if (!ch) return true;
    // 标点符号、数字、空白、英文、特殊符号都是边界
    const boundaryRegex = /[\u3000-\u303f\uff00-\uffef\s\d\w,，.。!！?？;；:：""''、·…—()（）\[\]【】{}《》<>\-_=+*&^%$#@~`|\\\/]/;
    return boundaryRegex.test(ch);
}

/**
 * 从文本中提取候选词（N-gram 滑动窗口 + 词边界检测）
 * 提取 2-4 字的中文连续片段作为候选词，确保在文本中是完整的词汇单元
 * @param {string} text - 原始文本
 * @returns {string[]} 候选词数组
 */
function extractCandidateWords(text) {
    const candidates = [];
    // 匹配连续的中文字符段（至少 2 字）
    const chineseSegments = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    // 匹配英文单词（至少 3 字母）
    const englishWords = text.match(/[a-zA-Z]{3,}/g) || [];

    for (const segment of chineseSegments) {
        // 用 2-4 字滑动窗口提取候选词
        for (let len = 2; len <= Math.min(4, segment.length); len++) {
            for (let i = 0; i <= segment.length - len; i++) {
                const word = segment.substring(i, i + len);
                // 过滤停用词
                if (STOP_WORDS.has(word)) continue;
                
                // 词边界检测：检查候选词在原始文本中的前后字符
                // 如果候选词前后都是中文（非边界字符），则可能是更长词的一部分
                const prevChar = text[text.indexOf(word) - 1];
                const nextChar = text[text.indexOf(word) + word.length];
                
                // 只有当候选词的前一个字符或后一个字符是边界时，才认为是完整词
                // 对于4字词，放宽条件：允许前后都不是边界（可能是固定短语）
                const isBoundaryOk = len === 4 || isBoundaryChar(prevChar) || isBoundaryChar(nextChar);
                
                if (isBoundaryOk) {
                    candidates.push(word);
                }
            }
        }
    }

    // 英文单词直接作为候选词（转小写）
    for (const word of englishWords) {
        const lower = word.toLowerCase();
        if (!STOP_WORDS.has(lower)) {
            candidates.push(lower);
        }
    }

    return candidates;
}

/**
 * 统计词频并选择 Top-N 关键词
 * 使用简单的 TF（词频）统计，较长的词适当加权
 * @param {string} text - 原始文本
 * @param {number} topN - 返回的关键词数量
 * @returns {Array<{word: string, freq: number}>} 关键词列表（按频率降序）
 */
function extractKeywords(text, topN = 15) {
    const candidates = extractCandidateWords(text);

    // 统计词频
    const freqMap = new Map();
    for (const word of candidates) {
        freqMap.set(word, (freqMap.get(word) || 0) + 1);
    }

    // 转换为数组并排序
    // 加权策略：词频 * 词长权重（较长的词通常语义更丰富）
    // 词长权重：2字=1.0, 3字=1.2, 4字=1.5, 英文=1.0
    const keywords = [];
    for (const [word, freq] of freqMap) {
        const wordLen = word.length;
        let lengthWeight;
        if (/[\u4e00-\u9fa5]/.test(word)) {
            // 中文词：按长度加权
            lengthWeight = wordLen === 2 ? 1.0 : (wordLen === 3 ? 1.2 : 1.5);
        } else {
            // 英文词
            lengthWeight = 1.0;
        }
        const score = freq * lengthWeight;
        // 过滤频率过低的词（只出现 1 次的 2 字词可能是噪声）
        if (freq >= 2 || wordLen >= 3) {
            keywords.push({ word, freq, score });
        }
    }

    // 按加权分数降序排序
    keywords.sort((a, b) => b.score - a.score);

    // 检查两个词是否有重叠部分（前缀或后缀重叠超过一半）
    function hasSignificantOverlap(w1, w2) {
        if (w1 === w2) return true;
        const minLen = Math.min(w1.length, w2.length);
        const overlapThreshold = Math.ceil(minLen * 0.6);
        
        // 前缀重叠：w1 的前缀与 w2 的后缀重叠，或反之
        let prefixOverlap = 0;
        for (let i = 0; i < minLen; i++) {
            if (w1[i] === w2[i]) prefixOverlap++;
            else break;
        }
        
        // 后缀重叠
        let suffixOverlap = 0;
        for (let i = 0; i < minLen; i++) {
            if (w1[w1.length - 1 - i] === w2[w2.length - 1 - i]) suffixOverlap++;
            else break;
        }
        
        return prefixOverlap >= overlapThreshold || suffixOverlap >= overlapThreshold;
    }

    // 去重：过滤被更长词包含的短词，以及有显著重叠的词
    const selected = [];
    const selectedTexts = new Set();
    for (const kw of keywords) {
        let isSubsumed = false;
        for (const selectedKw of selected) {
            // 情况1：完全包含关系（短词被长词完全包含）
            if (selectedKw.word.includes(kw.word) && selectedKw.word !== kw.word) {
                isSubsumed = true;
                break;
            }
            // 情况2：显著重叠（前缀或后缀重叠超过60%），保留更长的词
            if (hasSignificantOverlap(kw.word, selectedKw.word)) {
                // 如果当前词更短或分数更低，则被淘汰
                if (kw.word.length <= selectedKw.word.length || kw.score <= selectedKw.score) {
                    isSubsumed = true;
                    break;
                }
            }
        }
        if (!isSubsumed && !selectedTexts.has(kw.word)) {
            selected.push(kw);
            selectedTexts.add(kw.word);
        }
        if (selected.length >= topN) break;
    }

    return selected;
}

// ==================== 共现矩阵构建 ====================

/**
 * 构建关键词共现矩阵
 * 扫描每个句子，统计关键词对在同一句子中的共现次数
 * @param {string[]} sentences - 句子数组
 * @param {string[]} keywords - 关键词数组
 * @returns {Map<string, number>} 共现计数 Map，key 格式为 "word1|word2"（word1 < word2）
 */
function buildCooccurrenceMatrix(sentences, keywords) {
    const keywordSet = new Set(keywords);
    const cooccurrence = new Map();

    for (const sentence of sentences) {
        // 找出当前句子中出现的所有关键词
        const presentKeywords = [];
        for (const kw of keywords) {
            if (sentence.includes(kw)) {
                presentKeywords.push(kw);
            }
        }

        // 对每对共现的关键词，增加共现计数
        for (let i = 0; i < presentKeywords.length; i++) {
            for (let j = i + 1; j < presentKeywords.length; j++) {
                // 规范化 key：字典序较小的词在前
                const w1 = presentKeywords[i];
                const w2 = presentKeywords[j];
                const key = w1 < w2 ? w1 + '|' + w2 : w2 + '|' + w1;
                cooccurrence.set(key, (cooccurrence.get(key) || 0) + 1);
            }
        }
    }

    return cooccurrence;
}

// ==================== 力导向布局算法 ====================

/**
 * Fruchterman-Reingold 力导向布局算法
 * 通过迭代计算排斥力与吸引力，生成节点在二维平面上的坐标分布
 *
 * 核心思想：
 * - 所有节点对之间存在排斥力（类似库仑力），使节点相互散开
 * - 有边连接的节点之间存在吸引力（类似弹簧力），使相关节点靠近
 * - 通过多次迭代逐渐收敛到稳定布局
 *
 * @param {Array} nodes - 节点数组，每个节点有 id、label、weight 属性
 * @param {Array} links - 边数组，每条边有 source、target、weight 属性
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} iterations - 迭代次数（默认 200）
 * @returns {Array} 带坐标的节点数组
 */
function forceDirectedLayout(nodes, links, width, height, iterations = 300) {
    if (nodes.length === 0) return nodes;
    // 节点数过少时布局意义不大，直接圆形排列
    if (nodes.length === 1) {
        nodes[0].x = width / 2;
        nodes[0].y = height / 2;
        return nodes;
    }

    const cx = width / 2;
    const cy = height / 2;
    const area = width * height;
    // 理想距离 k = sqrt(area / n)，n 为节点数
    // 系数 1.1 让节点间距更宽松，避免挤堆
    const k = Math.sqrt(area / nodes.length) * 1.1;
    const k2 = k * k;

    // 初始化节点位置：在中心周围较大的圆环上随机分布，避免初始重叠
    const nodeMap = new Map();
    nodes.forEach((node, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 + Math.random() * 0.3;
        // 初始半径取 k 的 2 倍，让节点从较远位置开始扩散
        const radius = k * 2.0;
        node.x = cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 30;
        node.y = cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 30;
        node.vx = 0;
        node.vy = 0;
        nodeMap.set(node.id, node);
    });

    // 预处理边：将 source/target 从 id 转为节点引用
    const edges = links.map(link => ({
        source: nodeMap.get(link.source),
        target: nodeMap.get(link.target),
        weight: link.weight || 1
    })).filter(e => e.source && e.target);

    // 迭代计算
    // 初始温度取画布短边的 1/3，保证初期有足够大的位移让节点散开
    const temperature = Math.min(width, height) / 3;
    const minTemp = temperature * 0.02; // 最小温度

    for (let iter = 0; iter < iterations; iter++) {
        // 温度随迭代衰减（前 80% 线性衰减，后期保持最小温度）
        const temp = temperature * (1 - iter / iterations);
        const clampedTemp = Math.max(temp, minTemp);

        // ===== 1. 计算排斥力（所有节点对之间） =====
        for (const node of nodes) {
            node.vx = 0;
            node.vy = 0;
        }

        for (let i = 0; i < nodes.length; i++) {
            const v = nodes[i];
            for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                const u = nodes[j];
                let dx = v.x - u.x;
                let dy = v.y - u.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                // 避免除零
                if (dist < 0.01) {
                    dist = 0.01;
                    dx = Math.random() - 0.5;
                    dy = Math.random() - 0.5;
                }
                // 排斥力大小 = k² / dist
                const repulsion = k2 / dist;
                // 排斥力方向：从 u 指向 v（推开）
                v.vx += (dx / dist) * repulsion;
                v.vy += (dy / dist) * repulsion;
            }
        }

        // ===== 2. 计算吸引力（有边连接的节点之间） =====
        for (const edge of edges) {
            const v = edge.source;
            const u = edge.target;
            let dx = v.x - u.x;
            let dy = v.y - u.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01) {
                dist = 0.01;
                dx = Math.random() - 0.5;
                dy = Math.random() - 0.5;
            }
            // 吸引力大小 = dist² / k
            // 权重因子限制在 [1, 2] 之间，避免高共现次数把节点拉得过近
            const weightFactor = Math.min(2, 1 + (edge.weight - 1) * 0.15);
            const attraction = (dist * dist / k) * weightFactor;
            // 吸引力方向：从 v 指向 u（拉近）
            v.vx -= (dx / dist) * attraction;
            v.vy -= (dy / dist) * attraction;
            u.vx += (dx / dist) * attraction;
            u.vy += (dy / dist) * attraction;
        }

        // ===== 3. 中心引力（防止图谱飘走） =====
        // 系数取 0.003，远小于典型值，避免把节点拉回中心导致挤堆
        for (const node of nodes) {
            const dx = cx - node.x;
            const dy = cy - node.y;
            node.vx += dx * 0.003;
            node.vy += dy * 0.003;
        }

        // ===== 4. 更新位置（限制最大位移为当前温度） =====
        for (const node of nodes) {
            let dx = node.vx;
            let dy = node.vy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                // 限制最大位移
                const limitedDist = Math.min(dist, clampedTemp);
                node.x += (dx / dist) * limitedDist;
                node.y += (dy / dist) * limitedDist;
            }

            // 边界约束：确保节点不超出画布
            const margin = 40;
            node.x = Math.max(margin, Math.min(width - margin, node.x));
            node.y = Math.max(margin, Math.min(height - margin, node.y));
        }
    }

    return nodes;
}

// ==================== 图谱生成主函数 ====================

/**
 * 从文本生成知识图谱数据
 * 完整流程：句子分割 → 关键词提取 → 共现矩阵 → 力导向布局
 *
 * @param {string} text - 文档文本内容
 * @param {object} options - 配置选项
 * @param {number} options.maxKeywords - 最大关键词数量（默认 12）
 * @param {number} options.width - 画布宽度（默认 600）
 * @param {number} options.height - 画布高度（默认 400）
 * @param {number} options.iterations - 布局迭代次数（默认 200）
 * @param {string} options.title - 文档标题（作为中心节点）
 * @returns {object} 图谱数据 { nodes, links, stats }
 */
function generateGraph(text, options = {}) {
    const {
        maxKeywords = 12,
        width = 600,
        height = 400,
        iterations = 200,
        title = null
    } = options;

    if (!text || text.trim().length === 0) {
        return { nodes: [], links: [], stats: { keywordCount: 0, edgeCount: 0 } };
    }

    // 1. 句子分割
    const sentences = splitSentences(text);

    // 2. 关键词提取
    const keywordsRaw = extractKeywords(text, maxKeywords);

    if (keywordsRaw.length === 0) {
        return { nodes: [], links: [], stats: { keywordCount: 0, edgeCount: 0 } };
    }

    const keywords = keywordsRaw.map(k => k.word);
    const keywordFreq = new Map(keywordsRaw.map(k => [k.word, k.freq]));

    // 3. 构建共现矩阵
    const cooccurrence = buildCooccurrenceMatrix(sentences, keywords);

    // 4. 构建图数据
    // 节点：关键词 + 可选的文档标题中心节点
    const nodes = [];
    const links = [];

    // 如果有标题，添加文档中心节点
    let hasCenterNode = false;
    if (title && title.trim()) {
        const centerLabel = title.length > 12 ? title.substring(0, 12) + '...' : title;
        nodes.push({
            id: '__doc_center__',
            label: centerLabel,
            type: 'document',
            weight: Math.max(...keywordFreq.values()) + 2, // 中心节点最大
            freq: 0
        });
        hasCenterNode = true;
    }

    // 添加关键词节点
    const maxFreq = Math.max(...keywordFreq.values(), 1);
    for (const kw of keywordsRaw) {
        nodes.push({
            id: kw.word,
            label: kw.word,
            type: 'keyword',
            weight: kw.freq,
            freq: kw.freq,
            // 归一化权重（0.3 ~ 1.0），用于后续渲染节点大小
            normalizedWeight: 0.3 + 0.7 * (kw.freq / maxFreq)
        });

        // 如果有中心节点，每个关键词都连到中心
        if (hasCenterNode) {
            links.push({
                source: '__doc_center__',
                target: kw.word,
                weight: kw.freq,
                type: 'keyword-link'
            });
        }
    }

    // 添加共现边（关键词之间）
    for (const [key, count] of cooccurrence) {
        const [w1, w2] = key.split('|');
        // 只保留共现次数 >= 1 的边
        if (count >= 1) {
            links.push({
                source: w1,
                target: w2,
                weight: count,
                type: 'cooccurrence'
            });
        }
    }

    // 5. 力导向布局
    forceDirectedLayout(nodes, links, width, height, iterations);

    // 6. 清理临时属性，返回最终数据
    const finalNodes = nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        x: Math.round(n.x),
        y: Math.round(n.y),
        weight: n.weight,
        freq: n.freq,
        normalizedWeight: n.normalizedWeight || 1
    }));

    const finalLinks = links.map(l => ({
        source: l.source,
        target: l.target,
        weight: l.weight,
        type: l.type
    }));

    return {
        nodes: finalNodes,
        links: finalLinks,
        stats: {
            keywordCount: keywordsRaw.length,
            edgeCount: finalLinks.length,
            cooccurrenceEdgeCount: finalLinks.filter(l => l.type === 'cooccurrence').length,
            sentenceCount: sentences.length
        }
    };
}

module.exports = {
    generateGraph,
    extractKeywords,
    splitSentences,
    buildCooccurrenceMatrix,
    forceDirectedLayout
};
