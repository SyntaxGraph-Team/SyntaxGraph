import hashlib
import hmac
from pathlib import Path
from fastapi.testclient import TestClient

from app.auth import verify_webhook_signature
from app.eval import run_evaluation
from app.ingestor import sync_delta
from app.main import app
from app.parser import parse_files
from app.stores import InMemoryHybridStore


def test_treesitter_multilang_parsing(tmp_path: Path):
    (tmp_path / "base.py").write_text("class BaseService:\n    def ping(self):\n        return 'ok'\n")
    (tmp_path / "svc.py").write_text(
        "from base import BaseService\nclass AuthService(BaseService):\n    def login(self):\n        return self.ping()\n"
    )
    (tmp_path / "app.ts").write_text("interface User { id: string }\nexport function greet(u: User) { return u.id }\n")
    (tmp_path / "engine.cpp").write_text("int compute() { return 42; }\nint main() { return compute(); }\n")

    res = parse_files(tmp_path, "demo")
    names = {n.name for n in res.nodes}
    edge_kinds = {e.kind for e in res.edges}
    assert {"BaseService", "AuthService", "login", "User", "greet", "compute", "main"} <= names
    assert {"CONTAINS", "IMPORTS", "CALLS", "INHERITS"} <= edge_kinds


def test_webhook_hmac_verification():
    payload = b'{"ref":"refs/heads/main"}'
    secret = "topsecret"
    sig = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    assert verify_webhook_signature(payload, sig, secret)
    assert not verify_webhook_signature(payload, "sha256=bad", secret)


async def test_delta_sync_updates_and_removes(tmp_path: Path):
    f1 = tmp_path / "a.py"
    f2 = tmp_path / "b.py"
    f1.write_text("def alpha():\n    return 1\n")
    f2.write_text("def beta():\n    return 2\n")

    store = InMemoryHybridStore()
    parsed = parse_files(tmp_path, "r1")
    await store.upsert(parsed.nodes, parsed.edges)

    f1.write_text("def alpha_v2():\n    return 99\n")
    f2.unlink()
    await sync_delta(store, tmp_path, "r1", ["a.py"], ["b.py"], pull=False)

    names = {n.name for n in store.nodes.values()}
    assert "alpha_v2" in names
    assert "alpha" not in names
    assert "beta" not in names


async def test_evaluation_outperforms_baseline():
    report = await run_evaluation(use_llm=False)
    assert len(report["summary"]) == 4
    recall_row = report["summary"][0]
    base_val = float(recall_row["baseline_vector_rag"].rstrip("%"))
    sg_val = float(recall_row["proposed_syntaxgraph"].rstrip("%"))
    assert sg_val > base_val


def test_api_end_to_end(tmp_path: Path):
    (tmp_path / "mod.py").write_text("def helper():\n    return 1\ndef entry():\n    return helper()\n")
    with TestClient(app) as client:
        h = client.get("/health")
        assert h.status_code == 200

        ing = client.post("/api/repos/ingest", json={"repo_url": str(tmp_path), "repo_id": "local_test"})
        assert ing.status_code == 200
        assert ing.json()["nodes_indexed"] >= 3

        g = client.get("/api/repos/local_test/graph")
        assert g.status_code == 200
        assert len(g.json()["edges"]) >= 1

        q = client.post("/api/query", json={"repo_id": "local_test", "query": "trace entry calling helper"})
        assert q.status_code == 200
        assert q.json()["intent"] == "CROSS_FILE_DEPENDENCY_TRACE"

        ev = client.post("/api/eval/run", json={"use_live_stores": False, "use_llm": False})
        assert ev.status_code == 200
        assert len(ev.json()["cases"]) == 10

        summ = client.post("/api/repos/local_test/summarize")
        assert summ.status_code == 200
        assert summ.json()["repo_id"] == "local_test"

        first_node = g.json()["nodes"][0]["node_id"]
        imp = client.get(f"/api/repos/local_test/impact?node_id={first_node}")
        assert imp.status_code == 200
        assert len(imp.json()["nodes"]) >= 1

        repos = client.get("/api/repos")
        assert repos.status_code == 200
        assert any(r["repo_id"] == "local_test" for r in repos.json()["repos"])

        nd = client.get(f"/api/repos/local_test/node?node_id={first_node}")
        assert nd.status_code == 200
        assert "raw_code" in nd.json()

        aud = client.get("/api/repos/local_test/audit")
        assert aud.status_code == 200
        assert "hotspots" in aud.json()

        pth = client.get("/api/repos/local_test/path?source=entry&target=helper")
        assert pth.status_code == 200
        assert len(pth.json()["nodes"]) == 2
