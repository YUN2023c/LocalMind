# LocalMind FAQ · 一站式本地大模型 & 本地 RAG 知识库 终极答疑手册

> 📚 **完整 FAQ（含本地部署、4060 跑 LLM、RAG 调优、隐私方案）**：[FAQ.md](./FAQ.md)
> 本文件是 LocalMind 的官方答疑文档，**几乎涵盖了 GitHub Issues / 群里被问过 90% 以上的问题**。如果你刚刚开始接触 **本地跑 LLM**、**本地部署大模型**、**离线 RAG** 或想用 **RTX 4060 跑大模型** 当作自己的 **ChatGPT 平替**，请按目录顺序阅读。

***

***

## 1. 项目概览

### 1.1 LocalMind 到底是什么？

**LocalMind** 是一个面向中文个人用户的、**完全本地化**的「个人 AI 助手 + 本地 RAG 知识库」桌面应用。它把以下四件事塞进了同一个 Electron 程序里：

1. **本地大模型运行环境** —— 基于 `node-llama-cpp` 直接在你的电脑里加载 GGUF 模型（默认 Qwen2.5-1.5B-Instruct Q4\_K\_M），无需任何云端 API、**免梯子**。
2. **本地 RAG 知识库** —— 把你的 PDF / Word / Markdown / TXT / HTML 资料导入后，自动切分、向量化（关键词 + Embedding 混合），再用本地 LLM 回答你的问题，做到 **数据不出本地**。
3. **离线 AI 助手** —— 默认情况下 LocalMind **不联网也能用**，你电脑一断网，照样可以聊天、问文档、生成摘要。
4. **知识图谱 + 任务队列** —— 独有"关键词共现图谱"和"可断点续传的后台任务"，把"个人 AI 助手"做成了一个真正"日常能用的工具"。

### 1.2 为什么会出现 LocalMind？（Why）

截至 2026 年，主流的"本地 AI"方案有 3 个明显痛点：

| 痛点     | 表现                                  | LocalMind 的解法                           |
| ------ | ----------------------------------- | --------------------------------------- |
| 部署门槛高  | 让你装 Python、CUDA、PyTorch、conda、虚拟环境… | 双击安装包即可，无需命令行                           |
| 显存要求夸张 | 跑 7B 模型要 24G 显卡                     | 默认模型只要 \~1.1GB 显存，**RTX 4060 跑大模型** 无压力 |
| 数据上传云端 | ChatGPT/Notion AI 都会把你的文档传到远端       | 全部数据存在本地 SQLite，**数据不出本地**              |

我们想让一个 **消费级显卡**（4060 / 4060Ti / 3060 / 3090）用户，**5 分钟** 拥有一个 **隐私 AI 助手 + 本地知识库**。

### 1.3 目标用户（Who）

- 想在 **RTX 4060 / 4060Ti / 3060 / 3090** 等消费级显卡上 **本地跑大模型** 的开发者
- 关注 **数据隐私 / 离线 AI** 的个人与中小企业
- 预算有限、寻找 **低成本本地 AI 方案** 的用户（**零成本 AI**）
- 想搭建 **本地 RAG 知识库**，替代 ChatGPT / Notion AI 的用户
- 想用 **国产大模型**（DeepSeek / Qwen / ChatGLM）**本地部署** 的中文用户

### 1.4 LocalMind 不适合谁？

- 需要微调（Fine-tune）模型的研究者
- 需要超长上下文（>128K）的
- 需要团队协作 / 多用户权限 → 当前版本是单机版

***

## 2. 与同类项目对比表

> <br />

