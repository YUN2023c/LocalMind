<div align="center">

<img src="https://raw.githubusercontent.com/YUN2023c/LocalMind/main/logo/ai-logo-256x256.png" width="120" alt="LocalMind Logo"/>

# LocalMind

### 一个属于你自己的本地知识管家

> 你的知识，应该躺在你的硬盘里——而不是某个你够不着的服务器上。

<br/>

<img src="https://img.shields.io/badge/license-ISC-blue?style=flat-square" alt="License"/>
<img src="https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square&logo=windows&logoColor=white" alt="Platform"/>
<img src="https://img.shields.io/badge/version-1.0.0-green?style=flat-square" alt="Version"/>
<img src="https://img.shields.io/badge/Electron-42.4.1-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron"/>
<img src="https://img.shields.io/badge/llama.cpp-powered-FF6B35?style=flat-square" alt="llama.cpp"/>
<img src="https://img.shields.io/badge/SQLite-FTS5-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite"/>
<img src="https://img.shields.io/badge/Qwen2.5-1.5B-9B59B6?style=flat-square" alt="Qwen"/>
<img src="https://img.shields.io/badge/offline-first-success?style=flat-square" alt="Offline"/>
<img src="https://img.shields.io/badge/privacy-local-FFB6C1?style=flat-square" alt="Privacy"/>

<br/>

