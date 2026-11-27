import asyncio
import re
from collections import Counter

import httpx
from google import genai

from .config import get_settings


def parse_github_owner_repo(repo_url: str) -> tuple[str, str]:
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", repo_url.strip())
    if not m:
        raise ValueError("Provide a valid GitHub repository URL (https://github.com/owner/repo)")
    return m.group(1), m.group(2)


def _gh_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "SyntaxGraph"}
    token = get_settings().github_token
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def _gemini_summarize(prompt: str, fallback: str) -> str:
    s = get_settings()
    if not s.gemini_api_key:
        return fallback
    client = genai.Client(api_key=s.gemini_api_key)
    try:
        return await asyncio.to_thread(
            lambda: client.models.generate_content(model=s.gemini_model, contents=prompt).text or fallback
        )
    except Exception:
        return fallback


async def summarize_github_activity(repo_url: str, kind: str = "commits", limit: int = 5) -> dict:
    owner, repo = parse_github_owner_repo(repo_url)
    limit = max(1, min(limit, 15))
    base = f"https://api.github.com/repos/{owner}/{repo}"

    async with httpx.AsyncClient(timeout=15.0, headers=_gh_headers()) as client:
        if kind == "prs":
            r = await client.get(f"{base}/pulls", params={"state": "all", "per_page": limit})
            r.raise_for_status()
            items = [
                {
                    "id": f"#{p['number']}",
                    "title": p["title"],
                    "author": (p.get("user") or {}).get("login", "unknown"),
                    "state": "merged" if p.get("merged_at") else p["state"],
                    "date": p["updated_at"][:10],
                    "url": p["html_url"],
                    "body": (p.get("body") or "")[:300],
                }
                for p in r.json()
            ]
            bullets = "\n".join(f"- {x['id']} [{x['state']}] {x['title']} (by {x['author']}): {x['body']}" for x in items)
            fallback = f"**Recent Pull Requests ({len(items)}):**\n" + ("\n".join(f"- `{x['id']}` ({x['state']}) **{x['title']}** — {x['author']}" for x in items) or "No pull requests found.")
            prompt = f"Summarize these recent pull requests for {owner}/{repo}. Highlight main themes, architectural impact, and open vs merged work:\n\n{bullets}"
        else:
            r = await client.get(f"{base}/commits", params={"per_page": limit})
            r.raise_for_status()
            items = [
                {
                    "id": c["sha"][:7],
                    "title": c["commit"]["message"].splitlines()[0],
                    "author": (c.get("author") or {}).get("login") or c["commit"]["author"]["name"],
                    "state": "commit",
                    "date": c["commit"]["author"]["date"][:10],
                    "url": c["html_url"],
                    "body": "\n".join(c["commit"]["message"].splitlines()[1:4])[:250],
                }
                for c in r.json()
            ]
            bullets = "\n".join(f"- `{x['id']}` ({x['date']}, {x['author']}): {x['title']} {x['body']}" for x in items)
            fallback = f"**Recent Commits ({len(items)}):**\n" + ("\n".join(f"- `{x['id']}` **{x['title']}** — {x['author']} ({x['date']})" for x in items) or "No commits found.")
            prompt = f"Summarize these recent commits for {owner}/{repo}. Group related work, highlight key features/fixes, and note potential areas of change:\n\n{bullets}"

    summary = await _gemini_summarize(prompt, fallback) if items else f"No {kind} found for `{owner}/{repo}`."
    return {"repo": f"{owner}/{repo}", "kind": kind, "items": items, "summary": summary}


