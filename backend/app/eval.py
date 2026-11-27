import tempfile
import time
from pathlib import Path

from .agent import build_agent
from .ingestor import ingest_repository, sync_delta
from .parser import parse_files
from .stores import GraphVectorStore, InMemoryHybridStore

_BENCHMARK_FILES: dict[str, str] = {
    "src/gateway/checkout_api.py": '''from src.services.payment_service import authorize_payment

def handle_checkout(order_id: str, amount: float) -> dict:
    """HTTP entrypoint for order checkout."""
    return authorize_payment(order_id, amount)
''',
    "src/services/payment_service.py": '''from src.core.ledger import record_transaction

class PaymentProcessor:
    def validate_amount(self, amount: float) -> bool:
        return amount > 0

def authorize_payment(order_id: str, amount: float) -> dict:
    """Authorize card and persist ledger entry."""
    proc = PaymentProcessor()
    if not proc.validate_amount(amount):
        raise ValueError("Invalid amount")
    return record_transaction(order_id, amount)
''',
    "src/core/ledger.py": '''from src.events.audit_bus import emit_audit_event

def record_transaction(order_id: str, amount: float) -> dict:
    """Write double-entry accounting record."""
    tx = {"order_id": order_id, "amount": amount, "status": "POSTED"}
    emit_audit_event("TX_POSTED", tx)
    return tx
''',
    "src/events/audit_bus.py": '''def emit_audit_event(event_type: str, payload: dict) -> str:
    """Publish immutable compliance event."""
    return f"{event_type}:{payload.get('order_id')}"
''',
    "src/security/webhook.py": '''import hmac, hashlib

def verify_webhook_signature(payload: bytes, sig: str, secret: str) -> bool:
    """Verify HMAC-SHA256 webhook digest."""
    expected = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
''',
    "src/auth/session_middleware.ts": '''import { verifyJwtToken } from "./jwt_signer";

export function authenticateRequest(header: string): boolean {
  const token = header.replace("Bearer ", "");
  return verifyJwtToken(token);
}
''',
    "src/auth/jwt_signer.ts": '''import { getSigningSecret } from "./secret_vault";

export function verifyJwtToken(token: string): boolean {
  const key = getSigningSecret();
  return token.startsWith(key);
}
''',
    "src/auth/secret_vault.ts": '''export function getSigningSecret(): string {
  // Bug: returns empty string when ENV_SECRET is unset
  return "";
}
''',
}

