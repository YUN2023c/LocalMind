# LocalMind — Your Personal Local Knowledge Butler

> Your knowledge should live on your hard drive — not on some server you can't reach.

This is a locally-run knowledge management application built by one person.

No subscription fees.
No uploading your documents to the cloud.
No pretending to be an enterprise solution.

It just quietly helps you gather, organize, and query your scattered documents.

***

## 1. One-sentence Definition & Target Audience

**One-sentence definition:** LocalMind is a local-first desktop knowledge management application — it's not a cloud SaaS, doesn't charge monthly, and doesn't sync your documents to any server you can't see. It's simply a knowledge butler that runs on your own computer, with data stored only in local SQLite.

**It serves a specific group of people, not "everyone":**

- Independent developers tired of cloud note apps that spin "loading..." every time you open them, yet charge monthly subscriptions;
- Researchers with unpublished papers, confidential code, or private manuscripts who have legitimate privacy concerns about cloud sync;
- Graduate students with hundreds of PDF papers on their hard drives who spend forever searching for "that quote from that one paper";
- Writers who want a true "second brain" but don't want to hand over their thinking process to big tech.

If you fit any of the above — LocalMind was probably made for you.

If you need a team knowledge base for collaboration — this isn't it. I'll be honest about that in Chapter 3.

***

## 2. Core Features (2-3)

I'm not going to stack technical specs.

The three features below each solve a specific problem you've probably encountered yourself.

### 1. Local-first Document Butler — Solving "documents scattered everywhere, but cloud has privacy concerns"

Just specify a folder with your learning materials, and LocalMind will automatically scan and index PDF / Word (doc/docx) / Markdown / TXT / HTML files inside.

It won't rummage through your entire hard drive at once.

Instead, it uses file modification time and size for incremental sync — only new or changed files get indexed, the rest it leaves alone.

Most importantly: all content lives only in your local SQLite database.

No background uploads.
No "collecting your data to provide better service".

Unplug the network cable — it still works.

### 2. Dual-mode AI Q&A & Summarization — Solving "want to ask questions about documents, but fear content leakage"

This is the part I struggled with most, and the one I'm proudest of.

I built two inference modes, letting you choose:

- **Remote API mode:** Bring your own API Key (Key stored in system keychain via keytar, not plaintext in config files), call a remote model you trust. Strong results, but requires internet.
- **Local model mode:** One-click download of the built-in Qwen2.5-1.5B-Instruct (q4_k_m quantized, ~1GB), runs offline. Maximum privacy, and for a 1.5B model, the results are surprisingly good.

During Q&A, it **streams responses**, you can **stop generation anytime**; each answer **cites sources**, telling you which document it came from; Q&A history is saved; and there's a Token-saving mode for those on pay-as-you-go plans.

Also, any document can generate a summary with **one click**.

### 3. Powerful Search & Management — Solving "can't find documents"

When you have too many documents, the real pain is "not finding them".

LocalMind gives you three tools:

- **SQLite FTS full-text search** (with Chinese tokenization fallback) — find that quote in seconds;
- **Tag cloud / Keywords / Favorites / Recent documents** — pull documents out from different dimensions;
- **Document preview & editing** — view PDF/Markdown/Word directly, edit Markdown too.

> The key to knowledge management is "can you find it immediately when you need it".

***

## 3. Inspiration & Pain Points (The "Why")

### A Real Frustration Moment

Three months before the college entrance exam, I was sitting at my computer organizing wrong answers on a weekend.

My desktop was scattered with PDF exam papers for various subjects, wrong answer notebooks in Markdown, knowledge point summaries saved from Zhihu and WeChat public accounts, and lecture notes downloaded from online forums with matching video lessons.

I remembered seeing a physics problem's solution — but after searching through twenty subfolders in the "Senior Year Review" folder, I still couldn't find it.

I spent nearly forty minutes.

Searching one by one with file search tools.
Ctrl+F through PDFs one by one with a PDF reader.
Opening Markdown files in Notepad and scrolling page by page.

I finally found it — but my entire afternoon review plan was ruined.

Worse: I wanted to put this material into some cloud note tool and have AI help me summarize exam points and automatically generate wrong answer explanations — but every time I opened one, there were ads and VIP paywalls everywhere, making it impossible to focus.

So I kept manually organizing. Halfway through, I started questioning my life choices.

### That "If only..." Moment

That afternoon, a sentence popped into my head:

> If only there was a tool that could keep my documents local, yet let me ask questions and search them like ChatGPT.

There are local knowledge base tools out there.

But they're too heavy.
Or require setting up a whole complex environment.
Or only support a single format.

As a student who could write a little code, I decided to build one myself — lighter, more honest, just serving my own use case.

### Judgments & Trade-offs (I Must Be Honest)

As a solo project, cutting features wisely is far more important than excitedly adding them.

Here's what I intentionally cut or didn't build, and why:

- **Cut cloud sync.** Maintaining a server as an individual is expensive enough, but once data goes to the cloud, privacy risks are no longer controllable. This violates my original intent for this project.
- **Cut collaboration features (highlighting/notes/comment sharing).** Fully sufficient for solo use; once you add collaboration, permission management, data consistency, and conflict merging multiply complexity exponentially — one person can't handle it, and it easily distorts the product.
- **No vector database — using SQLite FTS instead.** I'm even a bit proud to admit this. Vector databases are too heavy for personal-scale document libraries and require an extra service. SQLite FTS has zero dependencies, starts with the main process, and is fully sufficient for searching hundreds to thousands of documents.
- **Currently only Windows.** Cross-platform means testing three ends, handling three sets of packaging and native dependencies — one person really can't carry it. Mac/Linux are things I want to do — just not now.

