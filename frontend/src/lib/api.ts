const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, options: RequestInit = {}, token?: string, githubToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (githubToken) headers["X-GitHub-Token"] = githubToken;

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

export interface NodeDetail extends ASTNodeItem {
  docstring?: string;
  raw_code?: string;
}

export interface RepoInfo {
  repo_id: string;
  nodes: number;
  files: number;
}

export interface GitHubUserRepo {
  name: string;
  full_name: string;
  url: string;
  private: boolean;
  language: string;
  updated_at: string;
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

export interface AuditResult {
  repo_id: string;
  cycles: string[][];
  orphan_symbols: Array<{ node_id: string; name: string; kind: string; file_path: string; start_line: number }>;
  hotspots: Array<{ node_id: string; name: string; kind: string; file_path: string; fan_in: number; fan_out: number }>;
}

export interface FlowchartResult {
  repo_id: string;
  mermaid: string;
  nodes: Array<{ id: string; node_id: string; label: string; kind: string; file_path: string; group: string; layer: number }>;
  edges: Array<{ source: string; target: string; kind: string; label: string }>;
}

export interface GitHubSummaryResult {
  repo: string;
  kind: "commits" | "prs";
  items: Array<{ id: string; title: string; author: string; state: string; date: string; url: string; body: string }>;
  summary: string;
}

export const api = {
  health: () => req<{ status: string; store_mode: string; llm_configured: boolean }>("/health"),
  listRepos: (token?: string) => req<{ repos: RepoInfo[] }>("/api/repos", {}, token),
  listGithubRepos: (token?: string, githubToken?: string, githubUid?: string) => {
    const q = githubUid ? `?github_uid=${encodeURIComponent(githubUid)}` : "";
    return req<{ repos: GitHubUserRepo[] }>(`/api/github/repos${q}`, {}, token, githubToken);
  },
  deleteRepo: (repo_id: string, token?: string) =>
    req<{ deleted: string }>(`/api/repos/${encodeURIComponent(repo_id)}`, { method: "DELETE" }, token),
  ingest: (repo_url: string, repo_id?: string, token?: string, githubToken?: string) =>
    req<{ repo_id: string; files_parsed: number; nodes_indexed: number; edges_indexed: number; latency_ms: number }>(
      "/api/repos/ingest",
      { method: "POST", body: JSON.stringify({ repo_url, repo_id: repo_id || null }) },
      token,
      githubToken
    ),
  graph: (repo_id: string, token?: string) => req<GraphData>(`/api/repos/${encodeURIComponent(repo_id)}/graph`, {}, token),
  nodeDetail: (repo_id: string, node_id: string, token?: string) =>
    req<NodeDetail>(`/api/repos/${encodeURIComponent(repo_id)}/node?node_id=${encodeURIComponent(node_id)}`, {}, token),
  impact: (repo_id: string, node_id: string, hops = 2, token?: string) =>
    req<GraphData>(`/api/repos/${encodeURIComponent(repo_id)}/impact?node_id=${encodeURIComponent(node_id)}&hops=${hops}`, {}, token),
  audit: (repo_id: string, token?: string) => req<AuditResult>(`/api/repos/${encodeURIComponent(repo_id)}/audit`, {}, token),
  flowchart: (repo_id: string, token?: string) => req<FlowchartResult>(`/api/repos/${encodeURIComponent(repo_id)}/flowchart`, {}, token),
  tracePath: (repo_id: string, source: string, target: string, token?: string) =>
    req<GraphData>(`/api/repos/${encodeURIComponent(repo_id)}/path?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`, {}, token),
  summarizeRepo: (repo_id: string, token?: string) =>
    req<RepoSummaryResult>(`/api/repos/${encodeURIComponent(repo_id)}/summarize`, { method: "POST" }, token),
  summarizeGithub: (repo_url: string, kind: "commits" | "prs", limit = 5, token?: string, githubToken?: string) =>
    req<GitHubSummaryResult>("/api/github/summarize", { method: "POST", body: JSON.stringify({ repo_url, kind, limit }) }, token, githubToken),
  query: (repo_id: string, query: string, token?: string) =>
    req<QueryResult>("/api/query", { method: "POST", body: JSON.stringify({ repo_id, query }) }, token),
  eval: (use_live_stores = false, use_llm = false, token?: string) =>
    req<EvalResult>("/api/eval/run", { method: "POST", body: JSON.stringify({ use_live_stores, use_llm }) }, token),
};
