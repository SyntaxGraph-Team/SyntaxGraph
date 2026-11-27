import asyncio
import re
from collections import Counter

import httpx
from google import genai

from .config import get_settings


def parse_github_owner_repo(repo_url: str) -> tuple[str, str]:
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", repo_url.strip())
    if not m:
        raise ValueError("Please enter a valid GitHub link (https://github.com/owner/repo)")
    return m.group(1), m.group(2)


def _gh_headers(token_override: str | None = None) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "SyntaxGraph"}
    token = token_override or get_settings().github_token
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def _gh_get(client: httpx.AsyncClient, url: str, params: dict, token_override: str | None = None) -> httpx.Response:
    r = await client.get(url, params=params, headers=_gh_headers(token_override))
    if r.status_code in (401, 403) and not token_override and get_settings().github_token:
        # Retry without server token in case it lacks scope for a public repo
        r = await client.get(url, params=params, headers={"Accept": "application/vnd.github+json", "User-Agent": "SyntaxGraph"})
    if r.status_code == 403:
        raise RuntimeError("GitHub API limit reached or access denied. Sign in with GitHub so your own GitHub token is used.")
    r.raise_for_status()
    return r


def _format_repo(repo: dict) -> dict:
    return {
        "name": repo["name"],
        "full_name": repo["full_name"],
        "url": repo["html_url"],
        "private": repo.get("private", False),
        "language": repo.get("language") or "Code",
        "updated_at": (repo.get("updated_at") or "")[:10],
    }


async def list_user_github_repos(
    github_token: str | None = None, github_uid: str | None = None, limit: int = 24
) -> list[dict]:
    per_page = max(1, min(limit, 50))
    async with httpx.AsyncClient(timeout=15.0) as client:
        if github_token:
            r = await client.get(
                "https://api.github.com/user/repos",
                params={"sort": "updated", "per_page": per_page, "affiliation": "owner,collaborator,organization_member"},
                headers=_gh_headers(github_token),
            )
            if r.status_code == 200 and r.json():
                return [_format_repo(repo) for repo in r.json()]

            u = await client.get("https://api.github.com/user", headers=_gh_headers(github_token))
            if u.status_code == 200:
                login = u.json().get("login")
                if login:
                    pub = await _gh_get(
                        client,
                        f"https://api.github.com/users/{login}/repos",
                        {"sort": "updated", "per_page": per_page},
                        github_token,
                    )
                    return [_format_repo(repo) for repo in pub.json()]

        if github_uid:
            u = await _gh_get(client, f"https://api.github.com/user/{github_uid}", {})
            login = u.json().get("login")
            if login:
                pub = await _gh_get(
                    client,
                    f"https://api.github.com/users/{login}/repos",
                    {"sort": "updated", "per_page": per_page},
                )
                return [_format_repo(repo) for repo in pub.json()]
    return []


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


async def summarize_github_activity(
    repo_url: str, kind: str = "commits", limit: int = 5, github_token: str | None = None
) -> dict:
    owner, repo = parse_github_owner_repo(repo_url)
    limit = max(1, min(limit, 15))
    base = f"https://api.github.com/repos/{owner}/{repo}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        if kind == "prs":
            r = await _gh_get(client, f"{base}/pulls", {"state": "all", "per_page": limit}, github_token)
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
            prompt = f"Summarize these recent pull requests for {owner}/{repo} in simple, clear language. Highlight main themes and open vs merged work:\n\n{bullets}"
        else:
            r = await _gh_get(client, f"{base}/commits", {"per_page": limit}, github_token)
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
            prompt = f"Summarize these recent commits for {owner}/{repo} in simple, clear language. Group related work and highlight key updates:\n\n{bullets}"

    summary = await _gemini_summarize(prompt, fallback) if items else f"No {kind} found for `{owner}/{repo}`."
    return {"repo": f"{owner}/{repo}", "kind": kind, "items": items, "summary": summary}


async def summarize_project_graph(repo_id: str, graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        raise ValueError(f"No mapped code found for '{repo_id}'. Analyze the repository first.")

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
        f"**Project `{repo_id}` Overview**\n\n"
        f"- **Mapped Code:** {len(nodes)} items across {kind_counts.get('File', len(files))} files, {len(edges)} connections\n"
        f"- **Breakdown:** {', '.join(f'{k}: {v}' for k, v in kind_counts.items())}\n"
        f"- **Main Building Blocks:** {', '.join(f'`{h['name']}` ({h['degree']} links)' for h in hubs[:5]) or 'N/A'}"
    )
    prompt = (
        f"Explain what codebase '{repo_id}' does and how it is organized in clear, plain English.\n"
        f"Cover: 1) Overall purpose, 2) Main folders/files, 3) Key functions and how they connect.\n\n"
        f"Counts: {kind_counts}\nConnections: {edge_counts}\n"
        f"Files: {files}\n"
        f"Key Symbols: {hubs}\n"
        f"Sample Connections: {[(e['source'].split(':')[-2], e['kind'], e['target'].split(':')[-2]) for e in edges[:25]]}"
    )
    summary = await _gemini_summarize(prompt, fallback)
    return {"repo_id": repo_id, "kind_counts": kind_counts, "edge_counts": edge_counts, "hubs": hubs, "summary": summary}


