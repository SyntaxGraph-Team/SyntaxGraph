"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, Copy, Download, ExternalLink, LogOut, Trash2, X } from "lucide-react";
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

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "explorer", label: "Code Map" },
  { id: "chat", label: "Ask AI" },
  { id: "github", label: "Updates" },
  { id: "eval", label: "Benchmarks" },
  { id: "about", label: "Team" },
];

const MARQUEE_WORDS = ["CODE MAP", "ASK QUESTIONS", "TRACE CALLS", "SUMMARIZE PRS", "HEALTH CHECK", "BENCHMARKS"];

const SAMPLE_QUERIES = [
  "How do the main files connect to each other?",
  "Where are logins and security checks handled?",
  "Which functions depend on each other across files?",
];

const METRIC_LABELS: Record<string, { title: string; subtitle: string }> = {
  "Multi-Hop File Recall@K": { title: "Cross-File Accuracy", subtitle: "Finds related files across folders" },
  "Cross-File Call Tracing Accuracy": { title: "Connection Tracing", subtitle: "Follows who calls whom" },
  "Unresolved / Hallucination Rate": { title: "Wrong Symbol Rate", subtitle: "Fewer made-up references" },
  "Commit Re-Indexing Latency": { title: "Update Speed", subtitle: "Refresh time after changes" },
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
        <div className="panel rounded-full px-6 py-3 text-xs text-slate-300">Signing you in...</div>
      </main>
    );
  }

  if (firebaseConfigured ? !user : !devUnlocked) {
    return (
      <LoginView
        onDemoEnter={() => {
          setDevUnlocked(true);
          refreshRepos();
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 faded-grid opacity-40" />

      {/* Sticky Glass Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        {busy && (
          <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-white/5">
            <div className="animate-shimmer h-full w-1/3 bg-gradient-to-r from-transparent via-[#58d5ba] to-transparent" />
          </div>
        )}

        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#58d5ba]/80">Codebase Intelligence</p>
              <p className="text-lg font-semibold text-white">SyntaxGraph</p>
            </div>

            <nav className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1 md:flex">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                    tab === id
                      ? "bg-[#58d5ba] font-semibold text-slate-950"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {health && (
              <span className="hidden items-center gap-2 rounded-full border border-[#58d5ba]/25 bg-[#58d5ba]/10 px-3 py-1 text-xs text-[#77e7d2] sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[#58d5ba]" />
                {health.store_mode === "neo4j+qdrant" ? "Cloud Engine Online" : "Local Mode"}
              </span>
            )}

            {firebaseConfigured && user ? (
              <button
                onClick={signOutUser}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
              >
                <span className="max-w-[140px] truncate">{user.email || user.displayName}</span>
                <LogOut className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ) : (
              <button
                onClick={() => setDevUnlocked(false)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/5 px-4 py-2 md:hidden">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-medium ${
                tab === id ? "bg-[#58d5ba] text-slate-950" : "bg-white/5 text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        {status && (
          <div className="panel animate-tab mb-6 flex items-center justify-between rounded-2xl border-[#58d5ba]/30 px-4 py-3 text-xs text-slate-100">
            <span>{status}</span>
            <button onClick={() => setStatus("")} aria-label="Dismiss status" className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex-1">
          {/* TAB 1: CODE MAP */}
          {tab === "explorer" && (
            <section key="explorer" className="animate-tab space-y-6">
              {/* Hero Command Panel */}
              <div className="panel-strong relative overflow-hidden rounded-[2.2rem] px-6 py-8 sm:px-10">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(88,213,186,0.16),transparent_55%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_45%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-4">
                  <div className="headline-marquee">
                    <div className="headline-marquee-track">
                      {[...MARQUEE_WORDS, ...MARQUEE_WORDS].map((w, i) => (
                        <span key={i} className="headline-marquee-word">{w}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-[#58d5ba]/85">Interactive Code Map</p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      Explore a codebase{" "}
                      <span className="hero-accent-text">without losing the big picture.</span>
                    </h1>
                    <p className="mt-2.5 max-w-xl text-sm leading-7 text-slate-300">
                      Paste any GitHub repository URL to build a live map of files, classes, and functions — or pick a
                      saved project below.
                    </p>

                    <form onSubmit={handleIngest} className="mt-6 space-y-3">
                      <div className="flex flex-wrap gap-2.5">
                        <input
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          placeholder="https://github.com/owner/repo"
                          className="min-w-[240px] flex-1 rounded-full border border-white/15 bg-slate-950/75 px-4 py-3 text-sm text-white outline-none focus:border-[#58d5ba]"
                        />
                        <input
                          value={repoId}
                          onChange={(e) => setRepoId(e.target.value)}
                          placeholder="Project ID"
                          className="w-52 rounded-full border border-white/15 bg-slate-950/75 px-4 py-3 font-mono text-xs text-slate-300 outline-none focus:border-[#58d5ba]"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        <button
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-full bg-[#58d5ba] px-6 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-[#77e7d2] disabled:opacity-50"
                        >
                          {busy ? "Analyzing..." : "Analyze Repo"}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadGraph()}
                          disabled={busy}
                          className="rounded-full border border-white/12 bg-white/5 px-5 py-2.5 text-xs font-medium text-white transition hover:bg-white/10"
                        >
                          Open Saved
                        </button>
                        <button
                          type="button"
                          onClick={handleSummarizeProject}
                          disabled={busy}
                          className="rounded-full border border-[#58d5ba]/30 bg-[#58d5ba]/10 px-5 py-2.5 text-xs font-medium text-[#77e7d2] transition hover:bg-[#58d5ba]/20"
                        >
                          Project Overview
                        </button>
                        <button
                          type="button"
                          onClick={handleAudit}
                          disabled={busy}
                          className="rounded-full border border-rose-400/30 bg-rose-400/10 px-5 py-2.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/20"
                        >
                          Health Check
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Live Bento Metrics */}
                  <div className="grid grid-cols-3 gap-3 lg:grid-cols-2">
                    <div className="interactive-card rounded-[1.45rem] border border-white/10 bg-slate-950/60 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[#58d5ba]/80">Items</p>
                      <p className="mt-2 text-3xl font-semibold text-white">{activeGraph.nodes.length}</p>
                      <p className="mt-1 text-xs text-slate-400">Files &amp; functions mapped</p>
                    </div>
                    <div className="interactive-card rounded-[1.45rem] border border-white/10 bg-slate-950/60 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[#58d5ba]/80">Links</p>
                      <p className="mt-2 text-3xl font-semibold text-white">{activeGraph.edges.length}</p>
                      <p className="mt-1 text-xs text-slate-400">Calls &amp; imports traced</p>
                    </div>
                    <div className="interactive-card col-span-3 rounded-[1.45rem] border border-white/10 bg-slate-950/60 p-4 lg:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-[0.2em] text-[#58d5ba]/80">Saved Projects</span>
                        <span className="font-mono text-xs text-slate-400">{repos.length} available</span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {repos.length ? (
                          repos.map((r) => (
                            <span
                              key={r.repo_id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px]"
                            >
                              <button onClick={() => handleLoadGraph(r.repo_id)} className="font-mono text-slate-200 hover:text-[#77e7d2]">
                                {r.repo_id} ({r.files}f)
                              </button>
                              <button onClick={() => handleDeleteRepo(r.repo_id)} aria-label={`Delete ${r.repo_id}`} className="text-slate-500 hover:text-rose-400">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">Analyze a repo to save it here.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Path Finder */}
              <form onSubmit={handleTracePath} className="panel flex flex-wrap items-center gap-3 rounded-[1.5rem] px-5 py-3.5">
                <span className="text-xs font-medium text-slate-300">Trace how two functions connect:</span>
                <input
                  value={pathSrc}
                  onChange={(e) => setPathSrc(e.target.value)}
                  placeholder="Start function (e.g. handle_checkout)"
                  className="min-w-[180px] flex-1 rounded-full border border-white/10 bg-slate-950/75 px-4 py-2 font-mono text-xs text-slate-200 outline-none focus:border-[#58d5ba]"
                />
                <span className="text-xs text-slate-500">to</span>
                <input
                  value={pathTgt}
                  onChange={(e) => setPathTgt(e.target.value)}
                  placeholder="Target function"
                  className="min-w-[180px] flex-1 rounded-full border border-white/10 bg-slate-950/75 px-4 py-2 font-mono text-xs text-slate-200 outline-none focus:border-[#58d5ba]"
                />
                <button disabled={busy} className="rounded-full bg-white/10 px-5 py-2 text-xs font-medium text-white transition hover:bg-[#58d5ba] hover:text-slate-950">
                  Find Path
                </button>
              </form>

              {/* Map + Slide-In Inspector */}
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-3 lg:col-span-2">
                  {subgraphOverlay && (
                    <div className="panel flex items-center justify-between rounded-2xl border-[#58d5ba]/30 px-4 py-2.5 text-xs text-[#77e7d2]">
                      <span>{subgraphOverlay.label}</span>
                      <button onClick={() => setSubgraphOverlay(null)} className="font-medium underline">
                        Show Full Project
                      </button>
                    </div>
                  )}
                  <GraphView data={activeGraph} selectedId={selectedNode?.node_id} onSelectNode={handleSelectNode} />
                </div>

                <div className="panel rounded-[1.7rem] p-5">
                  {selectedNode ? (
                    <div key={selectedNode.node_id} className="animate-slide-right space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full border border-[#58d5ba]/30 bg-[#58d5ba]/10 px-3 py-0.5 text-[11px] font-medium text-[#77e7d2]">
                          {selectedNode.kind}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
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
                            className="absolute top-2.5 right-2.5 rounded-lg border border-white/10 bg-slate-900/90 px-2 py-1 font-mono text-[10px] text-slate-300 hover:text-white"
                          >
                            {copied ? "Copied" : <Copy className="h-3 w-3" />}
                          </button>
                          <pre className="max-h-44 overflow-auto rounded-2xl border border-white/10 bg-slate-950/90 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                            {selectedNode.raw_code || selectedNode.signature}
                          </pre>
                        </div>
                      )}
                      <button
                        onClick={() => handleBlastRadius(selectedNode)}
                        disabled={busy}
                        className="w-full rounded-full bg-[#58d5ba]/15 py-2.5 text-xs font-semibold text-[#77e7d2] transition hover:bg-[#58d5ba] hover:text-slate-950"
                      >
                        See What This Affects
                      </button>
                      <div className="border-t border-white/10 pt-3">
                        <div className="mb-2 text-[11px] font-medium text-slate-400">Direct Links ({connectedEdges.length})</div>
                        <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                          {connectedEdges.slice(0, 10).map((e, i) => (
                            <div key={i} className="truncate rounded-xl bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] text-slate-300">
                              {e.source.split(":").slice(-2, -1)[0] || e.source} <span className="text-[#58d5ba]">[{e.kind}]</span>{" "}
                              {e.target.split(":").slice(-2, -1)[0] || e.target}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                      <div className="text-sm font-semibold text-white">Code Inspector</div>
                      <p className="mt-2 max-w-[230px] text-xs leading-6 text-slate-400">
                        Click any dot on the map to read its source code and see which parts of the project depend on it.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Health Check */}
              {auditRes && (
                <div className="panel-strong animate-tab grid gap-5 rounded-[2rem] p-6 md:grid-cols-3">
                  <div>
                    <div className="mb-2.5 text-xs font-semibold text-rose-300">Circular Loops ({auditRes.cycles.length})</div>
                    {auditRes.cycles.length ? (
                      <div className="space-y-1.5">
                        {auditRes.cycles.map((c, i) => (
                          <div key={i} className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 font-mono text-[11px] text-slate-200">
                            {c.join(" -> ")}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No circular loops found.</p>
                    )}
                  </div>
                  <div>
                    <div className="mb-2.5 text-xs font-semibold text-[#77e7d2]">Most Connected Code ({auditRes.hotspots.length})</div>
                    <div className="space-y-1.5">
                      {auditRes.hotspots.map((h) => (
                        <div key={h.node_id} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
                          <span className="truncate font-mono text-slate-200">{h.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">{h.fan_in} in / {h.fan_out} out</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2.5 text-xs font-semibold text-sky-300">Unused Functions ({auditRes.orphan_symbols.length})</div>
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {auditRes.orphan_symbols.map((o) => (
                        <div key={o.node_id} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
                          <span className="truncate font-mono text-slate-200">{o.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">{o.file_path}:{o.start_line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Whole Project Overview */}
              {projectSummary && (
                <div className="panel-strong animate-tab space-y-4 rounded-[2rem] p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-white">
                      Project Overview · <span className="font-mono text-[#77e7d2]">{projectSummary.repo_id}</span>
                    </h2>
                    <button
                      onClick={() => downloadMarkdown(`${projectSummary.repo_id}-overview.md`, projectSummary.summary)}
                      className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                    >
                      <Download className="h-3.5 w-3.5" /> Save Report
                    </button>
                  </div>
                  <div className="grid gap-5 md:grid-cols-3">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-200 md:col-span-2">{projectSummary.summary}</pre>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                      <div className="mb-3 text-xs font-semibold text-slate-300">Core Building Blocks</div>
                      <div className="space-y-2">
                        {projectSummary.hubs.map((h) => (
                          <div key={`${h.file_path}:${h.name}`} className="flex items-center justify-between text-xs">
                            <span className="truncate font-mono text-[#77e7d2]">{h.name}</span>
                            <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-slate-400">{h.degree} links</span>
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
            <section key="chat" className="animate-tab space-y-6">
              <div className="panel-strong rounded-[2.2rem] p-6 sm:p-8">
                <p className="text-xs uppercase tracking-[0.28em] text-[#58d5ba]/80">Grounded Code Q&amp;A</p>
                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Ask anything about your repository</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
                  Answers are pulled directly from your mapped code and include clickable file and line links.
                </p>

                <form onSubmit={handleQuery} className="mt-5 flex flex-wrap gap-2.5">
                  <input
                    value={repoId}
                    onChange={(e) => setRepoId(e.target.value)}
                    placeholder="Project ID"
                    className="w-52 rounded-full border border-white/15 bg-slate-950/75 px-4 py-3 font-mono text-xs text-slate-300 outline-none focus:border-[#58d5ba]"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask a question in plain English..."
                    className="min-w-[240px] flex-1 rounded-full border border-white/15 bg-slate-950/75 px-4 py-3 text-sm text-white outline-none focus:border-[#58d5ba]"
                  />
                  <button
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full bg-[#58d5ba] px-6 py-3 text-xs font-semibold text-slate-950 transition hover:bg-[#77e7d2] disabled:opacity-50"
                  >
                    {busy ? "Searching..." : "Ask AI"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </form>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[...SAMPLE_QUERIES, ...history.filter((h) => !SAMPLE_QUERIES.includes(h))].slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuery(q)}
                      className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-[#58d5ba]/40 hover:text-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {["1. Understand Question", "2. Find Matching Code", "3. Follow File Links", "4. Write Grounded Answer"].map((step) => (
                  <div
                    key={step}
                    className={`panel rounded-2xl px-4 py-3 text-xs font-medium transition ${
                      queryRes || busy ? "border-[#58d5ba]/35 text-[#77e7d2]" : "text-slate-400"
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>

              {queryRes && (
                <div className="grid gap-5 lg:grid-cols-3">
                  <div className="panel-strong animate-tab space-y-4 rounded-[2rem] p-6 lg:col-span-2">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-100">{queryRes.answer}</pre>
                    <div className="border-t border-white/10 pt-4">
                      <div className="mb-2.5 text-xs font-medium text-slate-400">Referenced Files (click to inspect)</div>
                      <div className="flex flex-wrap gap-2">
                        {queryRes.citations.map((c) => (
                          <button
                            key={c.node_id}
                            onClick={() => {
                              handleSelectNode(c);
                              setTab("explorer");
                            }}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] text-[#77e7d2] transition hover:border-[#58d5ba]/50"
                          >
                            {c.file_path}:{c.start_line}-{c.end_line} · {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="panel animate-slide-right space-y-2.5 rounded-[2rem] p-5">
                    <div className="text-xs font-semibold text-white">Steps Taken</div>
                    {queryRes.trace.map((t, i) => (
                      <div key={i} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 font-mono text-[11px] text-slate-300">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 3: UPDATES */}
          {tab === "github" && (
            <section key="github" className="animate-tab space-y-6">
              <div className="panel-strong rounded-[2.2rem] p-6 sm:p-8">
                <p className="text-xs uppercase tracking-[0.28em] text-[#58d5ba]/80">Activity Digest</p>
                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Summarize recent commits &amp; pull requests</h2>
                <form onSubmit={handleGithubSummary} className="mt-5 flex flex-wrap items-center gap-2.5">
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="min-w-[260px] flex-1 rounded-full border border-white/15 bg-slate-950/75 px-4 py-3 text-sm text-white outline-none focus:border-[#58d5ba]"
                  />
                  <div className="flex rounded-full border border-white/10 bg-slate-950/75 p-1">
                    <button
                      type="button"
                      onClick={() => setGhKind("commits")}
                      className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${ghKind === "commits" ? "bg-[#58d5ba] text-slate-950" : "text-slate-400 hover:text-white"}`}
                    >
                      Recent Commits
                    </button>
                    <button
                      type="button"
                      onClick={() => setGhKind("prs")}
                      className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${ghKind === "prs" ? "bg-[#58d5ba] text-slate-950" : "text-slate-400 hover:text-white"}`}
                    >
                      Pull Requests
                    </button>
                  </div>
                  <select
                    value={ghLimit}
                    onChange={(e) => setGhLimit(Number(e.target.value))}
                    className="rounded-full border border-white/15 bg-slate-950/75 px-4 py-3 text-xs text-slate-200 outline-none"
                  >
                    <option value={5}>Last 5</option>
                    <option value={10}>Last 10</option>
                    <option value={15}>Last 15</option>
                  </select>
                  <button
                    disabled={busy}
                    className="rounded-full bg-[#58d5ba] px-6 py-3 text-xs font-semibold text-slate-950 transition hover:bg-[#77e7d2] disabled:opacity-50"
                  >
                    {busy ? "Summarizing..." : "Summarize"}
                  </button>
                </form>
              </div>

              {ghRes && (
                <div className="animate-tab space-y-4">
                  <div className="panel-strong rounded-[2rem] p-6 sm:p-8">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-white">
                        Summary of {ghRes.kind === "commits" ? "Recent Commits" : "Pull Requests"} ·{" "}
                        <span className="font-mono text-[#77e7d2]">{ghRes.repo}</span>
                      </h3>
                      <button
                        onClick={() => downloadMarkdown(`${ghRes.repo.replace("/", "_")}-${ghRes.kind}.md`, ghRes.summary)}
                        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                      >
                        <Download className="h-3.5 w-3.5" /> Save Summary
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-200">{ghRes.summary}</pre>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {ghRes.items.map((item) => (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="interactive-card panel group flex flex-col justify-between rounded-[1.5rem] p-5"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-[#77e7d2]">{item.id}</span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] uppercase text-slate-300">
                              {item.state}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-white group-hover:text-[#77e7d2]">{item.title}</p>
                          {item.body && <p className="line-clamp-2 text-xs leading-6 text-slate-400">{item.body}</p>}
                        </div>
                        <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-slate-500">
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
            <section key="eval" className="animate-tab space-y-6">
              <div className="panel-strong flex flex-wrap items-center justify-between gap-4 rounded-[2.2rem] p-6 sm:p-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-[#58d5ba]/80">Quality &amp; Speed</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Compare SyntaxGraph vs Standard Search</h2>
                  <p className="mt-1.5 text-sm text-slate-300">
                    Runs 10 real multi-file coding questions to measure accuracy, connection tracing, and update speed.
                  </p>
                </div>
                <button
                  onClick={handleEval}
                  disabled={busy}
                  className="rounded-full bg-[#58d5ba] px-6 py-3 text-xs font-semibold text-slate-950 transition hover:bg-[#77e7d2] disabled:opacity-50"
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
                        <div key={row.metric} className="panel-strong interactive-card flex items-center justify-between gap-3 rounded-[1.6rem] p-5">
                          <div>
                            <div className="text-xs font-semibold text-white">{info.title}</div>
                            <div className="mt-0.5 text-[11px] text-slate-400">{info.subtitle}</div>
                            <div className="mt-3 font-mono text-2xl font-semibold text-white">{row.proposed_syntaxgraph}</div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              Standard: {row.baseline_vector_rag} · <span className="font-semibold text-[#77e7d2]">{row.improvement}</span>
                            </div>
                          </div>
                          {isPct && <RingGauge value={val} color={row.metric.includes("Hallucination") ? "#34d399" : "#58d5ba"} />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="panel overflow-hidden rounded-[1.7rem]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
                        <tr>
                          <th className="px-5 py-3.5">Question Type</th>
                          <th className="px-5 py-3.5">Test Question</th>
                          <th className="px-5 py-3.5">Standard Search</th>
                          <th className="px-5 py-3.5">SyntaxGraph</th>
                          <th className="px-5 py-3.5">Connection Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {evalRes.cases.map((c, idx) => (
                          <tr key={idx} className="transition hover:bg-white/[0.03]">
                            <td className="px-5 py-3 text-[11px] text-slate-400">
                              {c.category === "LOCAL_SYMBOL_LOOKUP"
                                ? "Quick Lookup"
                                : c.category === "CROSS_FILE_DEPENDENCY_TRACE"
                                ? "Cross-File Trace"
                                : "Bug Finding"}
                            </td>
                            <td className="px-5 py-3 text-slate-200">{c.query}</td>
                            <td className="px-5 py-3 font-mono text-slate-400">{c.baseline_recall}%</td>
                            <td className="px-5 py-3 font-mono font-semibold text-[#77e7d2]">{c.syntaxgraph_recall}%</td>
                            <td className="px-5 py-3 font-mono font-semibold text-sky-300">{c.syntaxgraph_edge_acc}%</td>
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

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-5 text-xs text-slate-500">
          <span>SyntaxGraph Team</span>
          <span>Krishan Kant Sharma · Divanshu Tiwari · Sahil · Deepak Baghel</span>
        </footer>
      </main>
    </div>
  );
}