| 维度             | **LocalMind**                   | Ollama   | Open WebUI       | PrivateGPT | LM Studio | Dify        | AnythingLLM  |
| -------------- | ------------------------------- | -------- | ---------------- | ---------- | --------- | ----------- | ------------ |
| 一句话定位          | **本地 AI 助手 + 本地 RAG 一体化桌面 App** | 模型运行 CLI | Ollama 配套 Web UI | 离线文档问答     | 模型运行 GUI  | 在线 Agent 平台 | 多文档 RAG 工作台  |
| 安装方式           | 双击 `.exe` 安装包                   | 命令行      | Docker / 手动      | Python pip | 双击安装包     | Docker      | Docker / 桌面  |
| 默认模型           | Qwen2.5-1.5B-Instruct Q4\_K\_M  | 需自己拉     | 需自己拉             | 需自己拉       | 需自己拉      | 需配 API Key  | 需自己拉         |
| 离线可用           | ✅ 完全离线                          | ✅        | ⚠️ 需先装 Ollama    | ✅          | ✅         | ❌ 强依赖云端     | ⚠️ 需装 Docker |
| 知识库            | ✅ **本地 RAG** + 知识图谱             | ❌ 需外挂    | ✅ 简单 RAG         | ✅ RAG-only | ⚠️ 实验性    | ✅ 强 RAG     | ✅ 强 RAG      |
| 文档解析           | PDF / Word / MD / HTML / TXT    | ❌        | ⚠️               | ✅          | ❌         | ✅           | ✅            |
| 知识图谱           | ✅ 关键词共现                         | ❌        | ❌                | ❌          | ❌         | ❌           | ❌            |
| 任务队列 / 断点续传    | ✅                               | ❌        | ❌                | ❌          | ❌         | ✅           | ⚠️           |
| 系统钥匙串存 API Key | ✅ keytar                        | ⚠️ 手写    | ❌                | ❌          | ✅         | ❌           | ❌            |
| 显存门槛           | **\~1.1GB 起**（4060 跑 Qwen1.5B）  | 4GB+     | 4GB+             | 8GB+       | 4GB+      | 云端          | 4GB+         |
| 中文友好           | ✅ 国产模型内置                        | ⚠️       | ⚠️               | ⚠️         | ⚠️        | ✅           | ⚠️           |
| **ChatGPT 平替** | ✅                               | ⚠️ 需配置   | ✅                | ⚠️         | ⚠️        | ✅           | ⚠️           |
| 适合小白           | ✅ 零配置                           | ⚠️ 需命令行  | ❌                | ❌          | ✅         | ❌           | ❌            |

**结论**：如果你的诉求是"我有一块 **RTX 4060**，我想**零成本**、**离线**、**5 分钟**拥有自己的 **个人 AI 助手 + 本地知识库**"，**LocalMind 是目前门槛最低的方案之一**。如果你需要多用户协作 / 团队版，请关注 AnythingLLM 和 Dify。

***

## 3. 硬件适配清单

### 3.1 显卡适配（NVIDIA 消费级）

| 显卡                    | 显存    | 可跑模型（Q4\_K\_M）               | 推荐用途                   | 是否推荐  |
| --------------------- | ----- | ---------------------------- | ---------------------- | ----- |
| **RTX 4060 笔记本**      | 8GB   | Qwen2.5-1.5B / 3B / Gemma-2B | 日常问答 + 文档检索            | ⭐⭐⭐⭐⭐ |
| **RTX 4060 桌面**       | 8GB   | Qwen2.5-1.5B / 3B / 7B（部分）   | **4060 跑大模型** 入门首选     | ⭐⭐⭐⭐⭐ |
| **RTX 4060Ti 8GB**    | 8GB   | Qwen2.5-7B（轻度）               | **4060Ti 跑 LLM** 性价比之选 | ⭐⭐⭐⭐⭐ |
| **RTX 4060Ti 16GB**   | 16GB  | Qwen2.5-14B / Llama3-8B      | **RTX 4060 RAG** 全能选手  | ⭐⭐⭐⭐⭐ |
| **RTX 3060 12GB**     | 12GB  | Qwen2.5-7B / Llama3-8B       | 老黄卡性价比之王               | ⭐⭐⭐⭐  |
| **RTX 3090 / 3090Ti** | 24GB  | Qwen2.5-32B / Llama3-70B（Q2） | 本地旗舰                   | ⭐⭐⭐⭐⭐ |
| **RTX 4090**          | 24GB  | Qwen2.5-32B / Llama3-70B（Q3） | 一步到位                   | ⭐⭐⭐⭐⭐ |
| **RTX 3050 / 2060**   | 4-6GB | Qwen2.5-0.5B / Phi-3-mini    | 尝鲜                     | ⭐⭐⭐   |