def audit_repo_graph(repo_id: str, graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        raise ValueError(f"No mapped code found for '{repo_id}'.")

    by_id = {n["node_id"]: n for n in nodes}
    in_deg: Counter[str] = Counter()
    out_deg: Counter[str] = Counter()
    adj: dict[str, list[str]] = {}
    for e in edges:
        if e["kind"] in {"CALLS", "IMPORTS", "INHERITS"}:
            out_deg[e["source"]] += 1
            in_deg[e["target"]] += 1
            adj.setdefault(e["source"], []).append(e["target"])

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


def _safe_id(raw: str, idx: int) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", raw)
    return f"n{idx}_{cleaned[:24]}"


def generate_flowchart(repo_id: str, graph: dict) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        raise ValueError(f"No mapped code found for '{repo_id}'. Map the repository first.")

    dep_edges = [e for e in edges if e["kind"] in {"CALLS", "IMPORTS", "INHERITS"}]
    if not dep_edges:
        dep_edges = [e for e in edges if e["kind"] == "CONTAINS"]

    by_id = {n["node_id"]: n for n in nodes}
    deg: Counter[str] = Counter()
    for e in dep_edges:
        deg[e["source"]] += 1
        deg[e["target"]] += 1

    # Prioritize connected non-method symbols/files up to 20 nodes for a clean readable diagram
    ranked_ids = [
        nid for nid, _ in deg.most_common(40) if nid in by_id and by_id[nid]["kind"] in {"File", "Class", "Interface", "Function"}
    ][:20]
    if not ranked_ids:
        ranked_ids = [n["node_id"] for n in nodes[:16]]

    keep = set(ranked_ids)
    kept_edges = [e for e in dep_edges if e["source"] in keep and e["target"] in keep][:32]
    id_map = {nid: _safe_id(by_id[nid]["name"], i) for i, nid in enumerate(ranked_ids)}

    # Compute topological layer (0..4) for left-to-right flow
    in_adj: dict[str, list[str]] = {nid: [] for nid in ranked_ids}
    for e in kept_edges:
        in_adj.setdefault(e["target"], []).append(e["source"])

    layer_cache: dict[str, int] = {}

    def _layer(nid: str, visiting: set[str]) -> int:
        if nid in layer_cache:
            return layer_cache[nid]
        if nid in visiting:
            return 0
        visiting.add(nid)
        preds = [p for p in in_adj.get(nid, ()) if p != nid]
        lvl = (max((_layer(p, visiting) for p in preds), default=-1) + 1) if preds else 0
        visiting.remove(nid)
        layer_cache[nid] = min(lvl, 4)
        return layer_cache[nid]

    for nid in ranked_ids:
        _layer(nid, set())

    out_nodes = [
        {
            "id": id_map[nid],
            "node_id": nid,
            "label": by_id[nid]["name"],
            "kind": by_id[nid]["kind"],
            "file_path": by_id[nid]["file_path"],
            "group": by_id[nid]["file_path"].split("/")[0] if "/" in by_id[nid]["file_path"] else "root",
            "layer": layer_cache.get(nid, 0),
        }
        for nid in ranked_ids
    ]

    out_edges = [
        {
            "source": id_map[e["source"]],
            "target": id_map[e["target"]],
            "kind": e["kind"],
            "label": e["kind"].lower(),
        }
        for e in kept_edges
        if e["source"] in id_map and e["target"] in id_map and e["source"] != e["target"]
    ]

    lines = ["flowchart LR"]
    groups: dict[str, list[dict]] = {}
    for n in out_nodes:
        groups.setdefault(n["group"], []).append(n)
    for grp, grp_nodes in groups.items():
        safe_grp = re.sub(r"[^a-zA-Z0-9_]", "_", grp)
        lines.append(f'  subgraph sg_{safe_grp}["{grp}"]')
        for n in grp_nodes:
            safe_lbl = n["label"].replace('"', "'")
            lines.append(f'    {n["id"]}["{safe_lbl}"]')
        lines.append("  end")
    for e in out_edges:
        lines.append(f'  {e["source"]} -->|{e["label"]}| {e["target"]}')

    return {"repo_id": repo_id, "mermaid": "\n".join(lines), "nodes": out_nodes, "edges": out_edges}
