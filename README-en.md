<div align="center">

<img src="https://raw.githubusercontent.com/YUN2023c/LocalMind/main/logo/ai-logo-256x256.png" width="120" alt="LocalMind Logo"/>

# LocalMind

### Your Personal Local Knowledge Butler

> Your knowledge should live on your hard drive — not on some server you can't reach.

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

[中文 README](README.md) · [Download](https://github.com/YUN2023c/LocalMind/tags) · [FAQ](FAQ.md) · [GitHub](https://github.com/YUN2023c/LocalMind)

</div>

---

## One-sentence Definition

**LocalMind** is a **local-first** desktop knowledge management application — it's not a cloud SaaS, doesn't charge monthly, and doesn't sync your documents to any server you can't see. It's simply a knowledge butler that runs on your own computer, with data stored only in local SQLite.

| Local-first | Privacy-first | Offline-ready | Ready to Use |
| --- | --- | --- | --- |
| Documents & index stay in local SQLite | API Key stored in system keychain | Built-in Qwen2.5-1.5B runs without internet | Double-click install, up and running in 5 minutes |

---

## Table of Contents

- [Core Features](#core-features)
- [Who It's For](#who-its-for)
- [Quick Start](#quick-start)
- [Why LocalMind](#why-localmind)
- [Tech Stack](#tech-stack)
- [Roadmap & Vision](#roadmap--vision)
- [About & Contributing](#about--contributing)

---

## Core Features

### 1. Local-first Document Butler

Just specify a folder with your learning materials, and LocalMind will automatically scan and index **PDF / Word (doc/docx) / Markdown / TXT / HTML** files inside.

- **Incremental sync** based on file modification time and size — only new or changed files get indexed
- All content lives only in your **local SQLite** database
- Unplug the network cable — it still works

### 2. Dual-mode AI Q&A & Summarization

| Mode | Highlights | Best For |
| --- | --- | --- |
| **Local model mode** | Built-in Qwen2.5-1.5B-Instruct (~1GB), runs offline, zero cost | Sensitive documents, offline environments |
| **Remote API mode** | Bring your own API Key for OpenAI / DeepSeek / Tongyi Qianwen | When you need stronger results |

During Q&A, it **streams responses**, lets you **stop generation anytime**, **cites sources** for every answer, saves Q&A history, and offers a **Token-saving mode**. Any document can generate a summary with **one click**.

### 3. Powerful Search & Management

- **SQLite FTS full-text search** (with Chinese tokenization fallback)
- **Tag cloud / Keywords / Favorites / Recent documents**
- **Document preview & editing** — view PDF/Markdown/Word directly, edit Markdown too
- **Keyword co-occurrence knowledge graph** to discover connections between documents

> The key to knowledge management is "can you find it immediately when you need it".

---

## Who It's For

It serves a specific group of people, not "everyone":

- **Independent developers** tired of cloud note apps that spin "loading..." every time you open them, yet charge monthly subscriptions
- **Researchers** with unpublished papers, confidential code, or private manuscripts who have legitimate privacy concerns about cloud sync
- **Graduate students** with hundreds of PDF papers on their hard drives who spend forever searching for "that quote from that one paper"
- **Writers** who want a true "second brain" but don't want to hand over their thinking process to big tech

If you fit any of the above — LocalMind was probably made for you.

> If you need a team knowledge base for collaboration — this isn't it.

---

## Quick Start

### Windows Users (Recommended)

```
1. Download LocalMind-Setup-x.x.x.exe from Releases
2. Double-click to install; the default model (~1.1GB) downloads automatically on first launch
3. Select your study folder and let LocalMind scan + index it
4. Start chatting with your local AI assistant
```

### Run from Source

```bash
git clone https://github.com/YUN2023c/LocalMind.git
cd localmind-main
npm install
npm start
```

---

## Why LocalMind

### A Real Frustration Moment

Three months before the college entrance exam, I was sitting at my computer organizing wrong answers on a weekend.

My desktop was scattered with PDF exam papers, wrong-answer notebooks in Markdown, knowledge summaries saved from Zhihu and WeChat public accounts, and lecture notes downloaded from online forums.

I remembered seeing a physics problem's solution — but after searching through twenty subfolders in the "Senior Year Review" folder, I still couldn't find it.

I spent nearly forty minutes searching one by one with file search tools, Ctrl+F through PDFs, and scrolling Markdown files page by page.

I finally found it — but my entire afternoon review plan was ruined.

### That "If only..." Moment

That afternoon, a sentence popped into my head:

> If only there was a tool that could keep my documents local, yet let me ask questions and search them like ChatGPT.

There are local knowledge base tools out there, but they're too heavy, require setting up a whole complex environment, or only support a single format.

As a student who could write a little code, I decided to build one myself — lighter, more honest, just serving my own use case.

### Judgments & Trade-offs

As a solo project, cutting features wisely is far more important than excitedly adding them:

- **Cut cloud sync** — once data goes to the cloud, privacy risks are no longer controllable
- **Cut collaboration features** — fully sufficient for solo use; collaboration multiplies complexity exponentially
- **No vector database — using SQLite FTS** — zero dependencies, starts with the main process, sufficient for hundreds to thousands of documents
- **Currently only Windows** — cross-platform means testing three ends; one person really can't carry it

> The greatest advantage of independent developers isn't "can do everything" — it's "daring not to do certain things".

### Trade-offs Worth Mentioning

1. **Dual-mode inference**: Returning the choice of "effect vs privacy/offline" to you
2. **SQLite FTS instead of heavy vector database**: Zero dependencies, instant startup
3. **keytar stores API Key in system keychain, not plaintext on disk**
4. **Task queue (concurrency control + rate limiting)**: Dragging in hundreds of documents won't freeze your machine

> Honestly: LocalMind isn't the most powerful — but it might be the one that "disturbs you the least".

---

## Tech Stack

| Category | Technology | Version | Purpose |
| --- | --- | --- | --- |
| Desktop shell | Electron | `^42.4.1` | Desktop application framework |
| Local inference | node-llama-cpp | `^3.18.1` | llama.cpp-based inference for Qwen2.5-1.5B |
| Storage | sqlite3 | `^5.1.7` | Local storage + FTS full-text search |
| PDF parsing | pdfjs-dist / pdf-parse | `^6.0.227` / `^1.1.1` | Parsing and preview |
| Word parsing | mammoth / word-extractor / docx | `^1.8.0` / `^1.0.4` / `^9.7.1` | Parsing and generation |
| Markdown | marked | `^18.0.5` | Rendering |
| Security | keytar | `^7.9.0` | Secure API Key storage in system keychain |
| Configuration | electron-store | `^8.1.0` | Settings storage |
| Local model | Qwen2.5-1.5B-Instruct | — | Apache 2.0 open-source license |

> One-sentence summary of technical choices: If SQLite can solve it, never introduce a second service; if it can stay local, never go to the cloud.

---

## Roadmap & Vision

### Short-term: Already Working

- Collect scattered documents from across your hard drive into a searchable local library
- Let AI help you Q&A and summarize without leaking content
- Use knowledge graphs and full-text search to solve "can't find" and "can't see connections"

### Medium-term (Future Vision): Local OS for Your Second Brain

If one day LocalMind adds plugin mechanisms and a small community, it **might** explore becoming a "local OS for your second brain" — auto-fetch subscription feeds, periodic summaries, integrate with local calendar/todo. All of this, data stays local.

### Long-term (Future Vision): A Personal AI Knowledge Hub

In the era of AI Agents and privacy computing, LocalMind's **potential scenarios** aren't limited to individual users:

- **Enterprise security scenarios**: Personal knowledge base tool for employees, connected to internally deployed models
- **Research institutions & academic teams**: Lightweight choice for managing sensitive unpublished data and drafts

> ⚠️ The above medium and long-term content are **future visions**, **not yet implemented**.

---

## About & Contributing

LocalMind is a **personal independent development project**, currently maintained by just me, and currently supports only **Windows**.

It comes with a complete open-source software license, and you're welcome to read the source code, file Issues, submit PRs — or criticize me unreservedly where it's not good enough.

If you also believe "knowledge should stay in your own hands", welcome to help make it better together.

---

<div align="center">

<sub>Made with care by an independent developer.</sub>

</div>
