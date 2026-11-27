# SyntaxGraph

AST-Driven Property Graph and Agentic Hybrid GraphRAG Platform using **Tree-sitter**, **Neo4j**, **Qdrant**, **LangGraph**, **Gemini**, and **Next.js**.

## Quick Start

### 1. Configure Environment Variables
- Backend: copy `backend/.env.example` to `backend/.env`
- Frontend: copy `frontend/.env.local.example` to `frontend/.env.local`

### 2. Run with Docker Compose
```bash
docker compose up --build
```

### 3. Run Locally (Without Docker)
**Backend:**
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
*(If Neo4j/Qdrant are not running locally, the API automatically falls back to `InMemoryHybridStore` for testing and offline evaluation.)*

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Evaluation System
Run the comparative benchmark (**Baseline Vector-Only RAG** vs **Proposed SyntaxGraph**):
```bash
cd backend
.\.venv\Scripts\python -m app.eval
```
Or click **Run Evaluation** in the **Evaluation Benchmark** tab at `http://localhost:3000`.