> **8GB 显存 大模型** 的极致玩法：建议使用 Q4\_K\_M 量化 + 关闭长上下文 + 启用 **llama.cpp** 的 flash attention。

### 3.2 Mac 适配（Roadmap 参考，当前不支持）

> ⚠️ **当前版本仅支持 Windows**（见 `package.json` 中 `electron-builder` 仅配置了 `win/nsis`）。
> 以下表格为 Roadmap 参考，待 macOS 构建发布后启用。

| 设备                        | 内存    | 备注                             |
| ------------------------- | ----- | ------------------------------ |
| **M2 / M3 / M4 8GB**      | 8GB   | 可跑 Qwen2.5-1.5B / 3B（Metal 加速） |
| **M2 Pro 16GB**           | 16GB  | 推荐 7B 模型                       |
| **M2 Max / M3 Max 32GB+** | 32GB+ | 可跑 14B / 32B（统一内存优势）           |
| **M1 8GB**                | 8GB   | 可跑但要关闭 spotlight、Chrome 等吃内存应用 |

Mac 端首次运行会**自动调用 Metal**，无需任何额外配置。

### 3.3 CPU Only（无独显 / 核显 / 笔记本集显）

是的，**CPU 也能跑**，只是慢。

实测 i5-12400 + 32GB 内存，跑 Qwen2.5-1.5B 约 **8-12 tokens/s**，日常聊天够用。

### 3.4 内存 / 硬盘

- **RAM**：建议 ≥ 16GB（8GB 仅能跑 1.5B 模型）
- **硬盘**：模型 + 向量库 + SQLite 共需约 **5-10GB** 空闲空间（推荐 NVMe SSD）

***

## 4. 快速开始

### 4.1 Windows 用户

```txt
# 1. 下载安装包
#    https://github.com/YUN2023c/LocalMind/releases

# 2. 双击 LocalMind-Setup-x.x.x.exe → 一键安装

# 3. 首次启动会自动下载默认模型（约 1.1GB）
#    默认模型：Qwen2.5-1.5B-Instruct Q4_K_M

# 4. 选一个学习资料文件夹 → LocalMind 自动扫描 + 索引

# 5. 开始和你的"个人 AI 助手"对话 ✅
```

### 4.2 Mac / Linux 用户

> ⚠️ **当前版本仅支持 Windows**（见 `package.json` 中 `electron-builder` 仅配置了 `win/nsis`）。
> Mac 和 Linux 用户请等待后续版本，或自行从源码构建（见 §4.3，可能存在平台依赖问题）。

### 4.3 从源码运行（开发者）

```bash
git clone https://github.com/YUN2023c/LocalMind.git
cd localmind-main
npm install
npm start
```

### 4.4 第一次启动会发生什么？

1. 弹出 **Welcome 引导页**（`welcome.html`）
2. 选择你的 **学习资料文件夹**（这是 **本地 RAG 知识库** 的数据源）
3. 选择 **LLM 模式**：
   - **本地模式**（默认，**离线 AI 助手**）：使用 Qwen2.5-1.5B
   - **远程模式**：填入 OpenAI / DeepSeek / 通义千问的 API Key（API Key 用 `keytar` 存入系统钥匙串）
4. 自动开始 **扫描 + 索引** 你的资料
5. 完成！可以开始问问题

***

## 5. 模型选择推荐表

> 这是 **4060 跑大模型** 用户最常问的问题："我的显卡能跑多大的模型？"

