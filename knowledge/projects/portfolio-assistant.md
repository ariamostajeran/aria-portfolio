# Portfolio Assistant

## Summary
A RAG-powered agentic AI assistant embedded in Aria's portfolio website. Visitors can ask natural-language questions about Aria's skills, projects, and experience — the agent retrieves from a vector store of CV and project documentation and answers grounded in real content, not hallucinated. Built to demonstrate practical AI engineering: retrieval-augmented generation, agentic tool use, embedding models, and vector databases, all integrated into a production Flask app.

## Tech stack
- **BAAI/bge-small-en-v1.5** — HuggingFace embedding model; free, 384-dimensional, strong retrieval quality for a small model
- **ChromaDB 0.5.23** — local vector database; embedded directly in the Python process, no separate infra needed; pinned to 0.5.23 (0.6+ has a Rust backend incompatible with Databricks Python 3.12; 0.4.x uses np.float_ removed in NumPy 2.0)
- **OpenAI gpt-3.5-turbo** — LLM for generation; planned migration to Mistral 7B on Databricks for a fully open-source stack
- **ReAct agent pattern** — text-based TOOL/INPUT format, not OpenAI function calling; model-agnostic and debuggable without framework lock-in
- **Flask** — backend API blueprint exposing /api/chat; deployed as a separate Render service
- **Databricks** — development environment; Chroma runs in /tmp/, backed up zipped to /Workspace/Users/ after every ingest
- **Render.com** — production deployment as a separate free-tier service; portfolio proxies requests to it via ASSISTANT_API_URL env var

## What it does
1. **Ingestion (ingest_knowledge.py)** — reads CV and project markdown files, splits on ## headings, embeds each chunk with bge-small-en-v1.5, stores in ChromaDB collection `knowledge_base`.
2. **Code ingestion (ingest_code.py)** — clones the portfolio GitHub repo, chunks Python files by AST boundaries and JS files by regex, stores in ChromaDB collection `code_base`.
3. **Persistence (persistence.py)** — after every ingest, zips Chroma's SQLite store to /Workspace/Users/ on Databricks. On startup, restores from zip if /tmp/chroma.sqlite3 is missing. Prevents hallucination from an empty store after cluster restart.
4. **Retrieval (retriever.py)** — Retriever class exposes two tools: `search_knowledge` (semantic search over CV + project docs) and `search_code` (semantic search over source code). Returns top-k chunks with metadata.
5. **Agent (assistant.py)** — PortfolioAgent runs a ReAct loop: LLM reasons which tool to call, agent executes it, appends observation, loops until a final answer is produced. Full conversation history included in each API call for multi-turn coherence.
6. **API (api/routes.py)** — Flask blueprint exposes /api/chat (POST, takes message + history array, returns response) and /api/chat/reset. The portfolio site proxies calls server-side to avoid CORS.
7. **Chat widget** — floating button on every portfolio page opens a slide-in panel with message history, typing indicator, markdown rendering, and sessionStorage-based conversation persistence.

## Key technical decisions
- **ChromaDB version pinning** — must use exactly chromadb==0.5.23 with numpy<2.0. Newer Chroma breaks on Databricks; older Chroma breaks on NumPy 2.0.
- **Chroma on /tmp not /dbfs** — DBFS root is disabled on this workspace. /tmp/ is writable but ephemeral (wiped on cluster restart). Solution: run Chroma in /tmp/, backup to /Workspace/ after every write, restore on startup.
- **Two Chroma collections** — separating CV/project docs from source code allows targeted retrieval. Factual questions hit knowledge_base; "show me how X is implemented" questions hit code_base.
- **Proxy route in portfolio** — the portfolio Flask app proxies /api/assistant/chat to the assistant service URL stored in ASSISTANT_API_URL env var. Visitor never sees the assistant domain; CORS is avoided.
- **Client-side conversation history** — history stored in browser sessionStorage and sent in full with each request. No server-side session state. Works across page navigations.
- **Separate Render service** — the assistant (embedding model + ChromaDB + Flask) exceeds the portfolio's 512MB Render container. Deployed as a second free-tier service with graceful cold-start handling in the widget.

## What I learned
- ChromaDB dependency hell: three-way incompatibility between ChromaDB version, NumPy version, and Python version. Pin everything immediately.
- Empty vector store hallucination: when Chroma was empty after cluster restart, GPT-3.5 invented plausible but false project details. The persistence/restore pattern is not optional.
- AST chunking for code is worth it: splitting at function boundaries produces far more useful retrieval chunks than fixed-size splits.
- ReAct needs tight prompt engineering: the model must stay disciplined in THOUGHT/ACTION/OBSERVATION format; small prompt changes can cause it to skip tool calls and answer from memory.

## Results / metrics
- Two Chroma collections: knowledge_base (CV + project docs) and code_base (portfolio source)
- Embedding model: bge-small-en-v1.5, 384-dim
- Multi-turn coherence: pronoun resolution ("those projects", "that model") works across conversation turns
- Cold start on Render free tier: ~30-60 seconds; widget shows "warming up" message and auto-retries

## Links
- GitHub (assistant): github.com/ariamostajeran/portfolio-assistant
- GitHub (portfolio): github.com/ariamostajeran/aria-portfolio
- Live: aria-portfolio.onrender.com