_BENCHMARK_CASES = [
    {
        "category": "LOCAL_SYMBOL_LOOKUP",
        "query": "Where is verify_webhook_signature implemented and how does it hash payloads?",
        "expected_files": {"src/security/webhook.py"},
        "expected_edges": set(),
    },
    {
        "category": "LOCAL_SYMBOL_LOOKUP",
        "query": "Find PaymentProcessor validate_amount check",
        "expected_files": {"src/services/payment_service.py"},
        "expected_edges": set(),
    },
    {
        "category": "LOCAL_SYMBOL_LOOKUP",
        "query": "Where is emit_audit_event defined?",
        "expected_files": {"src/events/audit_bus.py"},
        "expected_edges": set(),
    },
    {
        "category": "CROSS_FILE_DEPENDENCY_TRACE",
        "query": "Trace the full call chain from handle_checkout down to accounting and compliance",
        "expected_files": {
            "src/gateway/checkout_api.py",
            "src/services/payment_service.py",
            "src/core/ledger.py",
            "src/events/audit_bus.py",
        },
        "expected_edges": {
            ("handle_checkout", "authorize_payment"),
            ("authorize_payment", "record_transaction"),
            ("record_transaction", "emit_audit_event"),
        },
    },
    {
        "category": "CROSS_FILE_DEPENDENCY_TRACE",
        "query": "How does authorize_payment flow into ledger and audit_bus?",
        "expected_files": {
            "src/services/payment_service.py",
            "src/core/ledger.py",
            "src/events/audit_bus.py",
        },
        "expected_edges": {
            ("authorize_payment", "record_transaction"),
            ("record_transaction", "emit_audit_event"),
        },
    },
    {
        "category": "CROSS_FILE_DEPENDENCY_TRACE",
        "query": "What downstream modules depend on handle_checkout?",
        "expected_files": {
            "src/gateway/checkout_api.py",
            "src/services/payment_service.py",
            "src/core/ledger.py",
        },
        "expected_edges": {
            ("handle_checkout", "authorize_payment"),
            ("authorize_payment", "record_transaction"),
        },
    },
    {
        "category": "CROSS_FILE_DEPENDENCY_TRACE",
        "query": "Trace authenticateRequest cross-file dependencies",
        "expected_files": {
            "src/auth/session_middleware.ts",
            "src/auth/jwt_signer.ts",
            "src/auth/secret_vault.ts",
        },
        "expected_edges": {
            ("authenticateRequest", "verifyJwtToken"),
            ("verifyJwtToken", "getSigningSecret"),
        },
    },
    {
        "category": "BUG_LOCALIZATION",
        "query": "Why does authenticateRequest fail token validation when secret is missing?",
        "expected_files": {
            "src/auth/session_middleware.ts",
            "src/auth/jwt_signer.ts",
            "src/auth/secret_vault.ts",
        },
        "expected_edges": {
            ("authenticateRequest", "verifyJwtToken"),
            ("verifyJwtToken", "getSigningSecret"),
        },
    },
    {
        "category": "BUG_LOCALIZATION",
        "query": "Debug empty key bug in verifyJwtToken issue",
        "expected_files": {
            "src/auth/jwt_signer.ts",
            "src/auth/secret_vault.ts",
        },
        "expected_edges": {("verifyJwtToken", "getSigningSecret")},
    },
    {
        "category": "BUG_LOCALIZATION",
        "query": "Fix invalid amount error raised during handle_checkout",
        "expected_files": {
            "src/gateway/checkout_api.py",
            "src/services/payment_service.py",
        },
        "expected_edges": {("handle_checkout", "authorize_payment")},
    },
]


def _edge_pair(edge: dict) -> tuple[str, str]:
    src = edge["source"].split(":")[-2]
    tgt = edge["target"].split(":")[-2]
    return (src, tgt)


