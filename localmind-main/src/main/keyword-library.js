// @ts-nocheck
const KEYWORD_CATEGORIES = {
    computerScience: {
        name: '计算机科学',
        keywords: ['algorithm', '算法', 'data structure', '数据结构', 'machine learning', '机器学习', 'deep learning', '深度学习', 'neural network', '神经网络', 'artificial intelligence', '人工智能', 'big data', '大数据', 'cloud computing', '云计算', 'distributed system', '分布式系统', 'database', '数据库', 'sql', 'nosql', 'web development', '网页开发', 'frontend', '前端', 'backend', '后端', 'api', 'rest', 'graphql', 'framework', '框架', 'react', 'vue', 'angular', 'node.js', 'python', 'java', 'c++', 'javascript', 'typescript', 'go', 'rust', 'kotlin', 'swift', 'linux', 'unix', 'windows', 'macos', 'docker', 'kubernetes', 'devops', 'ci/cd', 'git', 'security', '网络安全', 'cryptography', '加密', 'cybersecurity', '网络安全', 'bug', '漏洞', 'performance', '性能', 'optimization', '优化', 'scalability', '可扩展性', 'microservices', '微服务', 'blockchain', '区块链', 'crypto', '加密货币', 'nlp', '自然语言处理', 'cv', '计算机视觉', 'reinforcement learning', '强化学习', 'robotics', '机器人', 'iot', '物联网'],
        tags: ['计算机科学', '编程', '算法', '数据', 'AI', '网络', '安全']
    },
    mathematics: {
        name: '数学',
        keywords: ['calculus', '微积分', 'linear algebra', '线性代数', 'probability', '概率', 'statistics', '统计学', 'geometry', '几何', 'topology', '拓扑', 'algebra', '代数', 'number theory', '数论', 'differential equation', '微分方程', 'optimization', '优化', 'numerical analysis', '数值分析', 'graph theory', '图论', 'combinatorics', '组合数学', 'measure theory', '测度论', 'functional analysis', '泛函分析', 'complex analysis', '复分析', 'real analysis', '实分析', 'discrete math', '离散数学', 'logic', '逻辑', 'set theory', '集合论', 'category theory', '范畴论', 'fourier', '傅里叶', 'laplace', '拉普拉斯', 'eigenvalue', '特征值', 'matrix', '矩阵', 'vector', '向量', 'tensor', '张量', 'manifold', '流形'],
        tags: ['数学', '计算', '统计', '几何', '代数', '分析']
    },
    physics: {
        name: '物理学',
        keywords: ['mechanics', '力学', 'thermodynamics', '热力学', 'electromagnetism', '电磁学', 'quantum mechanics', '量子力学', 'relativity', '相对论', 'astrophysics', '天体物理', 'particle physics', '粒子物理', 'condensed matter', '凝聚态物理', 'optics', '光学', 'acoustics', '声学', 'fluid dynamics', '流体力学', 'solid mechanics', '固体力学', 'plasma physics', '等离子体物理', 'nuclear physics', '核物理', 'biophysics', '生物物理', 'computational physics', '计算物理', 'photonics', '光子学', 'nanotechnology', '纳米技术', 'energy', '能量', 'force', '力', 'mass', '质量', 'charge', '电荷', 'field', '场', 'wave', '波', 'particle', '粒子', 'atom', '原子', 'molecule', '分子', 'gravity', '引力', 'entropy', '熵', 'quantum', '量子', 'qubit', '量子比特'],
        tags: ['物理', '力学', '量子', '相对论', '能量', '光学']
    },
    chemistry: {
        name: '化学',
        keywords: ['organic chemistry', '有机化学', 'inorganic chemistry', '无机化学', 'analytical chemistry', '分析化学', 'physical chemistry', '物理化学', 'biochemistry', '生物化学', 'materials science', '材料科学', 'polymer', '聚合物', 'catalysis', '催化', 'reaction', '反应', 'synthesis', '合成', 'bond', '化学键', 'molecule', '分子', 'atom', '原子', 'ion', '离子', 'solution', '溶液', 'acid', '酸', 'base', '碱', 'oxidation', '氧化', 'reduction', '还原', 'equilibrium', '平衡', 'thermodynamics', '热力学', 'spectroscopy', '光谱学', 'mass spectrometry', '质谱', 'chromatography', '色谱', 'crystal', '晶体', 'nanoparticle', '纳米粒子', 'colloid', '胶体', 'electrochemistry', '电化学', 'surface chemistry', '表面化学'],
        tags: ['化学', '有机', '无机', '材料', '反应', '分析']
    },
    biology: {
        name: '生物学',
        keywords: ['genetics', '遗传学', 'molecular biology', '分子生物学', 'cell biology', '细胞生物学', 'ecology', '生态学', 'evolution', '进化论', 'biochemistry', '生物化学', 'neuroscience', '神经科学', 'immunology', '免疫学', 'microbiology', '微生物学', 'biotechnology', '生物技术', 'bioinformatics', '生物信息学', 'proteomics', '蛋白质组学', 'genomics', '基因组学', 'transcriptomics', '转录组学', 'metabolomics', '代谢组学', 'cell', '细胞', 'dna', '脱氧核糖核酸', 'rna', '核糖核酸', 'protein', '蛋白质', 'enzyme', '酶', 'gene', '基因', 'chromosome', '染色体', 'mutation', '突变', 'species', '物种', 'organism', '生物体', 'tissue', '组织', 'organ', '器官', 'system', '系统', 'brain', '大脑', 'neuron', '神经元', 'virus', '病毒', 'bacteria', '细菌', 'fungi', '真菌', 'plant', '植物', 'animal', '动物'],
        tags: ['生物', '基因', '细胞', '生态', '进化', '神经']
    },
    medicine: {
        name: '医学',
        keywords: ['medicine', '医学', 'pharmacy', '药学', 'clinical', '临床', 'diagnosis', '诊断', 'treatment', '治疗', 'disease', '疾病', 'virus', '病毒', 'bacteria', '细菌', 'infection', '感染', 'immunology', '免疫学', 'pathology', '病理学', 'physiology', '生理学', 'anatomy', '解剖学', 'pharmacology', '药理学', 'toxicology', '毒理学', 'oncology', '肿瘤学', 'cardiology', '心脏病学', 'neurology', '神经病学', 'psychiatry', '精神病学', 'surgery', '外科', 'radiology', '放射学', 'laboratory', '实验室', 'blood', '血液', 'cell', '细胞', 'dna', '脱氧核糖核酸', 'protein', '蛋白质', 'drug', '药物', 'antibiotic', '抗生素', 'vaccine', '疫苗', 'immunization', '免疫', 'health', '健康', 'patient', '患者', 'doctor', '医生', 'hospital', '医院', 'clinic', '诊所', 'emergency', '急诊', 'rehabilitation', '康复'],
        tags: ['医学', '诊断', '治疗', '疾病', '药物', '健康']
    },
    economics: {
        name: '经济学',
        keywords: ['economics', '经济学', 'microeconomics', '微观经济学', 'macroeconomics', '宏观经济学', 'finance', '金融', 'investment', '投资', 'trade', '贸易', 'market', '市场', 'supply', '供给', 'demand', '需求', 'price', '价格', 'inflation', '通货膨胀', 'deflation', '通货紧缩', 'gdp', '国内生产总值', 'gnp', '国民生产总值', 'unemployment', '失业', 'monetary policy', '货币政策', 'fiscal policy', '财政政策', 'central bank', '中央银行', 'interest rate', '利率', 'exchange rate', '汇率', 'stock', '股票', 'bond', '债券', 'currency', '货币', 'bank', '银行', 'credit', '信贷', 'insurance', '保险', 'risk', '风险', 'capital', '资本', 'profit', '利润', 'cost', '成本', 'revenue', '收入', 'consumer', '消费者', 'producer', '生产者', 'competition', '竞争', 'monopoly', '垄断', 'oligopoly', '寡头'],
        tags: ['经济', '金融', '市场', '投资', '贸易', '政策']
    },
    psychology: {
        name: '心理学',
        keywords: ['psychology', '心理学', 'cognitive psychology', '认知心理学', 'social psychology', '社会心理学', 'developmental psychology', '发展心理学', 'clinical psychology', '临床心理学', 'neuropsychology', '神经心理学', 'personality', '人格', 'emotion', '情绪', 'cognition', '认知', 'memory', '记忆', 'attention', '注意力', 'learning', '学习', 'perception', '感知', 'thinking', '思维', 'intelligence', '智力', 'motivation', '动机', 'behavior', '行为', 'attitude', '态度', 'prejudice', '偏见', 'stereotype', '刻板印象', 'group', '群体', 'leadership', '领导力', 'communication', '沟通', 'conflict', '冲突', 'stress', '压力', 'anxiety', '焦虑', 'depression', '抑郁', 'therapy', '治疗', 'psychotherapy', '心理治疗', 'experiment', '实验', 'survey', '调查', 'research', '研究', 'theory', '理论'],
        tags: ['心理', '认知', '行为', '情绪', '社会', '发展']
    },
    engineering: {
        name: '工程学',
        keywords: ['engineering', '工程', 'mechanical engineering', '机械工程', 'electrical engineering', '电气工程', 'civil engineering', '土木工程', 'chemical engineering', '化学工程', 'aerospace engineering', '航空航天工程', 'computer engineering', '计算机工程', 'industrial engineering', '工业工程', 'materials engineering', '材料工程', 'biomedical engineering', '生物医学工程', 'environmental engineering', '环境工程', 'software engineering', '软件工程', 'hardware', '硬件', 'circuit', '电路', 'signal', '信号', 'control', '控制', 'system', '系统', 'design', '设计', 'manufacturing', '制造', 'construction', '建筑', 'structure', '结构', 'material', '材料', 'thermal', '热', 'fluid', '流体', 'acoustic', '声学', 'power', '电力', 'energy', '能源', 'renewable', '可再生', 'solar', '太阳能', 'wind', '风能', 'nuclear', '核能'],
        tags: ['工程', '机械', '电气', '土木', '材料', '系统']
    },
    socialScience: {
        name: '社会科学',
        keywords: ['sociology', '社会学', 'anthropology', '人类学', 'political science', '政治学', 'history', '历史', 'geography', '地理学', 'law', '法律', 'education', '教育', 'communication', '传播学', 'economics', '经济学', 'psychology', '心理学', 'philosophy', '哲学', 'culture', '文化', 'society', '社会', 'community', '社区', 'organization', '组织', 'institution', '制度', 'government', '政府', 'policy', '政策', 'public', '公共', 'international', '国际', 'global', '全球', 'nation', '国家', 'region', '地区', 'city', '城市', 'population', '人口', 'demography', '人口学', 'urban', '城市', 'rural', '农村', 'migration', '移民', 'development', '发展', 'poverty', '贫困', 'inequality', '不平等', 'justice', '正义', 'rights', '权利', 'freedom', '自由', 'democracy', '民主'],
        tags: ['社会', '政治', '历史', '文化', '法律', '教育']
    },
    literature: {
        name: '文学',
        keywords: ['literature', '文学', 'novel', '小说', 'poetry', '诗歌', 'drama', '戏剧', 'prose', '散文', 'fiction', '虚构', 'non-fiction', '非虚构', 'classic', '经典', 'modern', '现代', 'contemporary', '当代', 'ancient', '古代', 'medieval', '中世纪', 'romance', '浪漫', 'tragedy', '悲剧', 'comedy', '喜剧', 'mystery', '悬疑', 'science fiction', '科幻', 'fantasy', '奇幻', 'horror', '恐怖', 'adventure', '冒险', 'biography', '传记', 'autobiography', '自传', 'memoir', '回忆录', 'essay', '随笔', 'story', '故事', 'character', '人物', 'plot', '情节', 'theme', '主题', 'setting', '背景', 'narrative', '叙事', 'style', '风格', 'author', '作者', 'publisher', '出版社', 'literary', '文学的', 'critical', '批评', 'theory', '理论', 'analysis', '分析'],
        tags: ['文学', '小说', '诗歌', '戏剧', '经典', '故事']
    },
    business: {
        name: '商业',
        keywords: ['business', '商业', 'management', '管理', 'marketing', '市场营销', 'finance', '金融', 'accounting', '会计', 'strategy', '战略', 'entrepreneurship', '创业', 'innovation', '创新', 'startup', '初创企业', 'corporate', '企业', 'company', '公司', 'industry', '行业', 'market', '市场', 'customer', '客户', 'consumer', '消费者', 'product', '产品', 'service', '服务', 'brand', '品牌', 'advertising', '广告', 'sales', '销售', 'revenue', '收入', 'profit', '利润', 'cost', '成本', 'investment', '投资', 'capital', '资本', 'funding', '融资', 'venture capital', '风险投资', 'private equity', '私募股权', 'merger', '并购', 'acquisition', '收购', 'partnership', '合作', 'competition', '竞争', 'leadership', '领导力', 'team', '团队', 'employee', '员工', 'human resources', '人力资源', 'training', '培训', 'development', '发展'],
        tags: ['商业', '管理', '市场', '营销', '金融', '战略']
    },
    education: {
        name: '教育',
        keywords: ['education', '教育', 'learning', '学习', 'teaching', '教学', 'school', '学校', 'university', '大学', 'college', '学院', 'student', '学生', 'teacher', '教师', 'professor', '教授', 'curriculum', '课程', 'syllabus', '教学大纲', 'classroom', '课堂', 'online', '在线', 'distance learning', '远程学习', 'e-learning', '电子学习', 'mooc', '慕课', 'blended learning', '混合学习', 'assessment', '评估', 'examination', '考试', 'test', '测试', 'grade', '成绩', 'degree', '学位', 'diploma', '文凭', 'certificate', '证书', 'research', '研究', 'thesis', '论文', 'dissertation', '博士论文', 'scholarship', '奖学金', 'admission', '录取', 'enrollment', '注册', 'pedagogy', '教育学', 'andragogy', '成人教育学', 'cognitive', '认知', 'development', '发展', 'psychology', '心理学', 'technology', '技术'],
        tags: ['教育', '学习', '教学', '学校', '课程', '评估']
    },
    technology: {
        name: '技术',
        keywords: ['technology', '技术', 'innovation', '创新', 'digital', '数字', 'internet', '互联网', 'mobile', '移动', 'smart', '智能', 'device', '设备', 'hardware', '硬件', 'software', '软件', 'application', '应用', 'platform', '平台', 'system', '系统', 'network', '网络', 'communication', '通信', 'wireless', '无线', '5g', '5G', 'wifi', 'Wi-Fi', 'bluetooth', '蓝牙', 'sensor', '传感器', 'robotics', '机器人', 'automation', '自动化', 'ai', '人工智能', 'machine learning', '机器学习', 'data', '数据', 'analytics', '分析', 'big data', '大数据', 'cloud', '云', 'saas', '软件即服务', 'paas', '平台即服务', 'iaas', '基础设施即服务', 'cybersecurity', '网络安全', 'privacy', '隐私', 'encryption', '加密', 'authentication', '认证', 'authorization', '授权'],
        tags: ['技术', '创新', '数字', '互联网', '智能', '数据']
    },
    environment: {
        name: '环境',
        keywords: ['environment', '环境', 'ecology', '生态学', 'climate', '气候', 'weather', '天气', 'pollution', '污染', 'conservation', '保护', 'sustainability', '可持续性', 'green', '绿色', 'energy', '能源', 'renewable', '可再生', 'carbon', '碳', 'emission', '排放', 'global warming', '全球变暖', 'ozone', '臭氧', 'biodiversity', '生物多样性', 'ecosystem', '生态系统', 'habitat', '栖息地', 'natural resource', '自然资源', 'water', '水', 'air', '空气', 'soil', '土壤', 'forest', '森林', 'ocean', '海洋', 'wildlife', '野生动物', 'recycle', '回收', 'waste', '废物', 'plastic', '塑料', 'deforestation', '森林砍伐', 'desertification', '沙漠化', 'urbanization', '城市化', 'environmental policy', '环境政策', 'regulation', '法规', 'international', '国际', 'agreement', '协议', 'paris', '巴黎', 'cop'],
        tags: ['环境', '气候', '生态', '能源', '保护', '可持续']
    }
};