[English README](README-en.md) · [下载安装包](https://github.com/YUN2023c/LocalMind/tags) · [FAQ](FAQ.md) · [GitHub](https://github.com/YUN2023c/LocalMind)

</div>

---

## 一句话定义

**LocalMind** 是一款**本地优先**的桌面知识管理应用——它不是云端 SaaS，不向你按月收费，也不把你的文档同步到任何你看不见的服务器。它只是一个跑在你自己电脑上、数据只躺在本地 SQLite 里的知识管家。

| 本地优先 | 隐私保护 | 离线可用 | 开箱即用 |
| --- | --- | --- | --- |
| 文档与索引仅存本地 SQLite | API Key 存入系统钥匙串 | 内置 Qwen2.5-1.5B，断网可跑 | 双击安装，5 分钟上手 |

---

## 目录

- [核心功能](#核心功能)
- [为谁做的](#为谁做的)
- [快速开始](#快速开始)
- [为什么选择 LocalMind](#为什么选择-localmind)
- [技术栈](#技术栈)
- [应用前景](#应用前景)
- [关于与贡献](#关于与贡献)

---

## 核心功能

### 1. 本地优先的文档管家

指定一个学习资料文件夹，LocalMind 自动扫描入库其中的 **PDF / Word（doc/docx）/ Markdown / TXT / HTML**。

- 基于文件修改时间与大小做**增量同步**——新加的、改过的才入库
- 所有内容只躺在你的**本地 SQLite** 数据库里
- 拔掉网线，照常工作

### 2. 双模式 AI 问答与摘要

| 模式 | 特点 | 适用场景 |
| --- | --- | --- |
| **本地模型模式** | 内置 Qwen2.5-1.5B-Instruct（\~1GB），断网可用，零费用 | 敏感文档、离线环境 |
| **远程 API 模式** | 自带 API Key，调用 OpenAI / DeepSeek / 通义千问等远端模型 | 需要更强效果时 |

问答时支持**流式作答**、随时**停止生成**、**标注引用来源**、保存问答历史，以及 **Token 节省模式**。任何文档都能**一键生成摘要**。

### 3. 强大的检索与管理

- **SQLite FTS 全文检索**（带中文分词回退方案）
- **标签云 / 关键词 / 收藏夹 / 最近文档**
- **文档预览与编辑**（PDF / Markdown / Word 直接看，Markdown 可改）
- **关键词共现知识图谱**，帮你发现文档之间的联系

> 知识管理的关键，是"想用时能不能立刻找到"。

---

## 为谁做的

它服务的人很具体，不是"所有人"：

- **独立开发者**——受够了云端笔记每次打开都要转圈"加载中..."，却还要按月付订阅费
- **研究人员**——笔记里有未发表论文、机密代码、私人手稿，对云端同步有合理隐私焦虑
- **研究生**——硬盘里堆了几百篇 PDF 论文，每次想找"那句话到底出自哪一篇"都要翻半天
- **文字创作者**——想要一个真正属于自己的"第二大脑"，但不想把思考过程交给大厂

如果你符合上面任何一条——LocalMind 大概率就是为你做的。

> 如果你要的是多人协作的团队知识库——那它目前真的不是。

---

## 快速开始

### Windows 用户（推荐）

```
1. 从 Releases 下载 LocalMind-Setup-x.x.x.exe
2. 双击安装，首次启动自动下载默认模型（约 1.1GB）
3. 选择学习资料文件夹，LocalMind 自动扫描 + 索引
4. 开始与你的本地 AI 助手对话
```

### 从源码运行

```bash
git clone https://github.com/YUN2023c/LocalMind.git
cd localmind-main
npm install
npm start
```

---

## 为什么选择 LocalMind

### 一个真实的崩溃瞬间

一个周末，我坐在电脑前整理错题。桌面上散落着各科的 PDF 试卷、用 Markdown 记的错题本、从知乎和公众号另存下来的知识点总结。

我记得之前看到过一道物理题的解题思路——但翻遍了"高三复习"文件夹里的二十多个子文件夹，还是找不到。

我花了将近四十分钟。用文件搜索工具一个一个找，用 PDF 阅读器一篇一篇 Ctrl+F，用记事本打开 Markdown 一页一页翻。

最后终于找到了——但那天下午的复习计划全被打乱了。

### 那个"如果……就好了"的瞬间

就在那个下午，我脑子里冒出一句话：

> 如果有一个工具，能让我的文档不出本地，又能像 ChatGPT 一样被随时提问、被随时检索就好了。

市面上不是没有本地知识库工具，但要么太重，要么要自己搭一整套复杂环境，要么只支持单一格式。

作为一个会写点代码的学生，我决定自己写一个——轻一点、诚实一点、只服务我自己这种场景就好。

### 判断与取舍

作为一个人在做的项目，清醒地"砍"比兴奋地"加"重要得多：

- **砍掉了云端同步**——数据上云后隐私风险不可控
- **砍掉了协作功能**——单人场景够用，协作会成倍增加复杂度
- **没有上向量数据库，用的是 SQLite FTS**——零额外依赖、秒级启动、对个人文档库完全够用
- **目前只做了 Windows**——跨平台一个人真的扛不动，Mac/Linux 是未来方向

> 独立开发者最大的优势不是"什么都能做"——而是"敢于不做什么"。

### 几个值得讲的取舍

1. **双模式推理**：把"效果 vs 隐私/离线"的选择权交还给你
2. **SQLite FTS 而非重型向量库**：换来零依赖、秒级启动
3. **keytar 把 API Key 放进系统钥匙串**：不写明文到配置文件
4. **任务队列（并发控制 + 限流）**：一次性导入几百篇文档也不会卡死

> 诚实地说：LocalMind 不是最强大的——但它可能是最"不打扰你"的那一个。

---

## 技术栈

| 类型 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 桌面外壳 | Electron | `^42.4.1` | 桌面应用框架 |
| 本地推理 | node-llama-cpp | `^3.18.1` | 基于 llama.cpp 驱动 Qwen2.5-1.5B |
| 存储 | sqlite3 | `^5.1.7` | 本地存储 + FTS 全文检索 |
| PDF 解析 | pdfjs-dist / pdf-parse | `^6.0.227` / `^1.1.1` | 解析与预览 |
| Word 解析 | mammoth / word-extractor / docx | `^1.8.0` / `^1.0.4` / `^9.7.1` | 解析与生成 |
| Markdown | marked | `^18.0.5` | 渲染 |
| 安全 | keytar | `^7.9.0` | API Key 安全存储于系统钥匙串 |
| 配置 | electron-store | `^8.1.0` | 配置存储 |
| 本地模型 | Qwen2.5-1.5B-Instruct | — | Apache 2.0 开源协议 |

> **一句话技术取舍**：能用 SQLite 解决的，绝不引入第二个服务；能存在本地的，绝不上云。

---

## 应用前景

### 短期：已经能做的事

- 把散落在硬盘各处的文档收进可检索的本地库
- 在不泄露内容的前提下，让 AI 帮你问答和摘要
- 用知识图谱和全文检索，解决"找不到"和"看不出联系"

### 中期（未来构想）：个人第二大脑的本地操作系统

如果有一天加上插件机制和小社区，LocalMind 有望探索成为"个人第二大脑的本地操作系统"——自动抓取订阅源、定期摘要、与本地日历/待办联动，数据都不出本地。

### 长期（未来构想）：个人 AI 知识中枢

在 AI Agent 和隐私计算的大趋势下，LocalMind 的潜在场景不仅限于个人：

- **企业保密场景**：员工作为个人知识库工具，对接内部部署模型
- **研究所与学术团队**：管理未公开的实验数据和论文草稿

> ⚠️ 中、长期内容均为**未来构想**，**尚未实现**。

---

## 关于与贡献

LocalMind 是一个**个人独立开发项目**，目前只有我一个人在维护，且目前仅支持 **Windows**。

它带着完整的开源软件许可证声明，欢迎你阅读源码、提 Issue、提 PR——或者在它还不够好的地方毫不客气地批评我。

如果你也相信"知识应该留在自己手里"，欢迎一起把它做得更好。

---

<div align="center">

<sub>Made with care by an independent developer.</sub>

</div>