| 显存         | 推荐模型                      | 量化       | 适用场景                                 | 下载链接（HF）                                 |
| ---------- | ------------------------- | -------- | ------------------------------------ | ---------------------------------------- |
| 4GB        | Qwen2.5-0.5B-Instruct     | Q4\_K\_M | 尝鲜 / **零成本 AI** 入门                   | `Qwen/Qwen2.5-0.5B-Instruct-GGUF`        |
| 6GB        | Phi-3-mini-4K-Instruct    | Q4\_K\_M | 英文为主                                 | `microsoft/Phi-3-mini-4k-instruct-gguf`  |
| **8GB**    | **Qwen2.5-1.5B-Instruct** | Q4\_K\_M | **LocalMind 默认**，**8GB 显存 大模型** 最佳平衡 | `Qwen/Qwen2.5-1.5B-Instruct-GGUF`        |
| 8GB        | Qwen2.5-3B-Instruct       | Q4\_K\_M | 中文 RAG 强                             | `Qwen/Qwen2.5-3B-Instruct-GGUF`          |
| 8GB        | Llama-3.2-3B-Instruct     | Q4\_K\_M | 英文对话                                 | `meta-llama/Llama-3.2-3B-Instruct-GGUF`  |
| **8-12GB** | **Qwen2.5-7B-Instruct**   | Q4\_K\_M | **4060Ti 跑 LLM** 旗舰                  | `Qwen/Qwen2.5-7B-Instruct-GGUF`          |
| 12GB       | Llama-3.1-8B-Instruct     | Q4\_K\_M | **Llama3 本地**                        | `meta-llama/Llama-3.1-8B-Instruct-GGUF`  |
| 16GB       | Qwen2.5-14B-Instruct      | Q4\_K\_M | **RTX 4060 RAG** 进阶                  | `Qwen/Qwen2.5-14B-Instruct-GGUF`         |
| 16GB       | DeepSeek-V2-Lite-Chat     | Q4\_K\_M | **DeepSeek 本地部署** 性价比                | `deepseek-ai/DeepSeek-V2-Lite-Chat-GGUF` |
| 16GB       | GLM-4-9B-Chat             | Q4\_K\_M | **ChatGLM 本地** 经典                    | `THUDM/glm-4-9b-chat-gguf`               |
| 24GB       | Qwen2.5-32B-Instruct      | Q4\_K\_M | **Qwen2.5 本地** 旗舰                    | `Qwen/Qwen2.5-32B-Instruct-GGUF`         |
| 24GB       | Gemma-2-27B-IT            | Q4\_K\_M | **Gemma 本地**                         | `google/gemma-2-27b-it-gguf`             |
| 24GB+      | Llama-3.1-70B-Instruct    | Q2/Q3    | 极限挑战                                 | `meta-llama/Llama-3.1-70B-Instruct-GGUF` |

> 💡 **4060 跑大模型** 的最佳选择是 **Qwen2.5-7B Q4\_K\_M**（约 4.5GB），可在 8GB 显存的 **RTX 4060** 上流畅运行。

***

## 6. 本地知识库搭建

### 6.1 支持的文档格式

| 格式           | 解析器                        | 备注                    |
| ------------ | -------------------------- | --------------------- |
| PDF          | `pdf-parse` + `pdfjs-dist` | 含图片型 PDF 警告、加密 PDF 检测 |
| Word (.docx) | `mammoth` + `docx`         | 同时支持预览与解析             |
| Word (.doc)  | `word-extractor`           | 老格式 Word              |
| Markdown     | `marked`                   | 含数学公式                 |
| HTML         | 自研                         | 含转 Markdown           |
| TXT          | 内置                         | 自动编码检测                |

### 6.2 三步搭建你的 **本地知识库**

```
第 1 步：导入文档
  Settings → Study Folder → 选择你的资料文件夹
  LocalMind 会递归扫描 PDF / Word / MD / HTML / TXT

第 2 步：自动索引
  - 文档解析（按上表格式）
  - 关键词提取（基于内置 KEYWORD_CATEGORIES 词库）
  - 存入本地 SQLite（无任何云端上传）
  - v1.0 暂不分块（chunking）、不向量化（embedding）

第 3 步：开始问问题
  在 Q&A 输入框提问，例如：
  "总结 Q3 财报里关于云业务的论述"
  → LocalMind 会先用 FTS5 检索，中文走 LIKE 回退，
    再把命中片段交给本地 LLM 基于上下文作答
```

### 6.3 检索机制与调优（v1.0 实际实现）

> ⚠️ **当前 v1.0 版本没有 RAG 参数设置面板**。以下为 LocalMind 实际使用的检索机制与代码常量（见 `src/main/qa-service.js`、`src/main/database.js`）。

#### 6.3.1 实际检索流程

LocalMind 的 Q\&A 采用**两层回退策略**（`qa-service.js` 的 `askQuestion` 函数）：

