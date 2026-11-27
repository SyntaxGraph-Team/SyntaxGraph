"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  Activity,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  LogOut,
  Play,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
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

const SAMPLE_QUERIES = [
  "Trace cross-file dependencies from main entrypoints",
  "Where are webhook signatures or auth tokens verified?",
  "Locate potential error handling or validation bugs",
];

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  const [evalLive, setEvalLive] = useState(false);

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
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    runTask(async () => {
      setStatus("Cloning and parsing AST into Neo4j + Qdrant...");
      const res = await api.ingest(repoUrl.trim(), undefined, token);
      setRepoId(res.repo_id);
      setSelectedNode(null);
      setSubgraphOverlay(null);
      setAuditRes(null);
      setStatus(`Indexed ${res.files_parsed} files, ${res.nodes_indexed} AST nodes, ${res.edges_indexed} edges (${res.latency_ms} ms)`);
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
      setStatus(`Loaded ${g.nodes.length} nodes and ${g.edges.length} edges for ${targetId}`);
    });
  }

  function handleDeleteRepo(targetId: string) {
    runTask(async () => {
      await api.deleteRepo(targetId, token);
      await refreshRepos();
      if (repoId === targetId) setGraph({ nodes: [], edges: [] });
      setStatus(`Removed ${targetId} from Neo4j and Qdrant.`);
    });
  }

  function handleSelectNode(node: ASTNodeItem) {
    setSelectedNode(node);
    api.nodeDetail(repoId, node.node_id, token).then(setSelectedNode).catch(() => null);
  }

  function handleSummarizeProject() {
    if (!repoId.trim()) return;
    runTask(async () => {
      setStatus("Synthesizing whole-project architecture summary...");
      setProjectSummary(await api.summarizeRepo(repoId.trim(), token));
      setStatus("Project architecture summary ready.");
    });
  }

  function handleAudit() {
    if (!repoId.trim()) return;
    runTask(async () => {
      setStatus("Running AST cycle, orphan symbol, and coupling hotspot audit...");
      const res = await api.audit(repoId.trim(), token);
      setAuditRes(res);
      setStatus(`Audit complete: ${res.cycles.length} cycles, ${res.orphan_symbols.length} unreferenced symbols.`);
    });
  }

  function handleTracePath(e: React.FormEvent) {
    e.preventDefault();
    if (!pathSrc.trim() || !pathTgt.trim()) return;
    runTask(async () => {
      const res = await api.tracePath(repoId.trim(), pathSrc.trim(), pathTgt.trim(), token);
      if (!res.nodes.length) {
        setStatus(`No directed AST path found from '${pathSrc}' to '${pathTgt}'.`);
        return;
      }
      setSubgraphOverlay({ label: `Shortest path: ${pathSrc} -> ${pathTgt} (${res.nodes.length} hops)`, data: res });
      setStatus(`Found ${res.nodes.length}-node dependency path.`);
    });
  }

  function handleBlastRadius(node: ASTNodeItem) {
    runTask(async () => {
      const imp = await api.impact(repoId, node.node_id, 2, token);
      setSubgraphOverlay({ label: `2-hop blast radius for ${node.name} (${imp.nodes.length} nodes)`, data: imp });
      setStatus(`2-hop impact for ${node.name}: ${imp.nodes.length} nodes, ${imp.edges.length} edges`);
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
      setStatus(`Fetching recent ${ghKind === "commits" ? "commits" : "pull requests"}...`);
      setGhRes(await api.summarizeGithub(repoUrl.trim(), ghKind, ghLimit, token));
      setStatus("");
    });
  }

  function handleEval() {
    runTask(async () => {
      setEvalRes(await api.eval(evalLive, false, token));
    });
  }

  const activeGraph = subgraphOverlay ? subgraphOverlay.data : graph;
  const connectedEdges = selectedNode
    ? activeGraph.edges.filter((e) => e.source === selectedNode.node_id || e.target === selectedNode.node_id)
    : [];

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="glass rounded-xl px-5 py-3 font-mono text-xs text-zinc-300">Checking authentication session...</div>
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
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6">
      <header className="glass-strong animate-fade-up mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
            <GitBranch className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">SyntaxGraph</h1>
            <p className="text-[11px] text-zinc-400">AST Property Graph · Hybrid GraphRAG · SyntaxGraph Team</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {health && (
            <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-zinc-300">
              <span className={`h-1.5 w-1.5 rounded-full ${health.store_mode === "neo4j+qdrant" ? "bg-emerald-400" : "bg-amber-400"}`} />
              {health.store_mode}
            </span>
          )}
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-amber-300">
            {repoId}
          </span>

          {firebaseConfigured && user ? (
            <button onClick={signOutUser} className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/[0.08]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {user.email || user.displayName}
              <LogOut className="ml-1 h-3.5 w-3.5 text-zinc-400" />
            </button>
          ) : (
            <button onClick={() => setDevUnlocked(false)} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200">
              Sign Out
            </button>
          )}
        </div>
      </header>

      <nav className="glass mb-6 inline-flex w-fit flex-wrap gap-1 rounded-xl p-1">
        {[
          { id: "explorer", label: "AST Explorer", icon: Layers },
          { id: "chat", label: "GraphRAG Query", icon: Search },
          { id: "github", label: "Commits & PRs", icon: GitPullRequest },
          { id: "eval", label: "Evaluation", icon: Activity },
          { id: "about", label: "About Us", icon: Users },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as TabId)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
              tab === id
                ? "border border-amber-400/35 bg-amber-400/15 text-amber-300"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {status && (
        <div className="glass animate-fade-up mb-5 flex items-center justify-between rounded-xl border-amber-400/20 px-4 py-2 text-xs text-zinc-200">
          <span>{status}</span>
          <button onClick={() => setStatus("")} aria-label="Dismiss status" className="text-zinc-500 hover:text-zinc-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1">
        {tab === "explorer" && (
          <section className="animate-fade-up space-y-5">
            <form onSubmit={handleIngest} className="glass flex flex-wrap gap-2 rounded-2xl p-2.5">
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="GitHub repository URL (https://github.com/owner/repo)"
                className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/35 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
              <input
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
                placeholder="repo_id"
                className="w-48 rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-zinc-300 outline-none focus:border-amber-400/60"
              />
              <button disabled={busy} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50">
                {busy ? "Working..." : "Ingest Repo"}
              </button>
              <button type="button" onClick={() => handleLoadGraph()} disabled={busy} className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]">
                Load Graph
              </button>
              <button type="button" onClick={handleSummarizeProject} disabled={busy} className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-400/20">
                Summarize Project
              </button>
              <button type="button" onClick={handleAudit} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-400/20">
                <ShieldAlert className="h-3.5 w-3.5" />
                AST Audit
              </button>
            </form>

            {/* Indexed Repository Catalog + Shortest Path Tracer */}
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3.5 py-2.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Indexed Repos</span>
                {repos.length ? (
                  repos.map((r) => (
                    <span key={r.repo_id} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px]">
                      <button onClick={() => handleLoadGraph(r.repo_id)} className="font-mono text-zinc-200 hover:text-amber-300">
                        {r.repo_id} ({r.files}F/{r.nodes}N)
                      </button>
                      <button onClick={() => handleDeleteRepo(r.repo_id)} aria-label={`Delete ${r.repo_id}`} className="text-zinc-500 hover:text-rose-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-zinc-500">Ingest a repository to populate catalog.</span>
                )}
              </div>

              <form onSubmit={handleTracePath} className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3.5 py-2">
                <Route className="h-3.5 w-3.5 text-amber-300" />
                <input
                  value={pathSrc}
                  onChange={(e) => setPathSrc(e.target.value)}
                  placeholder="Source symbol"
                  className="w-36 flex-1 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-amber-400/60"
                />
                <span className="font-mono text-xs text-zinc-500">-&gt;</span>
                <input
                  value={pathTgt}
                  onChange={(e) => setPathTgt(e.target.value)}
                  placeholder="Target symbol"
                  className="w-36 flex-1 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-amber-400/60"
                />
                <button disabled={busy} className="rounded-lg border border-amber-400/35 bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/25">
                  Trace Path
                </button>
              </form>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
                {subgraphOverlay && (
                  <div className="glass flex items-center justify-between rounded-xl px-3.5 py-2 text-xs text-amber-300">
                    <span>{subgraphOverlay.label}</span>
                    <button onClick={() => setSubgraphOverlay(null)} className="underline hover:text-amber-200">Reset to Full Graph</button>
                  </div>
                )}
                <GraphView data={activeGraph} selectedId={selectedNode?.node_id} onSelectNode={handleSelectNode} />
              </div>

              <div className="glass flex flex-col justify-between rounded-2xl p-4">
                {selectedNode ? (
                  <div className="animate-fade-up space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">{selectedNode.kind}</span>
                      <span className="font-mono text-[11px] text-zinc-400">L{selectedNode.start_line}-{selectedNode.end_line}</span>
                    </div>
                    <h3 className="text-base font-semibold text-white">{selectedNode.name}</h3>
                    <p className="flex items-center gap-1.5 font-mono text-xs text-sky-300">
                      <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                      {selectedNode.file_path}
                    </p>
                    {(selectedNode.raw_code || selectedNode.signature) && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(selectedNode.raw_code || selectedNode.signature || "")}
                          className="absolute top-2 right-2 rounded border border-white/10 bg-zinc-900/80 p-1 text-zinc-400 hover:text-white"
                          title="Copy snippet"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <pre className="max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/45 p-2.5 font-mono text-[11px] text-zinc-300">
                          {selectedNode.raw_code || selectedNode.signature}
                        </pre>
                      </div>
                    )}
                    <button
                      onClick={() => handleBlastRadius(selectedNode)}
                      disabled={busy}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-400/15 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/25"
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      Analyze 2-Hop Blast Radius
                    </button>
                    <div className="border-t border-white/10 pt-2.5">
                      <div className="mb-1.5 text-[11px] font-medium text-zinc-400">Connected Edges ({connectedEdges.length})</div>
                      <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                        {connectedEdges.slice(0, 10).map((e, i) => (
                          <div key={i} className="truncate rounded-lg bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-zinc-300">
                            {e.source.split(":").slice(-2, -1)[0] || e.source} <span className="text-amber-300">[{e.kind}]</span>{" "}
                            {e.target.split(":").slice(-2, -1)[0] || e.target}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-xs text-zinc-500">
                    <Crosshair className="mb-2 h-5 w-5 text-zinc-600" />
                    Select any node in the AST graph to view source code, edges, and 2-hop impact radius.
                  </div>
                )}
              </div>
            </div>

            {auditRes && (
              <div className="glass-strong animate-fade-up grid gap-4 rounded-2xl p-5 md:grid-cols-3">
                <div>
                  <div className="mb-2 font-mono text-xs font-semibold text-rose-300">Circular Dependencies ({auditRes.cycles.length})</div>
                  {auditRes.cycles.length ? (
                    <div className="space-y-1.5">
                      {auditRes.cycles.map((c, i) => (
                        <div key={i} className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-2.5 py-1.5 font-mono text-[11px] text-zinc-200">
                          {c.join(" -> ")}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">No circular dependency cycles detected.</p>
                  )}
                </div>
                <div>
                  <div className="mb-2 font-mono text-xs font-semibold text-amber-300">Coupling Hotspots ({auditRes.hotspots.length})</div>
                  <div className="space-y-1.5">
                    {auditRes.hotspots.map((h) => (
                      <div key={h.node_id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                        <span className="truncate font-mono text-zinc-200">{h.name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-400">in:{h.fan_in} / out:{h.fan_out}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 font-mono text-xs font-semibold text-sky-300">Unreferenced Symbols ({auditRes.orphan_symbols.length})</div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {auditRes.orphan_symbols.map((o) => (
                      <div key={o.node_id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                        <span className="truncate font-mono text-zinc-200">{o.name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-500">{o.file_path}:{o.start_line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {projectSummary && (
              <div className="glass-strong animate-fade-up space-y-4 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">
                    Whole-Project Architecture · <span className="font-mono text-amber-300">{projectSummary.repo_id}</span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(projectSummary.kind_counts).map(([k, v]) => (
                      <span key={k} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                        {k}: {v}
                      </span>
                    ))}
                    <button
                      onClick={() => downloadMarkdown(`${projectSummary.repo_id}-architecture.md`, projectSummary.summary)}
                      className="ml-2 flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                    >
                      <Download className="h-3 w-3" /> Export .md
                    </button>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200 md:col-span-2">{projectSummary.summary}</pre>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                    <div className="mb-2 text-xs font-semibold text-zinc-300">Central Hub Symbols</div>
                    <div className="space-y-1.5">
                      {projectSummary.hubs.map((h) => (
                        <div key={`${h.file_path}:${h.name}`} className="flex items-center justify-between text-xs">
                          <span className="truncate font-mono text-amber-300">{h.name}</span>
                          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{h.degree}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "chat" && (
          <section className="animate-fade-up space-y-4">
            <form onSubmit={handleQuery} className="glass flex flex-wrap gap-2 rounded-2xl p-2.5">
              <input
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
                placeholder="repo_id"
                className="w-48 rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-zinc-300 outline-none focus:border-amber-400/60"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about cross-file calls, bugs, or architecture..."
                className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/35 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
              <button disabled={busy} className="rounded-xl bg-amber-400 px-5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50">
                {busy ? "Tracing..." : "Run Agent"}
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {[...SAMPLE_QUERIES, ...history.filter((h) => !SAMPLE_QUERIES.includes(h))].slice(0, 6).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuery(q)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
                >
                  {q}
                </button>
              ))}
            </div>

            {queryRes && (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="glass-strong animate-fade-up space-y-4 rounded-2xl p-5 lg:col-span-2">
                  <span className="inline-block rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 font-mono text-[11px] text-amber-300">
                    {queryRes.intent}
                  </span>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-100">{queryRes.answer}</pre>
                  <div className="border-t border-white/10 pt-3">
                    <div className="mb-2 text-xs font-medium text-zinc-400">Grounded File Citations (Click to inspect in Explorer)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {queryRes.citations.map((c) => (
                        <button
                          key={c.node_id}
                          onClick={() => {
                            handleSelectNode(c);
                            setTab("explorer");
                          }}
                          className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-sky-300 hover:border-amber-400/40 hover:text-amber-300"
                        >
                          {c.file_path}:{c.start_line}-{c.end_line} · {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="glass animate-fade-up space-y-2.5 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-zinc-200">LangGraph Execution Trace</div>
                  {queryRes.trace.map((t, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-[11px] text-zinc-300">
                      {t}
                    </div>
                  ))}
                  {queryRes.subgraph?.nodes?.length > 0 && (
                    <div className="pt-2 font-mono text-[11px] text-zinc-400">
                      Subgraph: {queryRes.subgraph.nodes.length} nodes / {queryRes.subgraph.edges.length} edges
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "github" && (
          <section className="animate-fade-up space-y-5">
            <form onSubmit={handleGithubSummary} className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2.5">
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/35 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
              <div className="flex rounded-xl border border-white/10 bg-black/35 p-1">
                <button
                  type="button"
                  onClick={() => setGhKind("commits")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs ${ghKind === "commits" ? "bg-amber-400/20 text-amber-300" : "text-zinc-400"}`}
                >
                  <GitCommitHorizontal className="h-3.5 w-3.5" />
                  Commits
                </button>
                <button
                  type="button"
                  onClick={() => setGhKind("prs")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs ${ghKind === "prs" ? "bg-sky-400/20 text-sky-300" : "text-zinc-400"}`}
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  Pull Requests
                </button>
              </div>
              <select
                value={ghLimit}
                onChange={(e) => setGhLimit(Number(e.target.value))}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none"
              >
                <option value={5}>Last 5</option>
                <option value={10}>Last 10</option>
                <option value={15}>Last 15</option>
              </select>
              <button disabled={busy} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50">
                {busy ? "Summarizing..." : "Summarize"}
              </button>
            </form>

            {ghRes && (
              <div className="animate-fade-up space-y-4">
                <div className="glass-strong rounded-2xl p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">
                      Activity Summary · <span className="font-mono text-amber-300">{ghRes.repo}</span> ({ghRes.kind})
                    </h2>
                    <button
                      onClick={() => downloadMarkdown(`${ghRes.repo.replace("/", "_")}-${ghRes.kind}.md`, ghRes.summary)}
                      className="flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                    >
                      <Download className="h-3 w-3" /> Export .md
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
                      className="glass group flex flex-col justify-between rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-amber-400/35"
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

        {tab === "eval" && (
          <section className="animate-fade-up space-y-5">
            <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
              <p className="text-xs text-zinc-300">
                Benchmarks <span className="text-zinc-400">Baseline Vector-Only RAG</span> vs{" "}
                <span className="font-semibold text-amber-300">SyntaxGraph (Tree-sitter + Neo4j + Qdrant)</span> across Local Lookup, Multi-Hop Tracing, and Bug Localization.
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-zinc-300">
                  <input type="checkbox" checked={evalLive} onChange={(e) => setEvalLive(e.target.checked)} className="accent-amber-400" />
                  Live Neo4j/Qdrant
                </label>
                <button onClick={handleEval} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50">
                  <Play className="h-3.5 w-3.5" />
                  {busy ? "Evaluating..." : "Run Evaluation"}
                </button>
              </div>
            </div>

            {evalRes && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {evalRes.summary.map((row) => (
                    <div key={row.metric} className="glass-strong animate-fade-up rounded-2xl p-4">
                      <div className="text-[11px] text-zinc-400">{row.metric}</div>
                      <div className="mt-1.5 font-mono text-2xl font-semibold text-white">{row.proposed_syntaxgraph}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">Base: {row.baseline_vector_rag}</span>
                        <span className="font-mono font-semibold text-amber-300">{row.improvement}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="glass overflow-hidden rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Query</th>
                        <th className="px-4 py-3">Baseline Recall</th>
                        <th className="px-4 py-3">SyntaxGraph Recall</th>
                        <th className="px-4 py-3">Edge Accuracy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {evalRes.cases.map((c, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-400">{c.category}</td>
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

        {tab === "about" && <AboutSection />}
      </div>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-4 text-[11px] text-zinc-500">
        <span>SyntaxGraph Team</span>
        <span>Krishan Kant Sharma · Divanshu Tiwari · Sahil · Deepak Baghel</span>
      </footer>
    </main>
  );
}
