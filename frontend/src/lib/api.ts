const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export interface GraphData {
  nodes: Array<{ node_id: string; kind: string; name: string; file_path: string; start_line: number; end_line: number; signature?: string }>;
  edges: Array<{ source: string; target: string; kind: string }>;
}

export interface QueryResult {
  intent: string;
  answer: string;
  citations: Array<{ node_id: string; name: string; kind: string; file_path: string; start_line: number; end_line: number }>;
  subgraph: GraphData;
  trace: string[];
}

export interface EvalResult {
  summary: Array<{ metric: string; baseline_vector_rag: string; proposed_syntaxgraph: string; improvement: string }>;
  graph_stats: { files: number; nodes: number; edges: number };
  cases: Array<{ category: string; query: string; baseline_recall: number; syntaxgraph_recall: number; syntaxgraph_edge_acc: number }>;
}

export const api = {
  health: () => req<{ status: string; store_mode: string; llm_configured: boolean }>("/health"),
  ingest: (repo_url: string, repo_id?: string, token?: string) =>
    req<{ repo_id: string; files_parsed: number; nodes_indexed: number; edges_indexed: number; latency_ms: number }>(
      "/api/repos/ingest",
      { method: "POST", body: JSON.stringify({ repo_url, repo_id: repo_id || null }) },
      token
    ),
  graph: (repo_id: string, token?: string) => req<GraphData>(`/api/repos/${encodeURIComponent(repo_id)}/graph`, {}, token),
  query: (repo_id: string, query: string, token?: string) =>
    req<QueryResult>("/api/query", { method: "POST", body: JSON.stringify({ repo_id, query }) }, token),
  eval: (use_live_stores = false, use_llm = false, token?: string) =>
    req<EvalResult>("/api/eval/run", { method: "POST", body: JSON.stringify({ use_live_stores, use_llm }) }, token),
};
