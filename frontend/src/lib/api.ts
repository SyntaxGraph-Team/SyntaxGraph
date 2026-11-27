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

export interface ASTNodeItem {
  node_id: string;
  kind: string;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
  signature?: string;
}

export interface GraphData {
  nodes: ASTNodeItem[];
  edges: Array<{ source: string; target: string; kind: string }>;
}

export interface QueryResult {
  intent: string;
  answer: string;
  citations: ASTNodeItem[];
  subgraph: GraphData;
  trace: string[];
}

export interface EvalResult {
  summary: Array<{ metric: string; baseline_vector_rag: string; proposed_syntaxgraph: string; improvement: string }>;
  graph_stats: { files: number; nodes: number; edges: number };
  cases: Array<{ category: string; query: string; baseline_recall: number; syntaxgraph_recall: number; syntaxgraph_edge_acc: number }>;
}

export interface RepoSummaryResult {
  repo_id: string;
  kind_counts: Record<string, number>;
  edge_counts: Record<string, number>;
  hubs: Array<{ name: string; kind: string; file_path: string; degree: number }>;
  summary: string;
}

export interface GitHubSummaryResult {
  repo: string;
  kind: "commits" | "prs";
  items: Array<{ id: string; title: string; author: string; state: string; date: string; url: string; body: string }>;
  summary: string;
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
  impact: (repo_id: string, node_id: string, hops = 2, token?: string) =>
    req<GraphData>(`/api/repos/${encodeURIComponent(repo_id)}/impact?node_id=${encodeURIComponent(node_id)}&hops=${hops}`, {}, token),
  summarizeRepo: (repo_id: string, token?: string) =>
    req<RepoSummaryResult>(`/api/repos/${encodeURIComponent(repo_id)}/summarize`, { method: "POST" }, token),
  summarizeGithub: (repo_url: string, kind: "commits" | "prs", limit = 5, token?: string) =>
    req<GitHubSummaryResult>("/api/github/summarize", { method: "POST", body: JSON.stringify({ repo_url, kind, limit }) }, token),
  query: (repo_id: string, query: string, token?: string) =>
    req<QueryResult>("/api/query", { method: "POST", body: JSON.stringify({ repo_id, query }) }, token),
  eval: (use_live_stores = false, use_llm = false, token?: string) =>
    req<EvalResult>("/api/eval/run", { method: "POST", body: JSON.stringify({ use_live_stores, use_llm }) }, token),
};
