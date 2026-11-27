import asyncio
import re
import subprocess
import time
from pathlib import Path

from .config import get_settings
from .parser import parse_files
from .stores import GraphVectorStore


def derive_repo_id(repo_url: str) -> str:
    cleaned = repo_url.rstrip("/").removesuffix(".git")
    parts = [p for p in re.split(r"[/:\\]", cleaned) if p]
    return "_".join(parts[-2:]) if len(parts) >= 2 else (parts[-1] if parts else "repo")


def _run_git(args: list[str], cwd: Path | None = None) -> None:
    proc = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")


async def ensure_repo_checkout(repo_url: str, repo_id: str, branch: str = "main") -> Path:
    local = Path(repo_url)
    if local.exists() and local.is_dir():
        return local.resolve()

    s = get_settings()
    base = Path(s.repos_dir)
    base.mkdir(parents=True, exist_ok=True)
    target = (base / repo_id).resolve()

    auth_url = repo_url
    if s.github_token and repo_url.startswith("https://github.com/"):
        auth_url = repo_url.replace("https://", f"https://x-access-token:{s.github_token}@", 1)

    if (target / ".git").exists():
        await asyncio.to_thread(_run_git, ["fetch", "--depth", "1", "origin", branch], target)
        await asyncio.to_thread(_run_git, ["reset", "--hard", f"origin/{branch}"], target)
    else:
        await asyncio.to_thread(_run_git, ["clone", "--depth", "1", "--branch", branch, auth_url, str(target)])
    return target


async def ingest_repository(store: GraphVectorStore, repo_url: str, repo_id: str | None = None, branch: str = "main") -> dict:
    t0 = time.perf_counter()
    rid = repo_id or derive_repo_id(repo_url)
    root = await ensure_repo_checkout(repo_url, rid, branch)
    parsed = await asyncio.to_thread(parse_files, root, rid)
    await store.upsert(parsed.nodes, parsed.edges)
    return {
        "repo_id": rid,
        "files_parsed": parsed.files_parsed,
        "nodes_indexed": len(parsed.nodes),
        "edges_indexed": len(parsed.edges),
        "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


async def sync_delta(
    store: GraphVectorStore,
    repo_root: Path,
    repo_id: str,
    modified_files: list[str],
    removed_files: list[str],
    pull: bool = True,
) -> dict:
    t0 = time.perf_counter()
    if pull and (repo_root / ".git").exists():
        await asyncio.to_thread(_run_git, ["pull", "--ff-only"], repo_root)

    to_delete = list(set(removed_files + modified_files))
    await store.delete_files(repo_id, to_delete)

    existing_paths = [repo_root / p for p in modified_files if (repo_root / p).is_file()]
    parsed = await asyncio.to_thread(parse_files, repo_root, repo_id, existing_paths)
    await store.upsert(parsed.nodes, parsed.edges)
    return {
        "repo_id": repo_id,
        "deleted_files": len(to_delete),
        "reindexed_files": parsed.files_parsed,
        "nodes_upserted": len(parsed.nodes),
        "edges_upserted": len(parsed.edges),
        "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
    }
