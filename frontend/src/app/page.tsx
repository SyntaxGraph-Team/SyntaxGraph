"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Copy, Download, ExternalLink, LogOut, Trash2, X } from "lucide-react";
import {
  api,
  type ASTNodeItem,
  type AuditResult,
  type EvalResult,
  type GitHubSummaryResult,
  type GraphData,
  type NodeDetail,
  type QueryResult,
  type RepoInfo,
  type RepoSummaryResult,
} from "@/lib/api";
import { firebaseConfigured, getFirebaseAuth, signOutUser } from "@/lib/firebase";
import { GraphView } from "@/components/GraphView";
import { LoginView } from "@/components/LoginView";
import { AboutSection } from "@/components/AboutSection";

type TabId = "explorer" | "chat" | "github" | "eval" | "about";

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: "explorer", label: "Code Map", hint: "Explore files & connections" },
  { id: "chat", label: "Ask AI", hint: "Plain-English Q&A" },
  { id: "github", label: "Updates", hint: "Commits & Pull Requests" },
  { id: "eval", label: "Benchmarks", hint: "Accuracy & speed" },
  { id: "about", label: "Team", hint: "SyntaxGraph Team" },
];

const SAMPLE_QUERIES = [
  "How do the main files connect to each other?",
  "Where are logins and security checks handled?",
  "Which functions depend on each other across files?",
];

const METRIC_LABELS: Record<string, { title: string; subtitle: string }> = {
  "Multi-Hop File Recall@K": { title: "Cross-File Accuracy", subtitle: "Finds all related files across folders" },
  "Cross-File Call Tracing Accuracy": { title: "Connection Tracing", subtitle: "Follows who calls whom accurately" },
  "Unresolved / Hallucination Rate": { title: "Wrong Symbol Rate", subtitle: "Lower means fewer made-up answers" },
  "Commit Re-Indexing Latency": { title: "Update Speed", subtitle: "Time to refresh after a code change" },
};

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pctValue(text: string): number {
  const m = text.match(/[\d.]+/);
  return m ? Math.min(100, Math.max(0, Number(m[0]))) : 0;
}

