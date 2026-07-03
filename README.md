# LocalMind

本地知识库管理系统，基于 Electron 和 llama.cpp 构建，支持离线运行的 AI 问答服务。

## 功能特性

- 本地文档扫描与索引
- AI 智能问答
- 知识图谱构建
- 多格式文档支持（PDF、Word、DOCX）
- 离线运行，数据隐私安全

## 技术栈

- **框架**: Electron
- **AI 模型**: llama.cpp (node-llama-cpp)
- **数据库**: SQLite3
- **语言**: JavaScript/Node.js

## 快速开始

### 环境要求

- Node.js >= 18.x
- npm >= 9.x
- Windows 10/11

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/your-username/localmind.git
cd localmind
```

2. 安装依赖

```bash
cd localmind-main
npm install
```

3. 下载 llama.cpp 运行时

```bash
node download-llama-server.js
```

4. 准备模型文件

将 GGUF 格式的模型文件放入 `localmind-main/models/` 目录。

5. 启动应用

```bash
npm start
```

## 项目结构

```
localmind-main/
├── src/
│   ├── main/          # 主进程代码
│   ├── renderer/      # 渲染进程代码
│   └── windows/       # 窗口配置
├── bin/               # llama.cpp 二进制文件
├── models/            # AI 模型文件
├── data/              # 数据库文件
├── index.html         # 主窗口 HTML
├── preload.js         # 预加载脚本
└── package.json       # 项目配置
```

## 构建打包

```bash
npm run build
```

## 测试

```bash
npm test
```

## 许可证

ISC License
