import asyncio
import hashlib
import math
import re
import uuid
from collections import defaultdict
from dataclasses import asdict
from typing import Protocol

from google import genai
from neo4j import AsyncGraphDatabase, AsyncDriver
from qdrant_client import AsyncQdrantClient, models as qmodels

from .config import get_settings
from .models import ASTEdge, ASTNode


def _point_id(node_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, node_id))


def _embed_text_payload(n: ASTNode) -> str:
    return f"{n.kind} {n.name} ({n.file_path}:{n.start_line}-{n.end_line})\n{n.signature}\n{n.docstring}\n{n.raw_code[:1200]}"


def _hash_embed(text: str, dim: int = 256) -> list[float]:
    vec = [0.0] * dim
    for raw_tok in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text):
        parts = [raw_tok.lower()] + [p.lower() for p in re.sub(r"([a-z])([A-Z])", r"\1_\2", raw_tok).split("_") if p]
        for tok in parts:
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            vec[h % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


class GraphVectorStore(Protocol):
    async def init(self) -> None: ...
    async def upsert(self, nodes: list[ASTNode], edges: list[ASTEdge]) -> None: ...
    async def delete_files(self, repo_id: str, file_paths: list[str]) -> None: ...
    async def vector_search(self, repo_id: str, query: str, top_k: int = 5) -> list[dict]: ...
    async def graph_neighbors(self, repo_id: str, seed_ids: list[str], hops: int = 2, limit: int = 25) -> dict: ...
    async def get_repo_graph(self, repo_id: str, limit: int = 250) -> dict: ...
    async def list_repos(self) -> list[dict]: ...
    async def delete_repo(self, repo_id: str) -> None: ...
    async def get_node(self, repo_id: str, node_id: str) -> dict | None: ...
    async def shortest_path(self, repo_id: str, source_name: str, target_name: str) -> dict: ...


class DualHybridStore:
    def __init__(self) -> None:
        s = get_settings()
        self._neo4j: AsyncDriver = AsyncGraphDatabase.driver(s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password))
        self._qdrant = AsyncQdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key or None, check_compatibility=False)
        self._collection = s.qdrant_collection
        self._embed_model = "gemini-embedding-001" if s.gemini_embed_model == "text-embedding-004" else (s.gemini_embed_model or "gemini-embedding-001")
        self._genai = genai.Client(api_key=s.gemini_api_key) if s.gemini_api_key else None
        self._dim: int | None = None

    async def close(self) -> None:
        await self._neo4j.close()
        await self._qdrant.close()

    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if not self._genai:
            return [_hash_embed(t) for t in texts]

        def _call(chunk: list[str]) -> list[list[float]]:
            try:
                resp = self._genai.models.embed_content(model=self._embed_model, contents=chunk)
            except Exception as exc:
                if "NOT_FOUND" in str(exc) or "404" in str(exc):
                    self._embed_model = "gemini-embedding-001"
                    resp = self._genai.models.embed_content(model=self._embed_model, contents=chunk)
                else:
                    raise
            return [e.values for e in resp.embeddings]

        vectors: list[list[float]] = []
        for i in range(0, len(texts), 50):
            vectors.extend(await asyncio.to_thread(_call, texts[i : i + 50]))
        return vectors

    async def _ensure_qdrant(self, dim: int) -> None:
        if self._dim == dim:
            return
        exists = await self._qdrant.collection_exists(self._collection)
        if not exists:
            await self._qdrant.create_collection(
                collection_name=self._collection,
                vectors_config=qmodels.VectorParams(size=dim, distance=qmodels.Distance.COSINE),
            )
            await self._qdrant.create_payload_index(self._collection, "repo_id", qmodels.PayloadSchemaType.KEYWORD)
            await self._qdrant.create_payload_index(self._collection, "file_path", qmodels.PayloadSchemaType.KEYWORD)
        self._dim = dim

    async def init(self) -> None:
        async with self._neo4j.session() as sess:
            await sess.run("CREATE CONSTRAINT ast_node_id IF NOT EXISTS FOR (n:ASTNode) REQUIRE n.node_id IS UNIQUE")
            await sess.run("CREATE INDEX ast_repo_file IF NOT EXISTS FOR (n:ASTNode) ON (n.repo_id, n.file_path)")
            await sess.run("CREATE INDEX ast_repo_name IF NOT EXISTS FOR (n:ASTNode) ON (n.repo_id, n.name)")

    async def upsert(self, nodes: list[ASTNode], edges: list[ASTEdge]) -> None:
        if not nodes:
            return
        async with self._neo4j.session() as sess:
            for i in range(0, len(nodes), 500):
                batch = [asdict(n) for n in nodes[i : i + 500]]
                await sess.run(
                    """
                    UNWIND $rows AS r
                    MERGE (n:ASTNode {node_id: r.node_id})
                    SET n.repo_id = r.repo_id, n.kind = r.kind, n.name = r.name,
                        n.file_path = r.file_path, n.start_line = r.start_line,
                        n.end_line = r.end_line, n.signature = r.signature,
                        n.docstring = r.docstring, n.raw_code = r.raw_code
                    """,
                    rows=batch,
                )
            by_kind: dict[str, list[dict]] = defaultdict(list)
            for e in edges:
                by_kind[e.kind].append({"src": e.source_id, "tgt": e.target_id, "repo_id": e.repo_id})
            for kind, rows in by_kind.items():
                for i in range(0, len(rows), 500):
                    await sess.run(
                        f"""
                        UNWIND $rows AS r
                        MATCH (a:ASTNode {{node_id: r.src}}), (b:ASTNode {{node_id: r.tgt}})
                        MERGE (a)-[:{kind} {{repo_id: r.repo_id}}]->(b)
                        """,
                        rows=rows[i : i + 500],
                    )

        embed_nodes = [n for n in nodes if n.kind != "File" or n.raw_code]
        vectors = await self._embed_batch([_embed_text_payload(n) for n in embed_nodes])
        if vectors:
            await self._ensure_qdrant(len(vectors[0]))
            points = [
                qmodels.PointStruct(
                    id=_point_id(n.node_id),
                    vector=vec,
                    payload={
                        "node_id": n.node_id,
                        "repo_id": n.repo_id,
                        "kind": n.kind,
                        "name": n.name,
                        "file_path": n.file_path,
                        "start_line": n.start_line,
                        "end_line": n.end_line,
                        "signature": n.signature,
                        "raw_code": n.raw_code[:1200],
                    },
                )
                for n, vec in zip(embed_nodes, vectors)
            ]
            for i in range(0, len(points), 200):
                await self._qdrant.upsert(collection_name=self._collection, points=points[i : i + 200])

    async def delete_files(self, repo_id: str, file_paths: list[str]) -> None:
        if not file_paths:
            return
        async with self._neo4j.session() as sess:
            await sess.run(
                "MATCH (n:ASTNode {repo_id: $repo_id}) WHERE n.file_path IN $paths DETACH DELETE n",
                repo_id=repo_id,
                paths=file_paths,
            )
        if await self._qdrant.collection_exists(self._collection):
            await self._qdrant.delete(
                collection_name=self._collection,
                points_selector=qmodels.FilterSelector(
                    filter=qmodels.Filter(
                        must=[
                            qmodels.FieldCondition(key="repo_id", match=qmodels.MatchValue(value=repo_id)),
                            qmodels.FieldCondition(key="file_path", match=qmodels.MatchAny(any=file_paths)),
                        ]
                    )
                ),
            )

    async def vector_search(self, repo_id: str, query: str, top_k: int = 5) -> list[dict]:
        if not await self._qdrant.collection_exists(self._collection):
            return []
        [qvec] = await self._embed_batch([query])
        res = await self._qdrant.query_points(
            collection_name=self._collection,
            query=qvec,
            limit=top_k,
            query_filter=qmodels.Filter(
                must=[qmodels.FieldCondition(key="repo_id", match=qmodels.MatchValue(value=repo_id))]
            ),
        )
        return [{**p.payload, "score": round(float(p.score), 4)} for p in res.points if p.payload]

    async def graph_neighbors(self, repo_id: str, seed_ids: list[str], hops: int = 2, limit: int = 25) -> dict:
        if not seed_ids:
            return {"nodes": [], "edges": []}
        hops = max(1, min(hops, 3))
        async with self._neo4j.session() as sess:
            n_res = await sess.run(
                f"""
                MATCH (s:ASTNode {{repo_id: $repo_id}}) WHERE s.node_id IN $seeds
                OPTIONAL MATCH (s)-[:CALLS|IMPORTS|INHERITS|CONTAINS*1..{hops}]-(t:ASTNode {{repo_id: $repo_id}})
                WITH collect(DISTINCT s) + collect(DISTINCT t) AS all_n
                UNWIND all_n AS n
                WITH DISTINCT n LIMIT $limit
                RETURN n.node_id AS node_id, n.kind AS kind, n.name AS name,
                       n.file_path AS file_path, n.start_line AS start_line,
                       n.end_line AS end_line, n.signature AS signature,
                       left(n.raw_code, 800) AS raw_code
                """,
                repo_id=repo_id,
                seeds=seed_ids,
                limit=limit,
            )
            nodes = [dict(r) async for r in n_res]
            ids = [n["node_id"] for n in nodes]
            e_res = await sess.run(
                """
                MATCH (a:ASTNode {repo_id: $repo_id})-[r]->(b:ASTNode {repo_id: $repo_id})
                WHERE a.node_id IN $ids AND b.node_id IN $ids
                RETURN DISTINCT a.node_id AS source, b.node_id AS target, type(r) AS kind
                """,
                repo_id=repo_id,
                ids=ids,
            )
            edges = [dict(r) async for r in e_res]
            return {"nodes": nodes, "edges": edges}

    async def list_repos(self) -> list[dict]:
        async with self._neo4j.session() as sess:
            res = await sess.run(
                """
                MATCH (n:ASTNode)
                RETURN n.repo_id AS repo_id,
                       count(n) AS nodes,
                       count(CASE WHEN n.kind = 'File' THEN 1 END) AS files
                ORDER BY nodes DESC
                """
            )
            return [dict(r) async for r in res]

    async def delete_repo(self, repo_id: str) -> None:
        async with self._neo4j.session() as sess:
            await sess.run("MATCH (n:ASTNode {repo_id: $repo_id}) DETACH DELETE n", repo_id=repo_id)
        if await self._qdrant.collection_exists(self._collection):
            await self._qdrant.delete(
                collection_name=self._collection,
                points_selector=qmodels.FilterSelector(
                    filter=qmodels.Filter(must=[qmodels.FieldCondition(key="repo_id", match=qmodels.MatchValue(value=repo_id))])
                ),
            )

    async def get_node(self, repo_id: str, node_id: str) -> dict | None:
        async with self._neo4j.session() as sess:
            res = await sess.run(
                """
                MATCH (n:ASTNode {repo_id: $repo_id, node_id: $node_id})
                RETURN n.node_id AS node_id, n.kind AS kind, n.name AS name,
                       n.file_path AS file_path, n.start_line AS start_line,
                       n.end_line AS end_line, n.signature AS signature,
                       n.docstring AS docstring, n.raw_code AS raw_code
                """,
                repo_id=repo_id,
                node_id=node_id,
            )
            rec = await res.single()
            return dict(rec) if rec else None

    async def shortest_path(self, repo_id: str, source_name: str, target_name: str) -> dict:
        async with self._neo4j.session() as sess:
            res = await sess.run(
                """
                MATCH (a:ASTNode {repo_id: $repo_id}), (b:ASTNode {repo_id: $repo_id})
                WHERE toLower(a.name) = toLower($src) AND toLower(b.name) = toLower($tgt) AND a.node_id <> b.node_id
                MATCH p = shortestPath((a)-[:CALLS|IMPORTS|INHERITS|CONTAINS*1..6]->(b))
                RETURN [n IN nodes(p) | {node_id: n.node_id, name: n.name, kind: n.kind, file_path: n.file_path, start_line: n.start_line}] AS nodes,
                       [r IN relationships(p) | {source: startNode(r).node_id, target: endNode(r).node_id, kind: type(r)}] AS edges
                LIMIT 1
                """,
                repo_id=repo_id,
                src=source_name,
                tgt=target_name,
            )
            rec = await res.single()
            return {"nodes": rec["nodes"], "edges": rec["edges"]} if rec else {"nodes": [], "edges": []}

    async def get_repo_graph(self, repo_id: str, limit: int = 250) -> dict:
        async with self._neo4j.session() as sess:
            n_res = await sess.run(
                """
                MATCH (n:ASTNode {repo_id: $repo_id})
                RETURN n.node_id AS node_id, n.kind AS kind, n.name AS name,
                       n.file_path AS file_path, n.start_line AS start_line,
                       n.end_line AS end_line, n.signature AS signature
                LIMIT $limit
                """,
                repo_id=repo_id,
                limit=limit,
            )
            nodes = [dict(r) async for r in n_res]
            ids = [n["node_id"] for n in nodes]
            e_res = await sess.run(
                """
                MATCH (a:ASTNode {repo_id: $repo_id})-[r]->(b:ASTNode {repo_id: $repo_id})
                WHERE a.node_id IN $ids AND b.node_id IN $ids
                RETURN a.node_id AS source, b.node_id AS target, type(r) AS kind
                """,
                repo_id=repo_id,
                ids=ids,
            )
            edges = [dict(r) async for r in e_res]
            return {"nodes": nodes, "edges": edges}

    async def list_repos(self) -> list[dict]:
        async with self._neo4j.session() as sess:
            res = await sess.run(
                """
                MATCH (n:ASTNode)
                RETURN n.repo_id AS repo_id,
                       count(n) AS nodes,
                       count(CASE WHEN n.kind = 'File' THEN 1 END) AS files
                ORDER BY nodes DESC
                """
            )
            return [dict(r) async for r in res]

    async def delete_repo(self, repo_id: str) -> None:
        async with self._neo4j.session() as sess:
            await sess.run("MATCH (n:ASTNode {repo_id: $repo_id}) DETACH DELETE n", repo_id=repo_id)
        if await self._qdrant.collection_exists(self._collection):
            await self._qdrant.delete(
                collection_name=self._collection,
                points_selector=qmodels.FilterSelector(
                    filter=qmodels.Filter(must=[qmodels.FieldCondition(key="repo_id", match=qmodels.MatchValue(value=repo_id))])
                ),
            )

    async def get_node(self, repo_id: str, node_id: str) -> dict | None:
        async with self._neo4j.session() as sess:
            res = await sess.run(
                """
                MATCH (n:ASTNode {repo_id: $repo_id, node_id: $node_id})
                RETURN n.node_id AS node_id, n.kind AS kind, n.name AS name,
                       n.file_path AS file_path, n.start_line AS start_line,
                       n.end_line AS end_line, n.signature AS signature,
                       n.docstring AS docstring, n.raw_code AS raw_code
                """,
                repo_id=repo_id,
                node_id=node_id,
            )
            rec = await res.single()
            return dict(rec) if rec else None

    async def shortest_path(self, repo_id: str, source_name: str, target_name: str) -> dict:
        async with self._neo4j.session() as sess:
            res = await sess.run(
                """
                MATCH (a:ASTNode {repo_id: $repo_id}), (b:ASTNode {repo_id: $repo_id})
                WHERE toLower(a.name) = toLower($src) AND toLower(b.name) = toLower($tgt) AND a.node_id <> b.node_id
                MATCH p = shortestPath((a)-[:CALLS|IMPORTS|INHERITS|CONTAINS*1..6]->(b))
                RETURN [n IN nodes(p) | {node_id: n.node_id, name: n.name, kind: n.kind, file_path: n.file_path, start_line: n.start_line}] AS nodes,
                       [r IN relationships(p) | {source: startNode(r).node_id, target: endNode(r).node_id, kind: type(r)}] AS edges
                LIMIT 1
                """,
                repo_id=repo_id,
                src=source_name,
                tgt=target_name,
            )
            rec = await res.single()
            return {"nodes": rec["nodes"], "edges": rec["edges"]} if rec else {"nodes": [], "edges": []}