```
第 1 层：SQLite FTS5 全文检索
   ├─ 英文 / 拉丁文：FTS5 默认分词器效果好
   ├─ 中文：FTS5 默认分词器不支持中文，命中少
   └─ 命中数 > 0 → 直接返回，不再回退

第 2 层：中文 LIKE 关键词回退（仅 FTS5 返回空时触发）
   ├─ 抽取关键词（长度 ≥ 2）
   ├─ 本地模式：searchChineseDocuments（按命中关键词数排序）
   ├─ 远程模式：searchDocuments（普通 LIKE）
   └─ 返回前 maxDocs = 5 条
```

#### 6.3.2 实际生效的参数（硬编码 / 待 UI 暴露）

| 参数                        | 当前值           | 位置                   | 是否可在 UI 调整  |
| ------------------------- | ------------- | -------------------- | ----------- |
| `maxDocs`（召回数量）           | `5`（本地/远程都一样） | `qa-service.js:406`  | ❌ 待 Roadmap |
| 关键词最短长度                   | `2`           | `qa-service.js:384`  | ❌ 待 Roadmap |
| 文档分块（chunking）            | ❌ **未启用**     | —                    | —           |
| Embedding 向量化             | ❌ **未启用**     | —                    | —           |
| 知识图谱阈值 `min_cooccurrence` | 硬编码           | `knowledge-graph.js` | ❌ 待 Roadmap |

#### 6.3.3 当前可用的"调优手段"

虽然没有设置面板，你仍然可以**间接**提升检索质量：

1. **提问尽量用关键词**：FTS5 适合"主语 + 谓语 + 关键名词"的结构，避免长自然语言
2. **中文问题触发 LIKE 回退**：命中率更高但速度稍慢
3. **文档标题起得规范**：标题会作为强信号参与排序
4. **给文档加 Tag**：Tag 也参与 LIKE 匹配
5. **清理重复 / 旧版文档**：减少噪声

#### 6.3.4 Roadmap 中的检索升级

- 🔲 v1.2：暴露 `maxDocs`、关键词长度等参数到 Settings
- 🔲 v1.3：接入 **ChromaDB** / **向量数据库**（真正的"语义检索"）
- 🔲 v1.5：可选 Embedding 模型（如 `bge-small-zh`），开启"关键词 + 向量"混合召回

### 6.4 知识图谱：LocalMind 的独门武器

问完问题后，LocalMind 可以为你的文档集合生成 **关键词共现图谱**：

- 节点 = 关键词
- 边 = 在同一文档/段落中同时出现
- 颜色 = 所属学科（**计算机科学 / 数学 / 物理 / 化学 / 生物 / 医学**…）

这是 **ChromaDB / 向量数据库** 之外的另一种"全局视角"。

### 6.5 关于 **ChromaDB** / **Embedding**（v1.0 未启用）

> ⚠️ **v1.0 实际上没有 Embedding**，检索走的是 **SQLite FTS5 + 中文 LIKE 回退**（见 §6.3）。
> 引入"**关键词 + Embedding** 混合召回"是 Roadmap v1.5 的目标（详见 §11）。

***

## 7. 离线 / 隐私 / 安全

### 7.1 LocalMind 真的会"数据不出本地"吗？

**是的。** 除非你主动开启"远程 LLM 模式"，否则：

- ✅ 所有文档 → 你的硬盘（`%APPDATA%\LocalMind\documents\…`）
- ✅ 所有向量索引 → 本地 SQLite
- ✅ 所有对话历史 → 本地 SQLite
- ✅ 所有 API Key → **Windows Credential Manager**（通过 `keytar` 写入系统钥匙串，**不存明文**）
- ❌ **0 字节** 上传云端

### 7.2 网络流量说明

| 模式                  | 网络流量                         |
| ------------------- | ---------------------------- |
| 本地模式 + 默认模型         | 首次下载模型 \~1.1GB，之后 **0 网络请求** |
| 本地模式 + 远程 Embedding | 仅 Embedding 调用时联网（可关闭）       |
| 远程 LLM 模式           | 仅 LLM API 调用（文档仍本地）          |

> 📌 LocalMind 没有任何「埋点 / Telemetry」代码，欢迎 `grep` 验证。

### 7.3 API Key 安全（**隐私 AI** 关键）