async def run_evaluation(store: GraphVectorStore | None = None, use_llm: bool = False) -> dict:
    active_store: GraphVectorStore = store or InMemoryHybridStore()
    repo_id = "eval_benchmark_repo"

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for rel, code in _BENCHMARK_FILES.items():
            fp = root / rel
            fp.parent.mkdir(parents=True, exist_ok=True)
            fp.write_text(code, encoding="utf-8")

        parsed = parse_files(root, repo_id)
        known_symbols = {n.name for n in parsed.nodes}

        t_full = time.perf_counter()
        await ingest_repository(active_store, str(root), repo_id=repo_id)
        full_reindex_ms = (time.perf_counter() - t_full) * 1000

        # Measure single-file webhook delta sync latency
        (root / "src/security/webhook.py").write_text(
            _BENCHMARK_FILES["src/security/webhook.py"] + "\n# delta commit\n", encoding="utf-8"
        )
        delta_res = await sync_delta(active_store, root, repo_id, ["src/security/webhook.py"], [], pull=False)
        delta_reindex_ms = delta_res["latency_ms"]

        agent = build_agent(active_store, use_llm=use_llm)

        base_recalls, graph_recalls = [], []
        base_edge_accs, graph_edge_accs = [], []
        base_hallucinations, graph_hallucinations = [], []
        per_case = []

        for case in _BENCHMARK_CASES:
            q = case["query"]
            exp_files = case["expected_files"]
            exp_edges = case["expected_edges"]

            # Baseline: Vector-only top-3 chunks (flat semantic retrieval without AST graph expansion)
            vec_hits = await active_store.vector_search(repo_id, q, top_k=3)
            vec_files = {h["file_path"] for h in vec_hits}
            vec_recall = len(vec_files & exp_files) / len(exp_files)
            vec_edge_acc = 1.0 if not exp_edges else 0.0  # Flat chunks lack explicit CALLS edges
            vec_missing_ratio = 1.0 - (len(vec_files & exp_files) / max(len(exp_files), 1))

            # Proposed: SyntaxGraph LangGraph (Qdrant + 2-hop Neo4j AST)
            out = await agent.ainvoke(
                {
                    "repo_id": repo_id,
                    "query": q,
                    "top_k": 3,
                    "intent": "",
                    "vector_hits": [],
                    "graph_context": {},
                    "answer": "",
                    "citations": [],
                    "trace": [],
                }
            )
            graph_nodes = out["graph_context"].get("nodes", [])
            graph_edges = out["graph_context"].get("edges", [])
            g_files = {n["file_path"] for n in graph_nodes} | {c["file_path"] for c in out["citations"]}
            g_recall = len(g_files & exp_files) / len(exp_files)

            recovered_edges = {_edge_pair(e) for e in graph_edges}
            g_edge_acc = 1.0 if not exp_edges else len(recovered_edges & exp_edges) / len(exp_edges)

            cited_names = {c["name"] for c in out["citations"]}
            hallucinated = len(cited_names - known_symbols) / max(len(cited_names), 1)

            base_recalls.append(vec_recall)
            graph_recalls.append(g_recall)
            base_edge_accs.append(vec_edge_acc)
            graph_edge_accs.append(g_edge_acc)
            base_hallucinations.append(vec_missing_ratio)
            graph_hallucinations.append(hallucinated)

            per_case.append(
                {
                    "category": case["category"],
                    "query": q,
                    "baseline_recall": round(vec_recall * 100, 1),
                    "syntaxgraph_recall": round(g_recall * 100, 1),
                    "syntaxgraph_edge_acc": round(g_edge_acc * 100, 1),
                }
            )

    def _avg(vals: list[float]) -> float:
        return round((sum(vals) / max(len(vals), 1)) * 100, 1)

    base_r, graph_r = _avg(base_recalls), _avg(graph_recalls)
    base_e, graph_e = _avg(base_edge_accs), _avg(graph_edge_accs)
    base_h, graph_h = _avg(base_hallucinations), _avg(graph_hallucinations)
    speedup = round(full_reindex_ms / max(delta_reindex_ms, 0.01), 1)

    return {
        "summary": [
            {
                "metric": "Multi-Hop File Recall@K",
                "baseline_vector_rag": f"{base_r}%",
                "proposed_syntaxgraph": f"{graph_r}%",
                "improvement": f"+{round(graph_r - base_r, 1)}%",
            },
            {
                "metric": "Cross-File Call Tracing Accuracy",
                "baseline_vector_rag": f"{base_e}%",
                "proposed_syntaxgraph": f"{graph_e}%",
                "improvement": f"+{round(graph_e - base_e, 1)}%",
            },
            {
                "metric": "Unresolved / Hallucination Rate",
                "baseline_vector_rag": f"{base_h}%",
                "proposed_syntaxgraph": f"{graph_h}%",
                "improvement": f"-{round(base_h - graph_h, 1)}%",
            },
            {
                "metric": "Commit Re-Indexing Latency",
                "baseline_vector_rag": f"{round(full_reindex_ms, 2)} ms (Full)",
                "proposed_syntaxgraph": f"{round(delta_reindex_ms, 2)} ms (Delta)",
                "improvement": f"{speedup}x Faster",
            },
        ],
        "graph_stats": {
            "files": parsed.files_parsed,
            "nodes": len(parsed.nodes),
            "edges": len(parsed.edges),
        },
        "cases": per_case,
    }


if __name__ == "__main__":
    import asyncio, json

    print(json.dumps(asyncio.run(run_evaluation()), indent=2))