class InMemoryHybridStore:
    def __init__(self) -> None:
        self.nodes: dict[str, ASTNode] = {}
        self.edges: list[ASTEdge] = []
        self.vectors: dict[str, list[float]] = {}

    async def init(self) -> None:
        pass

    async def upsert(self, nodes: list[ASTNode], edges: list[ASTEdge]) -> None:
        for n in nodes:
            self.nodes[n.node_id] = n
            self.vectors[n.node_id] = _hash_embed(_embed_text_payload(n))
        existing = {(e.source_id, e.target_id, e.kind) for e in self.edges}
        for e in edges:
            if (e.source_id, e.target_id, e.kind) not in existing:
                existing.add((e.source_id, e.target_id, e.kind))
                self.edges.append(e)

    async def delete_files(self, repo_id: str, file_paths: list[str]) -> None:
        path_set = set(file_paths)
        removed = {nid for nid, n in self.nodes.items() if n.repo_id == repo_id and n.file_path in path_set}
        for nid in removed:
            self.nodes.pop(nid, None)
            self.vectors.pop(nid, None)
        self.edges = [e for e in self.edges if e.source_id not in removed and e.target_id not in removed]

    async def vector_search(self, repo_id: str, query: str, top_k: int = 5) -> list[dict]:
        qvec = _hash_embed(query)
        scored: list[tuple[float, ASTNode]] = []
        for nid, n in self.nodes.items():
            if n.repo_id == repo_id:
                scored.append((_cosine(qvec, self.vectors[nid]), n))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "node_id": n.node_id,
                "repo_id": n.repo_id,
                "kind": n.kind,
                "name": n.name,
                "file_path": n.file_path,
                "start_line": n.start_line,
                "end_line": n.end_line,
                "signature": n.signature,
                "raw_code": n.raw_code[:1200],
                "score": round(score, 4),
            }
            for score, n in scored[:top_k]
        ]

    async def graph_neighbors(self, repo_id: str, seed_ids: list[str], hops: int = 2, limit: int = 25) -> dict:
        adj: dict[str, list[tuple[str, str, bool]]] = defaultdict(list)
        for e in self.edges:
            if e.repo_id == repo_id:
                adj[e.source_id].append((e.target_id, e.kind, True))
                adj[e.target_id].append((e.source_id, e.kind, False))

        visited = set(seed_ids)
        frontier = list(seed_ids)
        out_edges: list[dict] = []
        seen_e: set[tuple[str, str, str]] = set()

        for _ in range(hops):
            nxt: list[str] = []
            for cur in frontier:
                for nb, kind, forward in adj.get(cur, ()):
                    src, tgt = (cur, nb) if forward else (nb, cur)
                    if (src, tgt, kind) not in seen_e:
                        seen_e.add((src, tgt, kind))
                        out_edges.append({"source": src, "target": tgt, "kind": kind})
                    if nb not in visited and len(visited) < limit:
                        visited.add(nb)
                        nxt.append(nb)
            frontier = nxt

        out_nodes = [
            {
                "node_id": n.node_id,
                "kind": n.kind,
                "name": n.name,
                "file_path": n.file_path,
                "start_line": n.start_line,
                "end_line": n.end_line,
                "signature": n.signature,
                "raw_code": n.raw_code[:800],
            }
            for nid in visited
            if (n := self.nodes.get(nid)) is not None
        ]
        return {"nodes": out_nodes, "edges": out_edges}

    async def get_repo_graph(self, repo_id: str, limit: int = 250) -> dict:
        nodes = [
            {
                "node_id": n.node_id,
                "kind": n.kind,
                "name": n.name,
                "file_path": n.file_path,
                "start_line": n.start_line,
                "end_line": n.end_line,
                "signature": n.signature,
            }
            for n in self.nodes.values()
            if n.repo_id == repo_id
        ][:limit]
        ids = {n["node_id"] for n in nodes}
        edges = [
            {"source": e.source_id, "target": e.target_id, "kind": e.kind}
            for e in self.edges
            if e.repo_id == repo_id and e.source_id in ids and e.target_id in ids
        ]
        return {"nodes": nodes, "edges": edges}

    async def list_repos(self) -> list[dict]:
        counts: dict[str, dict[str, int]] = defaultdict(lambda: {"nodes": 0, "files": 0})
        for n in self.nodes.values():
            counts[n.repo_id]["nodes"] += 1
            if n.kind == "File":
                counts[n.repo_id]["files"] += 1
        return [{"repo_id": rid, **c} for rid, c in sorted(counts.items(), key=lambda x: x[1]["nodes"], reverse=True)]

    async def delete_repo(self, repo_id: str) -> None:
        removed = {nid for nid, n in self.nodes.items() if n.repo_id == repo_id}
        for nid in removed:
            self.nodes.pop(nid, None)
            self.vectors.pop(nid, None)
        self.edges = [e for e in self.edges if e.repo_id != repo_id]

    async def get_node(self, repo_id: str, node_id: str) -> dict | None:
        n = self.nodes.get(node_id)
        if not n or n.repo_id != repo_id:
            return None
        return asdict(n)

    async def shortest_path(self, repo_id: str, source_name: str, target_name: str) -> dict:
        src_ids = [n.node_id for n in self.nodes.values() if n.repo_id == repo_id and n.name.lower() == source_name.lower()]
        tgt_ids = {n.node_id for n in self.nodes.values() if n.repo_id == repo_id and n.name.lower() == target_name.lower()}
        if not src_ids or not tgt_ids:
            return {"nodes": [], "edges": []}

        adj: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for e in self.edges:
            if e.repo_id == repo_id:
                adj[e.source_id].append((e.target_id, e.kind))

        queue: list[tuple[str, list[str], list[dict]]] = [(sid, [sid], []) for sid in src_ids]
        visited = set(src_ids)
        while queue:
            cur, path_n, path_e = queue.pop(0)
            if cur in tgt_ids and len(path_n) > 1:
                nodes = [
                    {
                        "node_id": self.nodes[nid].node_id,
                        "name": self.nodes[nid].name,
                        "kind": self.nodes[nid].kind,
                        "file_path": self.nodes[nid].file_path,
                        "start_line": self.nodes[nid].start_line,
                    }
                    for nid in path_n
                ]
                return {"nodes": nodes, "edges": path_e}
            if len(path_n) >= 7:
                continue
            for nxt, kind in adj.get(cur, ()):
                if nxt not in visited:
                    visited.add(nxt)
                    queue.append((nxt, [*path_n, nxt], [*path_e, {"source": cur, "target": nxt, "kind": kind}]))
        return {"nodes": [], "edges": []}