function extractKeywords(text) {
    const result = new Set();
    const lowerText = text.toLowerCase();
    for (const category of Object.values(KEYWORD_CATEGORIES)) {
        for (const keyword of category.keywords) {
            const lowerKeyword = keyword.toLowerCase();
            if (lowerText.includes(lowerKeyword)) {
                result.add(keyword.split('/')[0].trim());
            }
        }
    }
    return Array.from(result).slice(0, 15);
}

function generateTags(text) {
    const categoryScores = {};
    const lowerText = text.toLowerCase();
    for (const [key, category] of Object.entries(KEYWORD_CATEGORIES)) {
        let score = 0;
        for (const keyword of category.keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                score++;
            }
        }
        categoryScores[key] = score;
    }
    const sortedCategories = Object.entries(categoryScores).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const tags = new Set();
    for (const [key] of sortedCategories) {
        const category = KEYWORD_CATEGORIES[key];
        tags.add(category.name);
        for (const tag of category.tags) {
            if (tags.size < 8) {
                tags.add(tag);
            }
        }
    }
    return Array.from(tags).slice(0, 8);
}

function categorizeDocument(text) {
    const categoryScores = {};
    const lowerText = text.toLowerCase();
    for (const [key, category] of Object.entries(KEYWORD_CATEGORIES)) {
        let score = 0;
        for (const keyword of category.keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                score++;
            }
        }
        categoryScores[key] = score;
    }
    const sorted = Object.entries(categoryScores).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
        return { primary: '其他', secondary: [], confidence: 0 };
    }
    const primary = KEYWORD_CATEGORIES[sorted[0][0]].name;
    const secondary = sorted.slice(1, 3).map(([key]) => KEYWORD_CATEGORIES[key].name);
    const maxScore = sorted[0][1];
    const totalScore = Object.values(categoryScores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.round((maxScore / totalScore) * 100) : 0;
    return { primary, secondary, confidence };
}

module.exports = { KEYWORD_CATEGORIES, extractKeywords, generateTags, categorizeDocument };