> The greatest advantage of independent developers isn't "can do everything" — it's "daring not to do certain things".

***

## 4. Innovation & Practicality (The "What's New")

I won't say "industry first" — that sounds too much like marketing copy.

What I want to say is: **In the specific scenario of "local privacy knowledge base", I've found a lighter solution.**

### Personal Developer Advantages Become Moats in This Scenario

- **No historical baggage.** No old version compatibility debt to carry, architecture can be designed for "local-first" from the first line of code.
- **Extremely fast decision-making.** Think of an improvement, ship it that night; no product review, no scheduling.
- **Extremely sensitive to edge requirements.** Big companies won't bake a 1GB small model into their product just for "running offline" — but I will, because I often write on high-speed trains without internet.

### A Few Trade-offs Worth Mentioning

1. **Dual-mode inference: Returning the choice of "effect vs privacy/offline" to you.**
   Remote API gives the strongest results, local model gives maximum privacy and offline capability. You don't have to choose — sensitive documents go local, public materials go remote. This flexibility is only possible with "dual-mode".
2. **SQLite FTS instead of heavy vector database: Zero dependencies, instant startup.**
   No Docker needed, no extra vector service to run, no worrying about it crashing. The entire app is an Electron package — double-click to open, close to quit.
3. **keytar stores API Key in system keychain, not plaintext on disk.**
   It's a small thing, but many local tools don't do it. Your Key won't sit in plaintext in some JSON file, accidentally committed to Git.
4. **Task queue (concurrency control + rate limiting).**
   Dragging in hundreds of documents at once won't freeze your machine — it queues them up, limits the rate, and processes them one by one.

> Honestly: LocalMind isn't the most powerful — but it might be the one that "disturbs you the least".

***

## 5. Future Vision & Roadmap (The "Vision")

I'll try to think big — but every sentence must be logically consistent and not make empty promises.

### Short-term: Solving Current Specific Problems

This is what LocalMind is doing right now, and already does well:

- Collect scattered documents from across your hard drive into a searchable local library;
- Let AI help you Q&A and summarize without leaking content;
- Use knowledge graphs and full-text search to solve the old problems of "can't find" and "can't see connections".

At this level, it's a useful, quiet, honest local knowledge butler.

### Medium-term (Future Vision): From "Knowledge Base" to "Local OS for Your Second Brain"

If one day LocalMind adds plugin mechanisms and a small community — it **might** become more than just a local note/knowledge base, and **explore** becoming a "local OS for your second brain" — you could hook in your own small tools: auto-fetch subscription feeds, periodic summaries, integrate with local calendar/todo. All of this, data stays local.

> I use "might" and "explore" — because these are still sketches in my head, not promises.

### Long-term (Future Vision): A Personal AI Knowledge Hub Where Data Never Leaves Local

Pulling back further.

In the era of AI Agents and privacy computing, "keeping personal data local, calling local or trusted models on demand" will become increasingly important.

LocalMind's **potential scenarios** aren't limited to individual users:

- **Enterprise security scenarios:** Companies with strict data security requirements might use LocalMind as employees' personal knowledge base tools — documents stay local, AI capabilities can connect to internally deployed models, satisfying both security compliance and personal productivity.
- **Research institutions & academic teams:** Research institutions often have large amounts of unpublished experimental data and paper drafts that must never be uploaded to public clouds. LocalMind's local-first nature **might** become a lightweight choice for researchers managing sensitive materials.

For individuals, its niche remains:

> A personal AI knowledge hub where data never leaves local — all your documents, notes, and Q&A history are on your own hard drive, while AI capabilities (whether local small models or authorized remote APIs) serve you around your data, not the other way around.

I must emphasize again: The above medium and long-term content are **future visions**, **not yet implemented**. I don't want anyone to misjudge its current state because of my enthusiasm for the future.

***

## Tech Stack

Honestly annotated, no embellishment:

- **Electron** `^42.4.1` — Desktop app shell
- **node-llama-cpp** `^3.18.1` — Local inference based on llama.cpp (driving Qwen2.5-1.5B)
- **sqlite3** `^5.1.7` — Local storage + FTS full-text search (not vector database, FTS)
- **pdfjs-dist** `^6.0.227` / **pdf-parse** `^1.1.1` — PDF parsing and preview
- **mammoth** `^1.8.0` / **word-extractor** `^1.0.4` / **docx** `^9.7.1` — Word parsing and generation
- **marked** `^18.0.5` — Markdown rendering
- **keytar** `^7.9.0` — API Key secure storage in system keychain
- **electron-store** `^8.1.0` — Configuration storage
- **Local Model:** Qwen2.5-1.5B-Instruct (Apache 2.0 open source license)

> One-sentence summary of technical choices: If SQLite can solve it, never introduce a second service; if it can stay local, never go to the cloud.

***

## About

LocalMind is a **personal independent development project**, currently maintained by just me, and currently supports only **Windows**.

It comes with a complete open-source software license, and you're welcome to read the source code, file Issues, submit PRs — or criticize me unreservedly where it's not good enough.

If you also believe "knowledge should stay in your own hands", welcome to help make it better together.

> — A student who just finished the college entrance exam, still coding late at night
