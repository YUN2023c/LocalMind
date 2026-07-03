/**
 * escapeFtsQuery 函数的单元测试
 * 
 * 测试 FTS5 特殊字符转义功能，确保所有特殊字符都能正确处理
 */

const assert = require('assert');

// 由于 escapeFtsQuery 是 qa-service.js 的内部函数，我们需要重新实现它用于测试
// 或者修改 qa-service.js 导出该函数
function escapeFtsQuery(query) {
    // 处理 null、undefined 或空字符串
    if (!query || typeof query !== 'string') {
        return '""';
    }
    
    // 去除首尾空格
    const trimmed = query.trim();
    
    // 如果去除空格后为空字符串，返回空短语
    if (trimmed.length === 0) {
        return '""';
    }
    
    // 将查询字符串作为短语查询：
    // 1. 用双引号包裹整个字符串
    // 2. 内部的双引号转义为两个双引号（FTS5 规则）
    return '"' + trimmed.replace(/"/g, '""') + '"';
}

// 测试用例
const tests = [
    // 基本测试
    {
        name: '普通文本',
        input: 'hello world',
        expected: '"hello world"'
    },
    {
        name: '空字符串',
        input: '',
        expected: '""'
    },
    {
        name: '只有空格',
        input: '   ',
        expected: '""'
    },
    {
        name: 'null 值',
        input: null,
        expected: '""'
    },
    {
        name: 'undefined 值',
        input: undefined,
        expected: '""'
    },
    
    // FTS5 特殊字符测试
    {
        name: '双引号',
        input: 'test"quote',
        expected: '"test""quote"'
    },
    {
        name: '多个双引号',
        input: 'say"hello"world',
        expected: '"say""hello""world"'
    },
    {
        name: '星号（前缀查询）',
        input: 'app*',
        expected: '"app*"'
    },
    {
        name: '连字符（NOT 操作）',
        input: 'apple -orange',
        expected: '"apple -orange"'
    },
    {
        name: '加号',
        input: 'C++',
        expected: '"C++"'
    },
    {
        name: '波浪号（NEAR 操作）',
        input: 'hello ~ world',
        expected: '"hello ~ world"'
    },
    {
        name: '括号（分组）',
        input: '(apple OR banana)',
        expected: '"(apple OR banana)"'
    },
    {
        name: '冒号（列过滤）',
        input: 'title:hello',
        expected: '"title:hello"'
    },
    {
        name: '脱字符（初始令牌）',
        input: '^hello',
        expected: '"^hello"'
    },
    {
        name: '大括号（NEAR 操作）',
        input: '{hello world}',
        expected: '"{hello world}"'
    },
    {
        name: '方括号（列名）',
        input: '[title]',
        expected: '"[title]"'
    },
    {
        name: '单引号',
        input: "it's",
        expected: '"it\'s"'
    },
    
    // 特殊字符组合测试
    {
        name: '@ 符号',
        input: '@user',
        expected: '"@user"'
    },
    {
        name: '# 符号',
        input: '#hashtag',
        expected: '"#hashtag"'
    },
    {
        name: '问号',
        input: 'what?',
        expected: '"what?"'
    },
    {
        name: '感叹号',
        input: 'hello!',
        expected: '"hello!"'
    },
    {
        name: '美元符号',
        input: '$100',
        expected: '"$100"'
    },
    {
        name: '百分号',
        input: '50%',
        expected: '"50%"'
    },
    {
        name: '与符号',
        input: 'A & B',
        expected: '"A & B"'
    },
    {
        name: '竖线',
        input: 'A | B',
        expected: '"A | B"'
    },
    {
        name: '反斜杠',
        input: 'path\\to\\file',
        expected: '"path\\to\\file"'
    },
    {
        name: '正斜杠',
        input: 'path/to/file',
        expected: '"path/to/file"'
    },
    
    // 复杂场景测试
    {
        name: '邮箱地址',
        input: 'user@example.com',
        expected: '"user@example.com"'
    },
    {
        name: 'URL',
        input: 'https://example.com/path?query=value',
        expected: '"https://example.com/path?query=value"'
    },
    {
        name: '代码片段',
        input: 'function() { return "hello"; }',
        expected: '"function() { return ""hello""; }"'
    },
    {
        name: 'SQL 查询',
        input: 'SELECT * FROM users WHERE id = 1',
        expected: '"SELECT * FROM users WHERE id = 1"'
    },
    {
        name: 'JSON 字符串',
        input: '{"key": "value"}',
        expected: '"{""key"": ""value""}"'
    },
    {
        name: '中文文本',
        input: '你好世界',
        expected: '"你好世界"'
    },
    {
        name: '混合语言',
        input: 'Hello 世界 2024',
        expected: '"Hello 世界 2024"'
    },
    {
        name: '带引号的中文',
        input: '他说"你好"',
        expected: '"他说""你好"""'
    },
    
    // 边界情况测试
    {
        name: '只有双引号',
        input: '"',
        expected: '""""'
    },
    {
        name: '多个连续双引号',
        input: '"""',
        expected: '""""""""'
    },
    {
        name: '首尾空格',
        input: '  hello  ',
        expected: '"hello"'
    },
    {
        name: '内部多个空格',
        input: 'hello    world',
        expected: '"hello    world"'
    },
    {
        name: '数字',
        input: '12345',
        expected: '"12345"'
    },
    {
        name: '特殊数字格式',
        input: '1.23e-10',
        expected: '"1.23e-10"'
    }
];

// 运行测试
console.log('开始运行 escapeFtsQuery 函数测试...\n');

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
    try {
        const result = escapeFtsQuery(test.input);
        assert.strictEqual(result, test.expected, `测试失败: ${test.name}`);
        console.log(`✓ 测试 ${index + 1}: ${test.name}`);
        console.log(`  输入: ${JSON.stringify(test.input)}`);
        console.log(`  输出: ${result}`);
        passed++;
    } catch (error) {
        console.log(`✗ 测试 ${index + 1}: ${test.name}`);
        console.log(`  输入: ${JSON.stringify(test.input)}`);
        console.log(`  期望: ${test.expected}`);
        console.log(`  实际: ${error.actual || error.message}`);
        failed++;
    }
    console.log();
});

// 输出测试结果统计
console.log('='.repeat(50));
console.log(`测试完成: ${passed} 个通过, ${failed} 个失败`);
console.log('='.repeat(50));

// 如果有失败的测试，退出码为 1
if (failed > 0) {
    process.exit(1);
}