- 使用 `keytar` 把 API Key 存入 **Windows Credential Manager / macOS Keychain / Linux libsecret**
- 配置文件里只存引用名，**永不存明文 Key**
- 卸载应用时系统钥匙串记录会**自动清除**

### 7.4 适合的隐私场景

- 🏥 **医疗**：本地分析病历，不上传云端
- ⚖️ **法律**：本地分析合同，**数据不出本地**
- 💼 **企业**：内部知识库，替代 Notion AI
- 🎓 **学生**：本地整理论文 / 笔记，**免费本地大模型**
- 🏠 **个人**：自己的日记 / 财务 / 密码管理

***

## 8. 性能调优

### 8.1 量化等级选择

| 量化           | 体积     | 质量损失    | 推荐                                  |
| ------------ | ------ | ------- | ----------------------------------- |
| Q2\_K        | 最小     | 明显      | 70B 模型显存不够时的妥协                      |
| Q3\_K\_M     | 较小     | 轻微      | 24GB 跑 70B                          |
| **Q4\_K\_M** | **平衡** | **几乎无** | **LocalMind 默认**（**GGUF 量化** 最佳平衡点） |
| Q5\_K\_M     | 较大     | 极小      | 有 16GB+ 显存                          |
| Q6\_K        | 大      | 极小      | 32GB 设备                             |
| Q8\_0        | 很大     | 几乎无     | 仅推荐小模型                              |

### 8.2 上下文长度（Context Length）

| 模型           | 默认   | 建议调整                 |
| ------------ | ---- | -------------------- |
| Qwen2.5-1.5B | 32K  | 8GB 显存建议 **4K**（省显存） |
| Qwen2.5-7B   | 32K  | 8GB 建议 **2K-4K**     |
| Llama-3.1-8B | 128K | 8GB 建议 **4K**        |

> 调小 context 可以大幅降低显存占用，是 **4060 跑大模型** 的关键技巧。

### 8.3 显存溢出（OOM）排查清单

如果遇到 `CUDA out of memory` 或 `llama.cpp` 报 OOM：

1. ✅ 切换更小的模型（如 7B → 3B → 1.5B）
2. ✅ 使用更激进的量化（Q4\_K\_M → Q3\_K\_M → Q2\_K）
3. ✅ 减小 `context_length`（4096 → 2048 → 1024）
4. ✅ 关闭其他占显存程序（Chrome、Photoshop、游戏）
5. ✅ 关闭 Windows 游戏栏 / Xbox Game Bar
6. ✅ 检查 `nvidia-smi` 确认没有别的进程占显存
7. ✅ 把 GPU 调度模式从 "Auto" 改成 "Performance"
8. ✅ 升级驱动到 ≥ 555（CUDA 12.5+ 支持）

### 8.4 速率限制（Rate Limit）

LocalMind 内置 **速率限制器**（`rate-limiter.js`）+ **并发控制器**（`concurrency-controller.js`），避免：

- 远程 API 触发速率限制
- 本地 LLM 一次性接收太多并发请求导致卡死

默认 3 并发，可在 Settings → 性能 调整。

***

## 9. 常见报错 FAQ

> 这一节是 Google 搜索「LocalMind 报错」时最常被索引的部分，请 Ctrl+F 直接搜错误关键词。

### 9.1 安装相关

**Q1：双击安装包提示"无法验证发布者"？**
A：右键 → 属性 → 勾选"解除锁定" → 应用。或者使用 `msiexec /i xxx.msi`。

**Q2：Linux 提示缺少** **`libgbm.so`？**
A：`sudo apt install libgbm1 libasound2t64`。

> ⚠️ **Mac 当前不支持**，故无 Mac 安装相关 Q\&A。详见 §4.2。

### 9.2 模型下载相关

**Q3：模型下载卡在 0%？**
A：网络问题。LocalMind 模型托管在 HuggingFace（国内可能需梯子）。可手动下载 `.gguf` 文件放到 `models/` 目录。

**Q4：下载中断后无法继续？**
A：LocalMind 会校验文件大小，不完整会自动重下。也可手动删除 `models/qwen2.5-1.5b-instruct-q4_k_m.gguf` 后重启。

**Q5：能否使用别的 GGUF 模型？**
A：可以。把 `.gguf` 文件放入 `models/` 目录，然后在 Settings → Local Model 选择即可。

