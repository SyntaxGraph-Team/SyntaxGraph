import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .agent import build_agent
from .auth import require_auth, verify_github_webhook
from .config import get_settings
from .eval import run_evaluation
from .ingestor import derive_repo_id, ingest_repository, sync_delta
from .models import EvalRequest, IngestRequest, QueryRequest
from .stores import DualHybridStore, GraphVectorStore, InMemoryHybridStore

_store: GraphVectorStore | None = None


def get_store() -> GraphVectorStore:
    assert _store is not None
    return _store


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _store
    try:
        dual = DualHybridStore()
        await dual.init()
        _store = dual
    except Exception:
        _store = InMemoryHybridStore()
        await _store.init()
    yield
    if isinstance(_store, DualHybridStore):
        await _store.close()


app = FastAPI(title="SyntaxGraph API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    s = get_settings()
    mode = "neo4j+qdrant" if isinstance(_store, DualHybridStore) else "in_memory_fallback"
    return {"status": "ok", "store_mode": mode, "llm_configured": bool(s.gemini_api_key)}


@app.post("/api/repos/ingest")
async def ingest_repo(req: IngestRequest, _: dict = Depends(require_auth)):
    try:
        return await ingest_repository(get_store(), req.repo_url, req.repo_id, req.branch)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/repos/{repo_id}/graph")
async def repo_graph(repo_id: str, limit: int = 250, _: dict = Depends(require_auth)):
    return await get_store().get_repo_graph(repo_id, limit=limit)


@app.post("/api/query")
async def query_repo(req: QueryRequest, _: dict = Depends(require_auth)):
    agent = build_agent(get_store(), use_llm=True)
    res = await agent.ainvoke(
        {
            "repo_id": req.repo_id,
            "query": req.query,
            "top_k": req.top_k,
            "intent": "",
            "vector_hits": [],
            "graph_context": {},
            "answer": "",
            "citations": [],
            "trace": [],
        }
    )
    return {
        "intent": res["intent"],
        "answer": res["answer"],
        "citations": res["citations"],
        "subgraph": res["graph_context"],
        "trace": res["trace"],
    }


@app.post("/api/webhooks/github")
async def github_webhook(request: Request, body: bytes = Depends(verify_github_webhook)):
    event = request.headers.get("X-GitHub-Event", "push")
    if event != "push":
        return {"ignored": True, "event": event}

    payload = json.loads(body)
    repo_url = payload.get("repository", {}).get("clone_url") or payload.get("repository", {}).get("html_url", "")
    repo_id = derive_repo_id(repo_url) if repo_url else payload.get("repository", {}).get("full_name", "").replace("/", "_")
    repo_root = Path(get_settings().repos_dir) / repo_id

    modified: list[str] = []
    removed: list[str] = []
    for commit in payload.get("commits", []):
        modified.extend(commit.get("added", []))
        modified.extend(commit.get("modified", []))
        removed.extend(commit.get("removed", []))

    if not repo_root.exists():
        if not repo_url:
            raise HTTPException(status_code=400, detail="Repository not cloned and no clone_url provided")
        return await ingest_repository(get_store(), repo_url, repo_id=repo_id)

    return await sync_delta(get_store(), repo_root, repo_id, modified, removed, pull=True)


@app.post("/api/eval/run")
async def run_eval(req: EvalRequest, _: dict = Depends(require_auth)):
    target_store = get_store() if req.use_live_stores else InMemoryHybridStore()
    return await run_evaluation(target_store, use_llm=req.use_llm)
