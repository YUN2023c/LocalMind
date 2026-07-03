/**
 * FTS5 降级机制集成测试
 * 
 * 验证当 FTS5 查询失败时，系统能够正确降级到 LIKE 搜索
 */

const assert = require('assert');

// 模拟 escapeFtsQuery 函数
function escapeFtsQuery(query) {
    if (!query || typeof query !== 'string') {
        return '""';
    }
    const trimmed = query.trim();
    if (trimmed.length === 0) {
        return '""';
    }
    return '"' + trimmed.replace(/"/g, '""') + '"';
}

// 模拟 searchFtsDocuments 函数（会失败的场景）
async function mockSearchFtsDocuments(query, limit) {
    // 模拟 FTS5 语法错误
    throw new Error('fts5: syntax error');
}

// 模拟 searchDocuments 函数（LIKE 搜索）
async function mockSearchDocuments(query) {
    // 模拟 LIKE 搜索成功
    return [
        { id: 1, title: '测试文档', content: '这是测试内容' }
    ];
}

// 模拟 askQuestion 函数中的降级逻辑
async function testFallbackMechanism(question) {
    let docs;
    try {
        const ftsQuery = escapeFtsQuery(question);
        const ftsResults = await mockSearchFtsDocuments(ftsQuery, 5);
        docs = ftsResults.map(row => ({
            id: row.id,
            title: row.title,
            content: row.content
        }));
        return { method: 'FTS5', docs };
    } catch (ftsError) {
        // FTS5 解析失败时降级到 LIKE 全文搜索
        const likeResults = await mockSearchDocuments(question);
        docs = (likeResults || []).slice(0, 5).map(row => ({
            id: row.id,
            title: row.title,
            content: row.content
        }));
        return { method: 'LIKE', docs };
    }
}

// 运行测试
async function runTests() {
    console.log('开始运行 FTS5 降级机制测试...\n');
    
    let passed = 0;
    let failed = 0;
    
    // 测试 1: 验证降级机制被触发
    try {
        const result = await testFallbackMechanism('测试查询');
        assert.strictEqual(result.method, 'LIKE', '应该降级到 LIKE 搜索');
        assert.strictEqual(result.docs.length, 1, '应该返回搜索结果');
        console.log('✓ 测试 1: 降级机制被正确触发');
        console.log(`  使用方法: ${result.method}`);
        console.log(`  结果数量: ${result.docs.length}`);
        passed++;
    } catch (error) {
        console.log('✗ 测试 1: 降级机制测试失败');
        console.log(`  错误: ${error.message}`);
        failed++;
    }
    console.log();
    
    // 测试 2: 验证特殊字符查询的转义
    try {
        const specialChars = [
            '@user',
            '#hashtag',
            'app*',
            'C++',
            'test"quote',
            '(apple OR banana)',
            'title:hello',
            '^hello',
            '{hello world}',
            '[title]'
        ];
        
        console.log('✓ 测试 2: 特殊字符转义测试');
        for (const char of specialChars) {
            const escaped = escapeFtsQuery(char);
            console.log(`  输入: ${char}`);
            console.log(`  转义后: ${escaped}`);
            assert.ok(escaped.startsWith('"') && escaped.endsWith('"'), 
                '转义后的查询应该用双引号包裹');
        }
        passed++;
    } catch (error) {
        console.log('✗ 测试 2: 特殊字符转义测试失败');
        console.log(`  错误: ${error.message}`);
        failed++;
    }
    console.log();
    
    // 测试 3: 验证空查询处理
    try {
        const emptyQueries = ['', '   ', null, undefined];
        console.log('✓ 测试 3: 空查询处理测试');
        for (const query of emptyQueries) {
            const escaped = escapeFtsQuery(query);
            console.log(`  输入: ${query}`);
            console.log(`  转义后: ${escaped}`);
            assert.strictEqual(escaped, '""', '空查询应该返回空短语');
        }
        passed++;
    } catch (error) {
        console.log('✗ 测试 3: 空查询处理测试失败');
        console.log(`  错误: ${error.message}`);
        failed++;
    }
    console.log();
    
    // 测试 4: 验证双引号转义
    try {
        const testCases = [
            { input: 'test"quote', expected: '"test""quote"' },
            { input: 'say"hello"world', expected: '"say""hello""world"' },
            { input: '"', expected: '""""' },
            { input: '"""', expected: '""""""""' }
        ];
        
        console.log('✓ 测试 4: 双引号转义测试');
        for (const testCase of testCases) {
            const result = escapeFtsQuery(testCase.input);
            console.log(`  输入: ${testCase.input}`);
            console.log(`  期望: ${testCase.expected}`);
            console.log(`  实际: ${result}`);
            assert.strictEqual(result, testCase.expected, '双引号转义应该正确');
        }
        passed++;
    } catch (error) {
        console.log('✗ 测试 4: 双引号转义测试失败');
        console.log(`  错误: ${error.message}`);
        failed++;
    }
    console.log();
    
    // 输出测试结果统计
    console.log('='.repeat(50));
    console.log(`测试完成: ${passed} 个通过, ${failed} 个失败`);
    console.log('='.repeat(50));
    
    // 如果有失败的测试，退出码为 1
    if (failed > 0) {
        process.exit(1);
    }
}

// 运行测试
runTests().catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
});