**Q6：模型加载报** **`Failed to load model`？**
A：检查 GGUF 文件是否完整（`md5sum` 校验），以及 CUDA / Metal 驱动是否正常。

### 9.3 CUDA / cuDNN / llama.cpp 相关

**Q7：报** **`CUDA error: no kernel image is available for execution on the device`？**
A：显卡太老（如 GTX 700 系列）。请使用 CPU 模式或升级显卡。**4060 跑大模型** 完全无此问题。

**Q8：报** **`cuDNN not initialized`？**
A：通常是 NVIDIA 驱动版本与 CUDA Toolkit 不匹配。**推荐只装 NVIDIA 驱动，不需要单独装 CUDA Toolkit**（LocalMind 自带 `node-llama-cpp` 已绑定 CUDA）。

**Q9：报** **`llama.cpp failed to allocate KV cache`？**
A：显存不够。减小 `n_ctx`（上下文长度）或换更小的模型。

**Q10：报** **`GGML_ASSERT: n_threads > 0`？**
A：CPU 模式线程数被设为 0。Settings → 性能 → CPU 线程数改为 `0`（自动）或 ≥ 1。

**Q11：报** **`unsupported model architecture`？**
A：模型不是 GGUF 格式或架构过老。推荐从 HuggingFace `*-GGUF` 仓库下载。

### 9.4 Python / Node 依赖相关

**Q12：npm install 报** **`node-gyp`** **错误？**
A：Windows 用户需安装：

- Python 3.10+（勾选 Add to PATH）
- Visual Studio 2022 Build Tools（含 C++ 桌面开发）
- Windows SDK

**Q13：报** **`better-sqlite3`** **编译失败？**
A：同上。或使用 `npm install --build-from-source`。

> ⚠️ **Mac 当前不支持**，故无 Mac / Metal 相关 Q\&A。详见 §4.2。

### 9.5 内存 / 显存相关

**Q14：8GB 显存跑 7B 模型 OOM？**
A：尝试 Q3\_K\_M 量化 + 4K 上下文 + 关闭其他程序。**4060 跑大模型** 推荐 7B-Q4\_K\_M。

**Q15：CPU 占用率 100%？**
A：正常。LocalMind 把所有可用核心都用来跑量化矩阵运算。调小 `n_threads`。

**Q16：内存泄漏，LocalMind 越用越卡？**
A：v1.0+ 已修复。如仍遇到，请 `Ctrl+Shift+I` 打开 DevTools 查看内存。

### 9.6 RAG / 知识库相关

**Q17：导入 PDF 后搜索不到内容？**
A：可能是图片型 PDF（扫描件）。LocalMind 暂不支持 OCR，可在 Roadmap 关注。

**Q18：Word 文档导入乱码？**
A：检查 `.doc` 是否是加密 / 老格式。`.docx` 一般无问题。

**Q19：检索结果不相关？**
A：v1.0 无 RAG 调参面板。间接手段：① 提问用关键词而非长自然语言；② 文档标题起得规范（标题参与排序）；③ 给文档加 Tag（参与 LIKE 匹配）；④ 清理重复 / 旧版文档。详见 §6.3。

**Q20：Q\&A 回答得很慢？**
A：本地 LLM 受限于显卡。可换更小模型，或开启「远程 LLM 模式」。

**Q21：能否支持 Excel / PPT？**
A：Roadmap v1.2。临时方案：先转 CSV / TXT。

**Q22：知识图谱节点太多看不清？**
A：v1.0 无图谱参数面板。如需精简视图，可在源码里调高 `min_cooccurrence` 阈值（`knowledge-graph.js`）后重新生成。详见 §6.4。

### 9.7 远程 API 相关

**Q23：远程模式报 401？**
A：API Key 错误。Settings → API → Test Connection。

**Q24：远程模式报 429（速率限制）？**
A：调低 Settings → 速率限制 的 RPS。

**Q25：能否用 DeepSeek / 通义千问 / 智谱 API？**
A：可以。任何兼容 OpenAI 协议的 API 都支持。填入 `https://api.deepseek.com/v1/chat/completions` 即可。

### 9.8 其他

**Q26：可以多端同步吗？**
A：当前是单机版。Roadmap v2.0 会加入 P2P 同步。