async def summarize_project_graph(repo_id: str, graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        raise ValueError(f"No AST nodes found for repo '{repo_id}'. Ingest the repository first.")

    kind_counts = dict(Counter(n["kind"] for n in nodes))
    edge_counts = dict(Counter(e["kind"] for e in edges))
    deg = Counter()
    for e in edges:
        deg[e["source"]] += 1
        deg[e["target"]] += 1

    by_id = {n["node_id"]: n for n in nodes}
    hubs = [
        {"name": by_id[nid]["name"], "kind": by_id[nid]["kind"], "file_path": by_id[nid]["file_path"], "degree": cnt}
        for nid, cnt in deg.most_common(8)
        if nid in by_id and by_id[nid]["kind"] != "File"
    ]
    files = sorted({n["file_path"] for n in nodes})[:30]

    fallback = (
        f"**Project `{repo_id}` Architecture Overview**\n\n"
        f"- **Indexed Graph:** {len(nodes)} AST nodes across {kind_counts.get('File', len(files))} files, {len(edges)} dependency edges\n"
        f"- **Node Breakdown:** {', '.join(f'{k}: {v}' for k, v in kind_counts.items())}\n"
        f"- **Core Hub Symbols:** {', '.join(f'`{h['name']}` ({h['degree']} links)' for h in hubs[:5]) or 'N/A'}"
    )
    prompt = (
        f"Provide a crisp architectural summary of codebase '{repo_id}' from its AST property graph.\n"
        f"Cover: 1) High-level purpose & layers, 2) Key modules/files, 3) Core hub symbols & call flow.\n\n"
        f"Node counts: {kind_counts}\nEdge counts: {edge_counts}\n"
        f"Files: {files}\n"
        f"Top Hub Symbols: {hubs}\n"
        f"Sample Edges: {[(e['source'].split(':')[-2], e['kind'], e['target'].split(':')[-2]) for e in edges[:25]]}"
    )
    summary = await _gemini_summarize(prompt, fallback)
    return {"repo_id": repo_id, "kind_counts": kind_counts, "edge_counts": edge_counts, "hubs": hubs, "summary": summary}


def audit_repo_graph(repo_id: str, graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        raise ValueError(f"No AST nodes found for repo '{repo_id}'.")

    by_id = {n["node_id"]: n for n in nodes}
    in_deg: Counter[str] = Counter()
    out_deg: Counter[str] = Counter()
    adj: dict[str, list[str]] = {}
    for e in edges:
        if e["kind"] in {"CALLS", "IMPORTS", "INHERITS"}:
            out_deg[e["source"]] += 1
            in_deg[e["target"]] += 1
            adj.setdefault(e["source"], []).append(e["target"])

    # Detect directed cycles (circular imports / call recursion) via bounded 3-color DFS
    state: dict[str, int] = {}
    cycles: list[list[str]] = []
    stack: list[str] = []

    def _dfs(u: str) -> None:
        if len(cycles) >= 8:
            return
        state[u] = 1
        stack.append(u)
        for v in adj.get(u, ()):
            if state.get(v, 0) == 1 and v in stack:
                idx = stack.index(v)
                cyc = [by_id[x]["name"] for x in stack[idx:] + [v] if x in by_id]
                if len(cyc) >= 2:
                    cycles.append(cyc)
            elif state.get(v, 0) == 0:
                _dfs(v)
        stack.pop()
        state[u] = 2

    for nid in by_id:
        if state.get(nid, 0) == 0:
            _dfs(nid)

    ignore_prefixes = ("test_", "main", "__", "handle_")
    orphans = [
        {"node_id": n["node_id"], "name": n["name"], "kind": n["kind"], "file_path": n["file_path"], "start_line": n["start_line"]}
        for n in nodes
        if n["kind"] in {"Function", "Class", "Interface"}
        and in_deg[n["node_id"]] == 0
        and not n["name"].startswith(ignore_prefixes)
    ][:15]

    hotspots = [
        {
            "node_id": nid,
            "name": by_id[nid]["name"],
            "kind": by_id[nid]["kind"],
            "file_path": by_id[nid]["file_path"],
            "fan_in": in_deg[nid],
            "fan_out": out_deg[nid],
        }
        for nid in sorted(by_id, key=lambda k: in_deg[k] + out_deg[k], reverse=True)[:8]
        if in_deg[nid] + out_deg[nid] > 0
    ]

    return {"repo_id": repo_id, "cycles": cycles, "orphan_symbols": orphans, "hotspots": hotspots}
