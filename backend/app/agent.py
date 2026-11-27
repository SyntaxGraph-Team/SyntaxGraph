import asyncio
from typing import TypedDict

from google import genai
from langgraph.graph import END, START, StateGraph

from .config import get_settings
from .stores import GraphVectorStore


class AgentState(TypedDict):
    repo_id: str
    query: str
    top_k: int
    intent: str
    vector_hits: list[dict]
    graph_context: dict
    answer: str
    citations: list[dict]
    trace: list[str]


def _classify_intent(query: str) -> str:
    q = query.lower()
    if any(k in q for k in ("bug", "error", "fail", "crash", "fix", "issue", "why", "broken")):
        return "BUG_LOCALIZATION"
    if any(k in q for k in ("call", "trace", "flow", "depend", "import", "inherit", "impact", "cross-file", "how does")):
        return "CROSS_FILE_DEPENDENCY_TRACE"
    return "LOCAL_SYMBOL_LOOKUP"


def build_agent(store: GraphVectorStore, use_llm: bool = True):
    s = get_settings()
    client = genai.Client(api_key=s.gemini_api_key) if (use_llm and s.gemini_api_key) else None

    async def route_node(state: AgentState) -> dict:
        intent = _classify_intent(state["query"])
        return {"intent": intent, "trace": [f"[Agent:Router] Intent = {intent}"]}

    async def vector_node(state: AgentState) -> dict:
        hits = await store.vector_search(state["repo_id"], state["query"], top_k=state["top_k"])
        return {
            "vector_hits": hits,
            "trace": state["trace"] + [f"[Tool:Qdrant] Top-{len(hits)} semantic chunks retrieved"],
        }

    async def graph_node(state: AgentState) -> dict:
        seeds = [h["node_id"] for h in state["vector_hits"]]
        hops = 2 if state["intent"] != "LOCAL_SYMBOL_LOOKUP" else 1
        subgraph = await store.graph_neighbors(state["repo_id"], seeds, hops=hops, limit=25)
        return {
            "graph_context": subgraph,
            "trace": state["trace"]
            + [f"[Tool:Neo4j] {hops}-hop neighborhood ({len(subgraph['nodes'])} nodes, {len(subgraph['edges'])} edges)"],
        }

    async def synthesize_node(state: AgentState) -> dict:
        nodes = state["graph_context"].get("nodes", [])
        edges = state["graph_context"].get("edges", [])
        seen: set[str] = set()
        citations: list[dict] = []
        for item in [*state["vector_hits"], *nodes]:
            key = f"{item['file_path']}:{item['start_line']}-{item['end_line']}"
            if key not in seen:
                seen.add(key)
                citations.append(
                    {
                        "node_id": item["node_id"],
                        "name": item["name"],
                        "kind": item["kind"],
                        "file_path": item["file_path"],
                        "start_line": item["start_line"],
                        "end_line": item["end_line"],
                    }
                )

        if client is None:
            edge_lines = [f"- {e['source'].split(':')[-2]} -[{e['kind']}]-> {e['target'].split(':')[-2]}" for e in edges[:12]]
            cit_lines = [f"- `{c['file_path']}:{c['start_line']}-{c['end_line']}` ({c['kind']} `{c['name']}`)" for c in citations[:8]]
            answer = (
                f"**Intent:** `{state['intent']}`\n\n"
                f"**Relevant Symbols & Files:**\n" + ("\n".join(cit_lines) or "- None") + "\n\n"
                f"**AST Dependency Path:**\n" + ("\n".join(edge_lines) or "- Direct symbol match (no cross-file hops)")
            )
            return {"answer": answer, "citations": citations[:10], "trace": state["trace"] + ["[Synthesizer] Deterministic AST summary"]}

        ctx_blocks = [
            f"[{n['kind']}] {n['name']} @ {n['file_path']}:{n['start_line']}-{n['end_line']}\n{n.get('raw_code', '')[:600]}"
            for n in nodes[:12]
        ]
        edge_blocks = [f"{e['source']} -[{e['kind']}]-> {e['target']}" for e in edges[:20]]
        prompt = (
            "You are SyntaxGraph, a codebase intelligence assistant. Answer strictly from the AST nodes and graph edges below. "
            "Cite exact file_path:start_line-end_line and never invent symbols not present in context.\n\n"
            f"Query: {state['query']}\nIntent: {state['intent']}\n\n"
            "AST Nodes:\n" + "\n---\n".join(ctx_blocks) + "\n\n"
            "Graph Edges:\n" + "\n".join(edge_blocks)
        )

        def _gen() -> str:
            return client.models.generate_content(model=s.gemini_model, contents=prompt).text or ""

        answer = await asyncio.to_thread(_gen)
        return {
            "answer": answer,
            "citations": citations[:10],
            "trace": state["trace"] + [f"[{s.gemini_model}] Synthesized grounded file-level answer"],
        }

    wf = StateGraph(AgentState)
    wf.add_node("route", route_node)
    wf.add_node("vector_retrieve", vector_node)
    wf.add_node("graph_traverse", graph_node)
    wf.add_node("synthesize", synthesize_node)

    wf.add_edge(START, "route")
    wf.add_edge("route", "vector_retrieve")
    wf.add_edge("vector_retrieve", "graph_traverse")
    wf.add_edge("graph_traverse", "synthesize")
    wf.add_edge("synthesize", END)
    return wf.compile()