**Q27：能否商用？**
A：可以，ISC 协议。

**Q28：会出手机版吗？**
A：Roadmap v3.0 关注 iOS / Android（需要重新设计 RAG 部分）。

**Q29：能跑 Function Calling 吗？**
A：v1.0 **不支持**。Roadmap 见 §10.1。

**Q30：能跑多模态（看图）吗？**
A：默认模型是纯文本。Roadmap v1.5 会接入 Qwen2-VL。

***

## 10. 进阶玩法

> ⚠️ **本节所有内容在 v1.0 中均未实现**，仅作为 Roadmap 预告。具体排期见 §11。

### 10.1 Function Calling / Tool Use（未实现）

规划中。可让本地 LLM 调用工具（搜索、查数据库、调外部 API）。推荐使用 Qwen2.5-7B-Instruct 或 Llama-3.1-8B-Instruct（Function Calling 准确率较高）。

### 10.2 MCP（Model Context Protocol，未实现）

Roadmap v1.3 会内置 MCP Client，让 LocalMind 直接调用支持 MCP 的工具（数据库、浏览器、文件操作）。

### 10.3 Agent（多步骤推理，未实现）

Roadmap 中的能力：读多篇 PDF 写摘要、读 Excel 生成图表、联网搜索等。

### 10.4 OpenAI 兼容 API 服务（未实现）

Roadmap：把 LocalMind 暴露成 OpenAI 兼容服务（监听 11434 端口），供 Cherry Studio / ChatBox / NextChat 等前端调用。**当前 v1.0 没有此功能**。

### 10.5 多用户 / 团队版（未实现）

当前是单机版。多用户场景 Roadmap v2.0 才会考虑。当前变通：每个成员本地装 LocalMind（**免费本地大模型**），各自独立使用。

***

## 11. 路线图

> Star & Watch 关注进度：<https://github.com/YUN2023c/LocalMind>

### v1.1（已发布）

- ✅ Qwen2.5-1.5B 默认模型
- ✅ PDF / Word / MD / HTML / TXT 解析
- ✅ 知识图谱
- ✅ 任务队列 + 断点续传

###

***

## 12. 贡献与 Star

### 12.1 我能怎么贡献？

- 🐛 **报 Bug**：[GitHub Issues](https://github.com/YUN2023c/LocalMind/issues)
- 💡 **提 Feature Request**：[GitHub Discussions](https://github.com/YUN2023c/LocalMind/discussions)

### 12.2 如何在 GitHub 找到本项目？

> 给搜索引擎和 GitHub 搜索用户的关键词（复制粘贴到 GitHub 搜索框）：

- `local LLM Electron app`
- `RTX 4060 LLM RAG`
- `本地 RAG 知识库 Electron`
- `Qwen2.5 GGUF local`
- `DeepSeek 本地部署`
- `ChatGLM 本地`
- `Llama3 本地`
- `ChatGPT 平替 开源`
- `离线 AI 助手 开源`
- `低成本 本地 AI 方案`

### 12.3 ⭐ Star 引导

如果 LocalMind 帮到了你（让你 **4060 跑大模型** / 摆脱 ChatGPT / 拥有 **个人 AI 助手**），请在 GitHub 上点个 Star ⭐，这是对我们最大的支持：

> 👉 **<https://github.com/YUN2023c/LocalMind>**

你的 Star 会让 LocalMind 被更多搜索到 → 帮助更多想要 **本地部署大模型**、**离线 RAG**、**数据不出本地** 的中文用户。

***

## 13. 🔍 关键词索引

<br />

**相关搜索**：本地跑 LLM、本地部署大模型、4060 运行 RAG、4060 跑大模型、RTX 4060 本地 AI、
低成本本地 AI 方案、离线 RAG 知识库、免费本地大模型、Ollama 部署 DeepSeek、
ChatGPT 本地平替、ChatGLM3 本地部署、Llama3 中文、本地知识库搭建、隐私 AI 助手、
数据不出本地的 AI、8GB 显存 跑大模型、GGUF 量化、Qwen2.5 本地、Windows 本地 LLM

***

> · 本文档使用 ISC 协议 · 最后更新于 2026-07-14

