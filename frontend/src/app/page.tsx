"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  Activity,
  Crosshair,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  LogOut,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api, type ASTNodeItem, type EvalResult, type GitHubSummaryResult, type GraphData, type QueryResult, type RepoSummaryResult } from "@/lib/api";
import { firebaseConfigured, getFirebaseAuth, signOutUser } from "@/lib/firebase";
import { GraphView } from "@/components/GraphView";
import { LoginView } from "@/components/LoginView";

type TabId = "explorer" | "chat" | "github" | "eval";

const SAMPLE_QUERIES = [
  "Trace cross-file dependencies from main entrypoints",
  "Where are webhook signatures or auth tokens verified?",
  "Locate potential error handling or validation bugs",
];

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [token, setToken] = useState<string | undefined>();
  const [health, setHealth] = useState<{ store_mode: string; llm_configured: boolean } | null>(null);
  const [tab, setTab] = useState<TabId>("explorer");

  const [repoUrl, setRepoUrl] = useState("https://github.com/SyntaxGraph-Team/SyntaxGraph");
  const [repoId, setRepoId] = useState("SyntaxGraph-Team_SyntaxGraph");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<ASTNodeItem | null>(null);
  const [impactGraph, setImpactGraph] = useState<GraphData | null>(null);
  const [projectSummary, setProjectSummary] = useState<RepoSummaryResult | null>(null);

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
      setToken(u ? await u.getIdToken() : undefined);
      setAuthReady(true);
    });
  }, []);

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
      setStatus("Cloning & parsing AST into Neo4j + Qdrant...");
      const res = await api.ingest(repoUrl.trim(), undefined, token);
      setRepoId(res.repo_id);
      setSelectedNode(null);
      setImpactGraph(null);
      setStatus(`Indexed ${res.files_parsed} files · ${res.nodes_indexed} AST nodes · ${res.edges_indexed} edges (${res.latency_ms} ms)`);
      setGraph(await api.graph(res.repo_id, token));
    });
  }

  function handleLoadGraph() {
    if (!repoId.trim()) return;
    runTask(async () => {
      const g = await api.graph(repoId.trim(), token);
      setGraph(g);
      setSelectedNode(null);
      setImpactGraph(null);
      setStatus(`Loaded ${g.nodes.length} nodes & ${g.edges.length} edges for ${repoId}`);
    });
  }

  function handleSummarizeProject() {
    if (!repoId.trim()) return;
    runTask(async () => {
      setStatus("Generating whole-project architectural summary...");
      setProjectSummary(await api.summarizeRepo(repoId.trim(), token));
      setStatus("Project architecture summary ready.");
    });
  }

  function handleBlastRadius(node: ASTNodeItem) {
    runTask(async () => {
      const imp = await api.impact(repoId, node.node_id, 2, token);
      setImpactGraph(imp);
      setStatus(`2-hop blast radius for ${node.name}: ${imp.nodes.length} impacted nodes, ${imp.edges.length} edges`);
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
      setStatus(`Fetching & summarizing recent ${ghKind === "commits" ? "commits" : "pull requests"}...`);
      setGhRes(await api.summarizeGithub(repoUrl.trim(), ghKind, ghLimit, token));
      setStatus("");
    });
  }

  function handleEval() {
    runTask(async () => {
      setEvalRes(await api.eval(evalLive, false, token));
    });
  }

  const activeGraph = impactGraph ?? graph;
  const connectedEdges = selectedNode
    ? activeGraph.edges.filter((e) => e.source === selectedNode.node_id || e.target === selectedNode.node_id)
    : [];

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="glass rounded-2xl px-6 py-4 text-xs text-zinc-300">Verifying session...</div>
      </main>
    );
  }

  if (firebaseConfigured ? !user : !devUnlocked) {
    return <LoginView onDemoEnter={() => setDevUnlocked(true)} />;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Glass Header */}
      <header className="glass-strong mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-sky-400/20 border border-emerald-400/30 text-emerald-300">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">SyntaxGraph</h1>
            <p className="text-xs text-zinc-400">AST Property Graph · Hybrid GraphRAG · GitHub Intelligence</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {health && (
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300">
              <span className={`h-2 w-2 rounded-full ${health.store_mode === "neo4j+qdrant" ? "bg-emerald-400" : "bg-amber-400"}`} />
              {health.store_mode} · {health.llm_configured ? "Gemini Ready" : "Offline Summary"}
            </span>
          )}
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] text-emerald-300">
            {repoId}
          </span>

          {firebaseConfigured && user ? (
            <button onClick={signOutUser} className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {user.email || user.displayName}
              <LogOut className="ml-1 h-3.5 w-3.5 text-zinc-400" />
            </button>
          ) : (
            <button onClick={() => setDevUnlocked(false)} className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200">
              Dev Mode · Lock
            </button>
          )}
        </div>
      </header>

      {/* Glass Tab Bar */}
      <nav className="glass mb-6 inline-flex flex-wrap gap-1.5 rounded-2xl p-1.5">
        {[
          { id: "explorer", label: "AST Explorer & Summary", icon: Layers },
          { id: "chat", label: "Hybrid GraphRAG Chat", icon: Search },
          { id: "github", label: "Commits & PR Summarizer", icon: GitPullRequest },
          { id: "eval", label: "Evaluation Benchmark", icon: Activity },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as TabId)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition ${
              tab === id
                ? "bg-gradient-to-r from-emerald-500/25 to-sky-500/20 text-emerald-300 border border-emerald-400/35 shadow-sm"
                : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {status && (
        <div className="glass mb-5 flex items-center justify-between rounded-xl border-emerald-400/20 px-4 py-2.5 text-xs text-zinc-200">
          <span>{status}</span>
          <button onClick={() => setStatus("")} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* TAB 1: AST EXPLORER & WHOLE PROJECT SUMMARY */}
      {tab === "explorer" && (
        <section className="space-y-5">
          <form onSubmit={handleIngest} className="glass flex flex-wrap gap-2.5 rounded-2xl p-3">
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="GitHub repository URL (https://github.com/owner/repo)"
              className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/35 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60"
            />
            <input
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              placeholder="repo_id"
              className="w-52 rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-zinc-300 outline-none focus:border-emerald-400/60"
            />
            <button disabled={busy} className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">
              {busy ? "Working..." : "Ingest Repo"}
            </button>
            <button type="button" onClick={handleLoadGraph} disabled={busy} className="rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10">
              Load Graph
            </button>
            <button type="button" onClick={handleSummarizeProject} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 px-3.5 py-2 text-xs font-medium text-sky-300 hover:bg-sky-500/25">
              <Sparkles className="h-3.5 w-3.5" />
              Summarize Project
            </button>
          </form>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              {impactGraph && (
                <div className="glass flex items-center justify-between rounded-xl px-3.5 py-2 text-xs text-amber-300">
                  <span>Showing 2-hop Blast Radius subgraph ({impactGraph.nodes.length} nodes)</span>
                  <button onClick={() => setImpactGraph(null)} className="underline hover:text-amber-200">Reset to Full Graph</button>
                </div>
              )}
              <GraphView data={activeGraph} selectedId={selectedNode?.node_id} onSelectNode={setSelectedNode} />
            </div>

            <div className="glass flex flex-col justify-between rounded-2xl p-4">
              {selectedNode ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">{selectedNode.kind}</span>
                    <span className="font-mono text-[11px] text-zinc-400">L{selectedNode.start_line}-{selectedNode.end_line}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{selectedNode.name}</h3>
                  <p className="flex items-center gap-1.5 font-mono text-xs text-sky-300">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                    {selectedNode.file_path}
                  </p>
                  {selectedNode.signature && (
                    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-2.5 font-mono text-[11px] text-zinc-300">
                      {selectedNode.signature}
                    </pre>
                  )}
                  <button
                    onClick={() => handleBlastRadius(selectedNode)}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    Analyze 2-Hop Blast Radius
                  </button>
                  <div className="border-t border-white/10 pt-2.5">
                    <div className="mb-1.5 text-[11px] font-medium text-zinc-400">Connected Edges ({connectedEdges.length})</div>
                    <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                      {connectedEdges.slice(0, 12).map((e, i) => (
                        <div key={i} className="truncate rounded-lg bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-zinc-300">
                          {e.source.split(":").slice(-2, -1)[0] || e.source} <span className="text-emerald-400">[{e.kind}]</span>{" "}
                          {e.target.split(":").slice(-2, -1)[0] || e.target}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-xs text-zinc-500">
                  <Crosshair className="mb-2 h-6 w-6 text-zinc-600" />
                  Click any AST node in the graph to inspect its signature, edges, and 2-hop impact blast radius.
                </div>
              )}
            </div>
          </div>

          {projectSummary && (
            <div className="glass-strong space-y-4 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                  Whole-Project Architecture Summary · <span className="font-mono text-emerald-300">{projectSummary.repo_id}</span>
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(projectSummary.kind_counts).map(([k, v]) => (
                    <span key={k} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-zinc-300">
                      {k}: {v}
                    </span>
                  ))}
                  {Object.entries(projectSummary.edge_counts).map(([k, v]) => (
                    <span key={k} className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-0.5 text-[11px] text-sky-300">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200 md:col-span-2">{projectSummary.summary}</pre>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                  <div className="mb-2 text-xs font-semibold text-zinc-300">Central Hub Symbols</div>
                  <div className="space-y-1.5">
                    {projectSummary.hubs.map((h) => (
                      <div key={`${h.file_path}:${h.name}`} className="flex items-center justify-between text-xs">
                        <span className="truncate font-mono text-emerald-300">{h.name}</span>
                        <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400">{h.degree} links</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: HYBRID GRAPHRAG CHAT */}
      {tab === "chat" && (
        <section className="space-y-4">
          <form onSubmit={handleQuery} className="glass flex flex-wrap gap-2.5 rounded-2xl p-3">
            <input
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              placeholder="repo_id"
              className="w-48 rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-zinc-300 outline-none focus:border-emerald-400/60"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about cross-file calls, bugs, or architecture..."
              className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/35 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60"
            />
            <button disabled={busy} className="rounded-xl bg-emerald-400 px-5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">
              {busy ? "Tracing..." : "Run Agent"}
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {[...SAMPLE_QUERIES, ...history.filter((h) => !SAMPLE_QUERIES.includes(h))].slice(0, 6).map((q) => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 hover:border-emerald-400/40 hover:text-emerald-300"
              >
                {q}
              </button>
            ))}
          </div>

          {queryRes && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="glass-strong space-y-4 rounded-2xl p-5 lg:col-span-2">
                <span className="inline-block rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-0.5 text-[11px] font-semibold text-emerald-300">
                  {queryRes.intent}
                </span>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-100">{queryRes.answer}</pre>
                <div className="border-t border-white/10 pt-3">
                  <div className="mb-2 text-xs font-medium text-zinc-400">Grounded File Citations</div>
                  <div className="flex flex-wrap gap-1.5">
                    {queryRes.citations.map((c) => (
                      <span key={c.node_id} className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-sky-300">
                        {c.file_path}:{c.start_line}-{c.end_line} · {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="glass space-y-2.5 rounded-2xl p-4">
                <div className="text-xs font-semibold text-zinc-200">LangGraph Execution Trace</div>
                {queryRes.trace.map((t, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-[11px] text-zinc-300">
                    {t}
                  </div>
                ))}
                {queryRes.subgraph?.nodes?.length > 0 && (
                  <div className="pt-2 text-[11px] text-zinc-400">
                    Retrieved subgraph: {queryRes.subgraph.nodes.length} AST nodes, {queryRes.subgraph.edges.length} edges.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: GITHUB COMMITS & PRS SUMMARIZER */}
      {tab === "github" && (
        <section className="space-y-5">
          <form onSubmit={handleGithubSummary} className="glass flex flex-wrap items-center gap-2.5 rounded-2xl p-3">
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/35 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/60"
            />
            <div className="flex rounded-xl border border-white/10 bg-black/35 p-1">
              <button
                type="button"
                onClick={() => setGhKind("commits")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs ${ghKind === "commits" ? "bg-emerald-400/20 text-emerald-300" : "text-zinc-400"}`}
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
            <button disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">
              <Sparkles className="h-3.5 w-3.5" />
              {busy ? "Summarizing..." : "Summarize"}
            </button>
          </form>

          {ghRes && (
            <div className="space-y-4">
              <div className="glass-strong rounded-2xl p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">
                    AI Summary · <span className="font-mono text-emerald-300">{ghRes.repo}</span> ({ghRes.kind})
                  </h2>
                  <span className="text-xs text-zinc-400">{ghRes.items.length} items analyzed</span>
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
                    className="glass group flex flex-col justify-between rounded-2xl p-4 transition hover:border-emerald-400/40"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-emerald-300">{item.id}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase text-zinc-300">
                          {item.state}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-zinc-100 group-hover:text-emerald-300">{item.title}</p>
                      {item.body && <p className="line-clamp-2 text-xs text-zinc-400">{item.body}</p>}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
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

      {/* TAB 4: EVALUATION BENCHMARK */}
      {tab === "eval" && (
        <section className="space-y-5">
          <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <p className="text-xs text-zinc-300">
              Benchmarks <span className="text-zinc-400">Baseline Vector-Only RAG</span> vs{" "}
              <span className="font-semibold text-emerald-300">SyntaxGraph (Tree-sitter + Neo4j + Qdrant)</span> across Local Lookup, Multi-Hop Tracing, and Bug Localization.
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-zinc-300">
                <input type="checkbox" checked={evalLive} onChange={(e) => setEvalLive(e.target.checked)} className="accent-emerald-400" />
                Live Neo4j/Qdrant
              </label>
              <button onClick={handleEval} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">
                <Play className="h-3.5 w-3.5" />
                {busy ? "Evaluating..." : "Run Evaluation"}
              </button>
            </div>
          </div>

          {evalRes && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {evalRes.summary.map((row) => (
                  <div key={row.metric} className="glass-strong rounded-2xl p-4">
                    <div className="text-[11px] text-zinc-400">{row.metric}</div>
                    <div className="mt-1.5 text-2xl font-bold text-emerald-300">{row.proposed_syntaxgraph}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">Base: {row.baseline_vector_rag}</span>
                      <span className="font-semibold text-amber-300">{row.improvement}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="glass overflow-hidden rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 bg-white/[0.04] text-zinc-400">
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
                        <td className="px-4 py-2.5 text-zinc-400">{c.baseline_recall}%</td>
                        <td className="px-4 py-2.5 font-semibold text-emerald-300">{c.syntaxgraph_recall}%</td>
                        <td className="px-4 py-2.5 font-semibold text-sky-300">{c.syntaxgraph_edge_acc}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