function RingGauge({ value, color }: { value: number; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg viewBox="0 0 88 88" className="h-20 w-20 shrink-0 -rotate-90">
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="animate-ring"
      />
    </svg>
  );
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [token, setToken] = useState<string | undefined>();
  const [health, setHealth] = useState<{ store_mode: string; llm_configured: boolean } | null>(null);
  const [tab, setTab] = useState<TabId>("explorer");

  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [repoUrl, setRepoUrl] = useState("https://github.com/SyntaxGraph-Team/SyntaxGraph");
  const [repoId, setRepoId] = useState("SyntaxGraph-Team_SyntaxGraph");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [subgraphOverlay, setSubgraphOverlay] = useState<{ label: string; data: GraphData } | null>(null);
  const [projectSummary, setProjectSummary] = useState<RepoSummaryResult | null>(null);
  const [auditRes, setAuditRes] = useState<AuditResult | null>(null);

  const [pathSrc, setPathSrc] = useState("");
  const [pathTgt, setPathTgt] = useState("");

  const [query, setQuery] = useState(SAMPLE_QUERIES[0]);
  const [queryRes, setQueryRes] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const [ghKind, setGhKind] = useState<"commits" | "prs">("commits");
  const [ghLimit, setGhLimit] = useState(5);
  const [ghRes, setGhRes] = useState<GitHubSummaryResult | null>(null);

  const [evalRes, setEvalRes] = useState<EvalResult | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => null);
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      const tok = u ? await u.getIdToken() : undefined;
      setToken(tok);
      setAuthReady(true);
      if (u) api.listRepos(tok).then((r) => setRepos(r.repos)).catch(() => null);
    });
  }, []);

  async function refreshRepos(tok = token) {
    try {
      const r = await api.listRepos(tok);
      setRepos(r.repos);
    } catch {
      // ignore
    }
  }

  async function runTask(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setStatus(`Something went wrong: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    runTask(async () => {
      setStatus("Reading repository files and mapping how they connect...");
      const res = await api.ingest(repoUrl.trim(), undefined, token);
      setRepoId(res.repo_id);
      setSelectedNode(null);
      setSubgraphOverlay(null);
      setAuditRes(null);
      setStatus(`Ready! Mapped ${res.files_parsed} files, ${res.nodes_indexed} code items, and ${res.edges_indexed} connections.`);
      setGraph(await api.graph(res.repo_id, token));
      await refreshRepos();
    });
  }

  function handleLoadGraph(targetId = repoId) {
    if (!targetId.trim()) return;
    setRepoId(targetId.trim());
    runTask(async () => {
      const g = await api.graph(targetId.trim(), token);
      setGraph(g);
      setSelectedNode(null);
      setSubgraphOverlay(null);
      setAuditRes(null);
      setStatus(`Opened ${targetId}: ${g.nodes.length} code items and ${g.edges.length} connections.`);
    });
  }

  function handleDeleteRepo(targetId: string) {
    runTask(async () => {
      await api.deleteRepo(targetId, token);
      await refreshRepos();
      if (repoId === targetId) setGraph({ nodes: [], edges: [] });
      setStatus(`Removed ${targetId}.`);
    });
  }

  function handleSelectNode(node: ASTNodeItem) {
    setSelectedNode(node);
    api.nodeDetail(repoId, node.node_id, token).then(setSelectedNode).catch(() => null);
  }

  function handleCopyCode(text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleSummarizeProject() {
    if (!repoId.trim()) return;
    runTask(async () => {
      setStatus("Writing plain-English project overview...");
      setProjectSummary(await api.summarizeRepo(repoId.trim(), token));
      setStatus("Project overview ready.");
    });
  }

  function handleAudit() {
    if (!repoId.trim()) return;
    runTask(async () => {
      setStatus("Checking project health for loops and unused code...");
      const res = await api.audit(repoId.trim(), token);
      setAuditRes(res);
      setStatus(`Health check complete: ${res.cycles.length} loops, ${res.orphan_symbols.length} unused items.`);
    });
  }

  function handleTracePath(e: React.FormEvent) {
    e.preventDefault();
    if (!pathSrc.trim() || !pathTgt.trim()) return;
    runTask(async () => {
      const res = await api.tracePath(repoId.trim(), pathSrc.trim(), pathTgt.trim(), token);
      if (!res.nodes.length) {
        setStatus(`No direct connection found from "${pathSrc}" to "${pathTgt}".`);
        return;
      }
      setSubgraphOverlay({ label: `Connection path: ${pathSrc} -> ${pathTgt}`, data: res });
      setStatus(`Found a ${res.nodes.length}-step path between those functions.`);
    });
  }

  function handleBlastRadius(node: ASTNodeItem) {
    runTask(async () => {
      const imp = await api.impact(repoId, node.node_id, 2, token);
      setSubgraphOverlay({ label: `Code connected to ${node.name} (${imp.nodes.length} items)`, data: imp });
      setStatus(`Showing ${imp.nodes.length} items connected to ${node.name}.`);
    });
  }

  function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    runTask(async () => {
      const res = await api.query(repoId, query, token);
      setQueryRes(res);
      setHistory((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, 5));
    });
  }

  function handleGithubSummary(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    runTask(async () => {
      setStatus(`Reading recent ${ghKind === "commits" ? "commits" : "pull requests"}...`);
      setGhRes(await api.summarizeGithub(repoUrl.trim(), ghKind, ghLimit, token));
      setStatus("");
    });
  }

  function handleEval() {
    runTask(async () => {
      setEvalRes(await api.eval(false, false, token));
    });
  }

  const activeGraph = subgraphOverlay ? subgraphOverlay.data : graph;
  const connectedEdges = selectedNode
    ? activeGraph.edges.filter((e) => e.source === selectedNode.node_id || e.target === selectedNode.node_id)
    : [];

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="aurora-bg" />
        <div className="glass rounded-2xl px-6 py-3.5 text-xs text-zinc-300">Signing you in...</div>
      </main>
    );
  }

  if (firebaseConfigured ? !user : !devUnlocked) {
    return (
      <>
        <div className="aurora-bg" />
        <div className="aurora-orb-1" />
        <div className="aurora-orb-2" />
        <LoginView
          onDemoEnter={() => {
            setDevUnlocked(true);
            refreshRepos();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="aurora-bg" />
      <div className="aurora-orb-1" />
      <div className="aurora-orb-2" />

      <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6">
        {/* Glass Command Header */}
        <header className="glass-strong relative mb-6 overflow-hidden rounded-3xl px-6 py-5">
          {busy && (
            <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-white/5">
              <div className="animate-shimmer h-full w-1/3 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-white">SyntaxGraph</h1>
                <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-0.5 font-mono text-[11px] text-amber-300">
                  {repoId}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                Understand any GitHub codebase in seconds — visual code maps, plain-English Q&amp;A, and update summaries.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {health && (
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-300">
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${health.store_mode === "neo4j+qdrant" ? "bg-emerald-400" : "bg-amber-400"}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${health.store_mode === "neo4j+qdrant" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  </span>
                  {health.store_mode === "neo4j+qdrant" ? "Cloud Engine Online" : "Local Mode"}
                </span>
              )}

              {firebaseConfigured && user ? (
                <button
                  onClick={signOutUser}
                  className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.08]"
                >
                  <span>{user.email || user.displayName}</span>
                  <LogOut className="h-3.5 w-3.5 text-zinc-400" />
                </button>
              ) : (
                <button
                  onClick={() => setDevUnlocked(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-zinc-300 hover:text-white"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>

          {/* Navigation Dock */}
          <nav className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
            {TABS.map(({ id, label, hint }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`group flex flex-col items-start rounded-2xl border px-4 py-2 text-left transition duration-200 ${
                    active
                      ? "border-amber-400/50 bg-gradient-to-br from-amber-400/20 to-amber-500/5 text-white shadow-sm"
                      : "border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:bg-white/[0.05] hover:text-zinc-100"
                  }`}
                >
                  <span className={`text-xs font-semibold ${active ? "text-amber-300" : ""}`}>{label}</span>
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400">{hint}</span>
                </button>
              );
            })}
          </nav>
        </header>

        {status && (
          <div className="glass animate-tab mb-5 flex items-center justify-between rounded-2xl border-amber-400/25 px-4 py-3 text-xs text-zinc-100">
            <span>{status}</span>
            <button onClick={() => setStatus("")} aria-label="Dismiss status" className="text-zinc-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex-1">
          {/* TAB 1: CODE MAP */}
          {tab === "explorer" && (
            <section key="explorer" className="animate-tab space-y-5">
              {/* Bento Top Row: Input + Telemetry */}
              <div className="grid gap-4 lg:grid-cols-12">
                <form onSubmit={handleIngest} className="glass-strong flex flex-col justify-between gap-3 rounded-3xl p-5 lg:col-span-8">
                  <div>
                    <div className="text-sm font-semibold text-white">Connect a GitHub Repository</div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Paste a repository link to map its files, classes, and functions — or pick a saved project below.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <input
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/45 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
                    />
                    <input
                      value={repoId}
                      onChange={(e) => setRepoId(e.target.value)}
                      placeholder="Project ID"
                      className="w-48 rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 font-mono text-xs text-zinc-300 outline-none focus:border-amber-400/60"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      className="rounded-xl bg-amber-400 px-5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50"
                    >
                      {busy ? "Working..." : "Analyze Repo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadGraph()}
                      disabled={busy}
                      className="rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.1]"
                    >
                      Open Saved
                    </button>
                    <button
                      type="button"
                      onClick={handleSummarizeProject}
                      disabled={busy}
                      className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-400/20"
                    >
                      Project Overview
                    </button>
                    <button
                      type="button"
                      onClick={handleAudit}
                      disabled={busy}
                      className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-400/20"
                    >
                      Health Check
                    </button>
                  </div>
                </form>

                {/* Live Stats Bento */}
                <div className="grid grid-cols-3 gap-3 lg:col-span-4 lg:grid-cols-1">
                  <div className="glass bento-hover flex items-center justify-between rounded-2xl px-5 py-3.5">
                    <div>
                      <div className="text-[11px] text-zinc-400">Code Items Mapped</div>
                      <div className="text-[10px] text-zinc-500">Files, classes, functions</div>
                    </div>
                    <div className="font-mono text-2xl font-semibold text-white">{activeGraph.nodes.length}</div>
                  </div>
                  <div className="glass bento-hover flex items-center justify-between rounded-2xl px-5 py-3.5">
                    <div>
                      <div className="text-[11px] text-zinc-400">Connections Found</div>
                      <div className="text-[10px] text-zinc-500">Calls, imports, inheritance</div>
                    </div>
                    <div className="font-mono text-2xl font-semibold text-amber-300">{activeGraph.edges.length}</div>
                  </div>
                  <div className="glass bento-hover flex items-center justify-between rounded-2xl px-5 py-3.5">
                    <div>
                      <div className="text-[11px] text-zinc-400">Saved Projects</div>
                      <div className="text-[10px] text-zinc-500">Ready to explore</div>
                    </div>
                    <div className="font-mono text-2xl font-semibold text-sky-300">{repos.length}</div>
                  </div>
                </div>
              </div>

              {/* Saved Repositories & Connection Finder */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3">
                  <span className="text-xs font-medium text-zinc-400">Saved Projects:</span>
                  {repos.length ? (
                    repos.map((r) => (
                      <span key={r.repo_id} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] transition hover:border-amber-400/40">
                        <button onClick={() => handleLoadGraph(r.repo_id)} className="font-mono text-zinc-200 hover:text-amber-300">
                          {r.repo_id} ({r.files} files)
                        </button>
                        <button onClick={() => handleDeleteRepo(r.repo_id)} aria-label={`Delete ${r.repo_id}`} className="text-zinc-500 hover:text-rose-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-500">None yet — analyze a repository above.</span>
                  )}
                </div>

                <form onSubmit={handleTracePath} className="glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5">
                  <span className="text-xs font-medium text-zinc-400">Trace Connection:</span>
                  <input
                    value={pathSrc}
                    onChange={(e) => setPathSrc(e.target.value)}
                    placeholder="Start function"
                    className="w-32 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-amber-400/60"
                  />
                  <span className="text-xs text-zinc-500">to</span>
                  <input
                    value={pathTgt}
                    onChange={(e) => setPathTgt(e.target.value)}
                    placeholder="Target function"
                    className="w-32 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-amber-400/60"
                  />
                  <button disabled={busy} className="rounded-lg border border-amber-400/35 bg-amber-400/15 px-3.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/25">
                    Find Path
                  </button>
                </form>
              </div>

              {/* Map + Slide-in Inspector */}
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-3 lg:col-span-2">
                  {subgraphOverlay && (
                    <div className="glass flex items-center justify-between rounded-xl border-amber-400/25 px-4 py-2.5 text-xs text-amber-300">
                      <span>{subgraphOverlay.label}</span>
                      <button onClick={() => setSubgraphOverlay(null)} className="font-medium underline hover:text-amber-200">
                        Show Full Project
                      </button>
                    </div>
                  )}
                  <GraphView data={activeGraph} selectedId={selectedNode?.node_id} onSelectNode={handleSelectNode} />
                </div>

                <div className="glass rounded-2xl p-5">
                  {selectedNode ? (
                    <div key={selectedNode.node_id} className="animate-slide-right space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-0.5 text-[11px] font-medium text-amber-300">
                          {selectedNode.kind}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          Lines {selectedNode.start_line}-{selectedNode.end_line}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">{selectedNode.name}</h3>
                        <p className="mt-0.5 truncate font-mono text-xs text-sky-300">{selectedNode.file_path}</p>
                      </div>
                      {(selectedNode.raw_code || selectedNode.signature) && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => handleCopyCode(selectedNode.raw_code || selectedNode.signature || "")}
                            className="absolute top-2 right-2 rounded-md border border-white/10 bg-zinc-900/90 px-2 py-1 font-mono text-[10px] text-zinc-300 hover:text-white"
                          >
                            {copied ? "Copied" : <Copy className="h-3 w-3" />}
                          </button>
                          <pre className="max-h-44 overflow-auto rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                            {selectedNode.raw_code || selectedNode.signature}
                          </pre>
                        </div>
                      )}
                      <button
                        onClick={() => handleBlastRadius(selectedNode)}
                        disabled={busy}
                        className="w-full rounded-xl border border-amber-400/35 bg-amber-400/15 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/25"
                      >
                        See What This Affects
                      </button>
                      <div className="border-t border-white/10 pt-3">
                        <div className="mb-2 text-[11px] font-medium text-zinc-400">Direct Links ({connectedEdges.length})</div>
                        <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                          {connectedEdges.slice(0, 10).map((e, i) => (
                            <div key={i} className="truncate rounded-lg bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-zinc-300">
                              {e.source.split(":").slice(-2, -1)[0] || e.source} <span className="text-amber-300">[{e.kind}]</span>{" "}
                              {e.target.split(":").slice(-2, -1)[0] || e.target}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
                      <div className="text-sm font-medium text-zinc-200">Code Inspector</div>
                      <p className="mt-1.5 max-w-[220px] text-xs leading-relaxed text-zinc-500">
                        Click any dot on the map to read its source code and see which parts of the project depend on it.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Health Check */}
              {auditRes && (
                <div className="glass-strong animate-tab grid gap-5 rounded-3xl p-6 md:grid-cols-3">
                  <div>
                    <div className="mb-2.5 text-xs font-semibold text-rose-300">Circular Loops ({auditRes.cycles.length})</div>
                    {auditRes.cycles.length ? (
                      <div className="space-y-1.5">
                        {auditRes.cycles.map((c, i) => (
                          <div key={i} className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-1.5 font-mono text-[11px] text-zinc-200">
                            {c.join(" -> ")}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">No circular loops found — clean dependency flow.</p>
                    )}
                  </div>
                  <div>
                    <div className="mb-2.5 text-xs font-semibold text-amber-300">Most Connected Code ({auditRes.hotspots.length})</div>
                    <div className="space-y-1.5">
                      {auditRes.hotspots.map((h) => (
                        <div key={h.node_id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs">
                          <span className="truncate font-mono text-zinc-200">{h.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-zinc-400">{h.fan_in} in / {h.fan_out} out</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2.5 text-xs font-semibold text-sky-300">Unused Functions ({auditRes.orphan_symbols.length})</div>
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {auditRes.orphan_symbols.map((o) => (
                        <div key={o.node_id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs">
                          <span className="truncate font-mono text-zinc-200">{o.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-zinc-500">{o.file_path}:{o.start_line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Whole Project Overview */}
              {projectSummary && (
                <div className="glass-strong animate-tab space-y-4 rounded-3xl p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-white">
                      Project Overview · <span className="font-mono text-amber-300">{projectSummary.repo_id}</span>
                    </h2>
                    <button
                      onClick={() => downloadMarkdown(`${projectSummary.repo_id}-overview.md`, projectSummary.summary)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                    >
                      <Download className="h-3 w-3" /> Save Report
                    </button>
                  </div>
                  <div className="grid gap-5 md:grid-cols-3">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200 md:col-span-2">{projectSummary.summary}</pre>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                      <div className="mb-2.5 text-xs font-semibold text-zinc-300">Core Building Blocks</div>
                      <div className="space-y-2">
                        {projectSummary.hubs.map((h) => (
                          <div key={`${h.file_path}:${h.name}`} className="flex items-center justify-between text-xs">
                            <span className="truncate font-mono text-amber-300">{h.name}</span>
                            <span className="shrink-0 rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-zinc-400">{h.degree} links</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: ASK AI */}
          {tab === "chat" && (
            <section key="chat" className="animate-tab space-y-5">
              <div className="glass-strong rounded-3xl p-5">
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-white">Ask Anything About This Codebase</h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Instead of guessing from isolated snippets, SyntaxGraph follows real function connections and points to exact files and lines.
                  </p>
                </div>

                <form onSubmit={handleQuery} className="flex flex-wrap gap-2.5">
                  <input
                    value={repoId}
                    onChange={(e) => setRepoId(e.target.value)}
                    placeholder="Project ID"
                    className="w-52 rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 font-mono text-xs text-zinc-300 outline-none focus:border-amber-400/60"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask a question in plain English..."
                    className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/45 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
                  />
                  <button
                    disabled={busy}
                    className="rounded-xl bg-amber-400 px-6 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy ? "Searching..." : "Ask AI"}
                  </button>
                </form>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[...SAMPLE_QUERIES, ...history.filter((h) => !SAMPLE_QUERIES.includes(h))].slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuery(q)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  "1. Understand Question",
                  "2. Search Matching Code",
                  "3. Follow File Links",
                  "4. Write Grounded Answer",
                ].map((step) => (
                  <div
                    key={step}
                    className={`glass rounded-2xl px-4 py-3 text-xs font-medium transition ${
                      queryRes || busy ? "border-amber-400/35 text-amber-200" : "text-zinc-400"
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>

              {queryRes && (
                <div className="grid gap-5 lg:grid-cols-3">
                  <div className="glass-strong animate-tab space-y-4 rounded-3xl p-6 lg:col-span-2">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-100">{queryRes.answer}</pre>
                    <div className="border-t border-white/10 pt-3.5">
                      <div className="mb-2 text-xs font-medium text-zinc-400">Referenced Files (click to open on map)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {queryRes.citations.map((c) => (
                          <button
                            key={c.node_id}
                            onClick={() => {
                              handleSelectNode(c);
                              setTab("explorer");
                            }}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-sky-300 transition hover:border-amber-400/40 hover:text-amber-300"
                          >
                            {c.file_path}:{c.start_line}-{c.end_line} · {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="glass animate-slide-right space-y-2.5 rounded-3xl p-5">
                    <div className="text-xs font-semibold text-zinc-200">How We Found This</div>
                    {queryRes.trace.map((t, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-300">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 3: UPDATES (COMMITS & PRS) */}
          {tab === "github" && (
            <section key="github" className="animate-tab space-y-5">
              <form onSubmit={handleGithubSummary} className="glass-strong flex flex-wrap items-center gap-2.5 rounded-3xl p-4">
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/45 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
                />
                <div className="flex rounded-xl border border-white/10 bg-black/45 p-1">
                  <button
                    type="button"
                    onClick={() => setGhKind("commits")}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${ghKind === "commits" ? "bg-amber-400 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}
                  >
                    Recent Commits
                  </button>
                  <button
                    type="button"
                    onClick={() => setGhKind("prs")}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${ghKind === "prs" ? "bg-amber-400 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}
                  >
                    Pull Requests
                  </button>
                </div>
                <select
                  value={ghLimit}
                  onChange={(e) => setGhLimit(Number(e.target.value))}
                  className="rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 text-xs text-zinc-200 outline-none"
                >
                  <option value={5}>Last 5</option>
                  <option value={10}>Last 10</option>
                  <option value={15}>Last 15</option>
                </select>
                <button
                  disabled={busy}
                  className="rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? "Summarizing..." : "Summarize"}
                </button>
              </form>

              {ghRes && (
                <div className="animate-tab space-y-4">
                  <div className="glass-strong rounded-3xl p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-white">
                        Summary of {ghRes.kind === "commits" ? "Recent Commits" : "Pull Requests"} ·{" "}
                        <span className="font-mono text-amber-300">{ghRes.repo}</span>
                      </h2>
                      <button
                        onClick={() => downloadMarkdown(`${ghRes.repo.replace("/", "_")}-${ghRes.kind}.md`, ghRes.summary)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                      >
                        <Download className="h-3 w-3" /> Save Summary
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">{ghRes.summary}</pre>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {ghRes.items.map((item) => (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="glass bento-hover group flex flex-col justify-between rounded-2xl p-4"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-amber-300">{item.id}</span>
                            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase text-zinc-300">
                              {item.state}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-zinc-100 group-hover:text-amber-300">{item.title}</p>
                          {item.body && <p className="line-clamp-2 text-xs text-zinc-400">{item.body}</p>}
                        </div>
                        <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-zinc-500">
                          <span>{item.author} · {item.date}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 4: BENCHMARKS */}
          {tab === "eval" && (
            <section key="eval" className="animate-tab space-y-5">
              <div className="glass-strong flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
                <div>
                  <h2 className="text-base font-semibold text-white">Accuracy &amp; Speed Benchmark</h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Tests 10 real coding questions comparing <span className="text-zinc-200">Standard Text Search</span> against{" "}
                    <span className="text-amber-300">SyntaxGraph</span>.
                  </p>
                </div>
                <button
                  onClick={handleEval}
                  disabled={busy}
                  className="rounded-xl bg-amber-400 px-6 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? "Running Test..." : "Run Benchmark"}
                </button>
              </div>

              {evalRes && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {evalRes.summary.map((row) => {
                      const info = METRIC_LABELS[row.metric] || { title: row.metric, subtitle: "" };
                      const isPct = row.proposed_syntaxgraph.includes("%");
                      const val = pctValue(row.proposed_syntaxgraph);
                      return (
                        <div key={row.metric} className="glass-strong bento-hover flex items-center justify-between gap-3 rounded-2xl p-5">
                          <div>
                            <div className="text-xs font-semibold text-white">{info.title}</div>
                            <div className="mt-0.5 text-[11px] text-zinc-400">{info.subtitle}</div>
                            <div className="mt-3 font-mono text-2xl font-semibold text-white">{row.proposed_syntaxgraph}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Standard: {row.baseline_vector_rag} · <span className="font-semibold text-amber-300">{row.improvement}</span>
                            </div>
                          </div>
                          {isPct && <RingGauge value={val} color={row.metric.includes("Hallucination") ? "#34d399" : "#f59e0b"} />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="glass overflow-hidden rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                        <tr>
                          <th className="px-4 py-3">Question Type</th>
                          <th className="px-4 py-3">Test Question</th>
                          <th className="px-4 py-3">Standard Search</th>
                          <th className="px-4 py-3">SyntaxGraph</th>
                          <th className="px-4 py-3">Connection Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {evalRes.cases.map((c, idx) => (
                          <tr key={idx} className="transition hover:bg-white/[0.03]">
                            <td className="px-4 py-2.5 text-[11px] text-zinc-400">
                              {c.category === "LOCAL_SYMBOL_LOOKUP"
                                ? "Quick Lookup"
                                : c.category === "CROSS_FILE_DEPENDENCY_TRACE"
                                ? "Cross-File Trace"
                                : "Bug Finding"}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-200">{c.query}</td>
                            <td className="px-4 py-2.5 font-mono text-zinc-400">{c.baseline_recall}%</td>
                            <td className="px-4 py-2.5 font-mono font-semibold text-emerald-300">{c.syntaxgraph_recall}%</td>
                            <td className="px-4 py-2.5 font-mono font-semibold text-sky-300">{c.syntaxgraph_edge_acc}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          {/* TAB 5: TEAM */}
          {tab === "about" && <AboutSection />}
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-4 text-[11px] text-zinc-500">
          <span>SyntaxGraph Team</span>
          <span>Krishan Kant Sharma · Divanshu Tiwari · Sahil · Deepak Baghel</span>
        </footer>
      </main>
    </>
  );
}
