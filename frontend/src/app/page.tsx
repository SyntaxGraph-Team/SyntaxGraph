"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, Copy, Download, ExternalLink, Lock, LogOut, RefreshCw, Trash2, X } from "lucide-react";
import {
  api,
  type ASTNodeItem,
  type AuditResult,
  type EvalResult,
  type FlowchartResult,
  type GitHubSummaryResult,
  type GitHubUserRepo,
  type GraphData,
  type NodeDetail,
  type RepoInfo,
  type RepoSummaryResult,
} from "@/lib/api";
import { firebaseConfigured, getFirebaseAuth, getGithubUid, getStoredGithubToken, signOutUser } from "@/lib/firebase";
import { GraphView } from "@/components/GraphView";
import { LoginView } from "@/components/LoginView";
import { AboutSection } from "@/components/AboutSection";
import { CoffeeSection } from "@/components/CoffeeSection";
import { ChatView, type ChatTurn } from "@/components/ChatView";
import { FlowchartView } from "@/components/FlowchartView";

type TabId = "explorer" | "chat" | "flowchart" | "github" | "eval" | "about" | "coffee";

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: "explorer", label: "Code Map", hint: "Explore files & links" },
  { id: "chat", label: "Ask AI", hint: "Plain-English answers" },
  { id: "flowchart", label: "Flowchart", hint: "Mermaid & PNG diagram" },
  { id: "github", label: "Recent Updates", hint: "Commits & Pull Requests" },
  { id: "eval", label: "Benchmarks", hint: "Accuracy & speed" },
  { id: "about", label: "Team", hint: "SyntaxGraph Team" },
  { id: "coffee", label: "Buy Us a Coffee", hint: "Support the project" },
];

const METRIC_LABELS: Record<string, { title: string; subtitle: string; tint: string }> = {
  "Multi-Hop File Recall@K": { title: "Cross-File Accuracy", subtitle: "Finds related files across folders", tint: "clay-mint" },
  "Cross-File Call Tracing Accuracy": { title: "Connection Tracing", subtitle: "Follows who calls whom", tint: "clay-sky" },
  "Unresolved / Hallucination Rate": { title: "Wrong Symbol Rate", subtitle: "Fewer made-up references", tint: "clay-lavender" },
  "Commit Re-Indexing Latency": { title: "Update Speed", subtitle: "Refresh time after changes", tint: "clay-peach" },
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

function displayUserName(user: User | null): string {
  if (!user) return "Guest";
  return user.displayName || user.email?.split("@")[0] || "Developer";
}

function RingGauge({ value, color }: { value: number; color: string }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg viewBox="0 0 84 84" className="h-18 w-18 shrink-0 -rotate-90">
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="7" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
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
  const [ghToken, setGhToken] = useState<string | undefined>();
  const [health, setHealth] = useState<{ store_mode: string; llm_configured: boolean } | null>(null);
  const [tab, setTab] = useState<TabId>("explorer");

  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [ghRepos, setGhRepos] = useState<GitHubUserRepo[]>([]);
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

  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);

  const [ghKind, setGhKind] = useState<"commits" | "prs">("commits");
  const [ghLimit, setGhLimit] = useState(5);
  const [ghRes, setGhRes] = useState<GitHubSummaryResult | null>(null);

  const [evalRes, setEvalRes] = useState<EvalResult | null>(null);
  const [flowchartRes, setFlowchartRes] = useState<FlowchartResult | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => null);
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const loadUserRepos = async (u: User | null, tok?: string) => {
      if (!u) return;
      const gTok = getStoredGithubToken();
      const gUid = getGithubUid(u);
      setGhToken(gTok);
      if (gTok || gUid) {
        api.listGithubRepos(tok, gTok, gUid).then((r) => setGhRepos(r.repos)).catch(() => null);
      }
    };

    const onGhToken = () => {
      const u = auth.currentUser;
      if (u) u.getIdToken().then((tok) => loadUserRepos(u, tok));
    };
    window.addEventListener("sg-github-token", onGhToken);

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      const tok = u ? await u.getIdToken() : undefined;
      setToken(tok);
      setAuthReady(true);
      if (u) {
        api.listRepos(tok).then((r) => setRepos(r.repos)).catch(() => null);
        loadUserRepos(u, tok);
      }
    });
    return () => {
      window.removeEventListener("sg-github-token", onGhToken);
      unsub();
    };
  }, []);

  async function refreshRepos(tok = token) {
    try {
      const r = await api.listRepos(tok);
      setRepos(r.repos);
    } catch {
      // ignore
    }
  }

  async function refreshGithubRepos() {
    const gTok = ghToken || getStoredGithubToken();
    const gUid = getGithubUid(user);
    if (!gTok && !gUid) return;
    setGhToken(gTok);
    try {
      const r = await api.listGithubRepos(token, gTok, gUid);
      setGhRepos(r.repos);
    } catch (err) {
      setStatus(`Could not load GitHub repositories: ${(err as Error).message}`);
    }
  }

  async function runTask(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setStatus(`Could not complete: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function ingestByUrl(urlToIngest: string) {
    if (!urlToIngest.trim()) return;
    setRepoUrl(urlToIngest.trim());
    runTask(async () => {
      setStatus("Reading repository files and mapping how they connect...");
      const res = await api.ingest(urlToIngest.trim(), undefined, token, ghToken);
      setRepoId(res.repo_id);
      setSelectedNode(null);
      setSubgraphOverlay(null);
      setAuditRes(null);
      setStatus(`Done! Mapped ${res.files_parsed} files, ${res.nodes_indexed} code items, and ${res.edges_indexed} connections.`);
      setGraph(await api.graph(res.repo_id, token));
      await refreshRepos();
    });
  }

  function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    ingestByUrl(repoUrl);
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
      setStatus(`Opened ${targetId}: ${g.nodes.length} items and ${g.edges.length} connections.`);
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
      setStatus("Writing a clear summary of the whole project...");
      setProjectSummary(await api.summarizeRepo(repoId.trim(), token));
      setStatus("Project summary ready.");
    });
  }

  function handleAudit() {
    if (!repoId.trim()) return;
    runTask(async () => {
      setStatus("Checking project health...");
      const res = await api.audit(repoId.trim(), token);
      setAuditRes(res);
      setStatus(`Health check complete: ${res.cycles.length} circular loops, ${res.orphan_symbols.length} unused functions.`);
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

  function handleSendChat(promptText: string) {
    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: "user", text: promptText };
    setChatTurns((prev) => [...prev, userTurn]);
    runTask(async () => {
      const res = await api.query(repoId, promptText, token);
      const aiTurn: ChatTurn = { id: `a-${Date.now()}`, role: "assistant", text: res.answer, result: res };
      setChatTurns((prev) => [...prev, aiTurn]);
    });
  }

  function handleGithubSummary(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    runTask(async () => {
      setStatus(`Fetching recent ${ghKind === "commits" ? "commits" : "pull requests"}...`);
      setGhRes(await api.summarizeGithub(repoUrl.trim(), ghKind, ghLimit, token, ghToken));
      setStatus("");
    });
  }

  function handleEval() {
    runTask(async () => {
      setEvalRes(await api.eval(false, false, token));
    });
  }

  function handleFlowchart() {
    if (!repoId.trim()) return;
    runTask(async () => {
      setStatus("Building architecture flowchart...");
      setFlowchartRes(await api.flowchart(repoId.trim(), token));
      setStatus("Flowchart ready — export as Mermaid or PNG.");
    });
  }

  const activeGraph = subgraphOverlay ? subgraphOverlay.data : graph;
  const connectedEdges = selectedNode
    ? activeGraph.edges.filter((e) => e.source === selectedNode.node_id || e.target === selectedNode.node_id)
    : [];
  const userName = displayUserName(user);

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="clay px-7 py-4 text-sm font-semibold text-slate-700">Signing you in...</div>
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
    <div className="relative min-h-screen p-4 sm:p-6">
      <div className="clay-blob-1" />
      <div className="clay-blob-2" />

      {/* Mobile Compact Header */}
      <header className="clay mb-5 p-4 lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SyntaxGraph" className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Codebase Intelligence</p>
              <h1 className="text-lg font-bold text-slate-900">SyntaxGraph</h1>
            </div>
          </div>
          {firebaseConfigured && user ? (
            <button onClick={signOutUser} className="clay-btn-soft flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold">
              <span>{userName}</span>
              <LogOut className="h-3.5 w-3.5 text-slate-500" />
            </button>
          ) : (
            <button onClick={() => setDevUnlocked(false)} className="clay-btn-soft px-3.5 py-1.5 text-xs font-semibold">
              Sign Out
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${tab === id ? "clay-btn" : "clay-btn-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] items-start gap-7">
        {/* Spacious Clay Left Sidebar */}
        <aside className="clay sticky top-6 hidden w-72 shrink-0 flex-col justify-between gap-6 p-6 lg:flex">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="SyntaxGraph" className="h-11 w-11 rounded-2xl shadow-sm" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-500">Codebase Intelligence</p>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">SyntaxGraph</h1>
              </div>
            </div>

            {/* Sidebar Navigation */}
            <nav className="space-y-2">
              {TABS.map(({ id, label, hint }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`flex w-full flex-col items-start rounded-2xl px-4 py-3 text-left transition ${
                      active ? "clay-btn !rounded-2xl" : "text-slate-600 hover:bg-indigo-50/70 hover:text-slate-900"
                    }`}
                  >
                    <span className="text-sm font-bold">{label}</span>
                    <span className={`text-[11px] ${active ? "text-indigo-100" : "text-slate-400"}`}>{hint}</span>
                  </button>
                );
              })}
            </nav>

            {/* Saved Projects Inside Sidebar */}
            <div className="border-t border-indigo-100 pt-5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Saved Projects</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-600">
                  {repos.length}
                </span>
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {repos.length ? (
                  repos.map((r) => (
                    <div
                      key={r.repo_id}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition ${
                        repoId === r.repo_id ? "clay-lavender font-bold text-indigo-800" : "bg-slate-50 text-slate-700 hover:bg-indigo-50/60"
                      }`}
                    >
                      <button
                        onClick={() => {
                          handleLoadGraph(r.repo_id);
                          setTab("explorer");
                        }}
                        className="min-w-0 flex-1 truncate text-left font-mono text-[11px]"
                      >
                        {r.repo_id}
                      </button>
                      <button
                        onClick={() => handleDeleteRepo(r.repo_id)}
                        aria-label={`Delete ${r.repo_id}`}
                        className="ml-2 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No saved projects yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* User Profile & Status Card */}
          <div className="space-y-3 border-t border-indigo-100 pt-5">
            {health && (
              <div className="clay-mint flex items-center gap-2 !rounded-2xl px-3.5 py-2 text-xs font-semibold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {health.store_mode === "neo4j+qdrant" ? "Cloud Engine Ready" : "Local Mode"}
              </div>
            )}

            <div className="clay-well flex items-center justify-between gap-2.5 !rounded-2xl p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={userName} className="h-9 w-9 shrink-0 rounded-full border-2 border-white object-cover shadow-sm" />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
                    {userName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-900">{userName}</div>
                  <div className="text-[10px] font-medium text-slate-500">Signed in</div>
                </div>
              </div>

              <button
                onClick={() => (firebaseConfigured && user ? signOutUser() : setDevUnlocked(false))}
                title="Sign Out"
                className="clay-btn-soft p-2 text-slate-500 hover:text-rose-600"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Uncrowded Workspace */}
        <main className="min-w-0 flex-1 space-y-7">
          {status && (
            <div className="clay-mint animate-tab flex items-center justify-between !rounded-2xl px-5 py-3.5 text-xs font-semibold text-emerald-950">
              <span>{status}</span>
              <button onClick={() => setStatus("")} aria-label="Dismiss status" className="text-emerald-700 hover:text-emerald-950">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* TAB 1: CODE MAP */}
          {tab === "explorer" && (
            <section key="explorer" className="animate-tab space-y-7">
              {/* GitHub Connected Repos Picker */}
              {ghRepos.length > 0 && (
                <div className="clay p-6 sm:p-7">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Your GitHub Repositories</h2>
                      <p className="text-xs text-slate-500">Click any repository to open and map it right away.</p>
                    </div>
                    <button type="button" onClick={refreshGithubRepos} className="clay-btn-soft flex items-center gap-1.5 px-4 py-2 text-xs font-semibold">
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </button>
                  </div>
                  <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                    {ghRepos.slice(0, 8).map((r) => (
                      <button
                        key={r.full_name}
                        type="button"
                        disabled={busy}
                        onClick={() => ingestByUrl(r.url)}
                        className="clay-card p-4 text-left disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">{r.name}</span>
                          {r.private && <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{r.full_name}</div>
                        <div className="mt-3 flex items-center justify-between text-[11px]">
                          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-semibold text-indigo-700">{r.language}</span>
                          <span className="font-semibold text-indigo-600">Map repo -&gt;</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Connect Card */}
              <form onSubmit={handleIngest} className="clay space-y-5 p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="clay-sky inline-block px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800">
                      Code Map
                    </span>
                    <h2 className="mt-2.5 text-2xl font-bold text-slate-900">
                      {ghRepos.length ? "Or paste any public GitHub link" : "Connect a GitHub repository"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      We read the files and map how classes and functions call each other.
                    </p>
                  </div>

                  {/* Clean Compact Stats */}
                  <div className="flex flex-wrap gap-3">
                    <div className="clay-sky px-4 py-2.5 text-center">
                      <div className="text-lg font-bold text-slate-900">{activeGraph.nodes.length}</div>
                      <div className="text-[10px] font-semibold text-slate-600">Items</div>
                    </div>
                    <div className="clay-lavender px-4 py-2.5 text-center">
                      <div className="text-lg font-bold text-indigo-700">{activeGraph.edges.length}</div>
                      <div className="text-[10px] font-semibold text-slate-600">Links</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="clay-well min-w-[260px] flex-1 px-4 py-3 text-sm text-slate-800 outline-none"
                  />
                  <input
                    value={repoId}
                    onChange={(e) => setRepoId(e.target.value)}
                    placeholder="Project ID"
                    className="clay-well w-52 px-4 py-3 font-mono text-xs text-slate-700 outline-none"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button disabled={busy} className="clay-btn inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold disabled:opacity-50">
                    {busy ? "Working..." : "Map This Repo"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => handleLoadGraph()} disabled={busy} className="clay-btn-soft px-5 py-2.5 text-xs font-semibold">
                    Open Saved
                  </button>
                  <button type="button" onClick={handleSummarizeProject} disabled={busy} className="clay-btn-mint px-5 py-2.5 text-xs font-semibold">
                    Project Summary
                  </button>
                  <button type="button" onClick={handleAudit} disabled={busy} className="clay-btn-soft px-5 py-2.5 text-xs font-semibold text-rose-700">
                    Check Code Health
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("flowchart");
                      handleFlowchart();
                    }}
                    disabled={busy}
                    className="clay-btn-soft px-5 py-2.5 text-xs font-semibold text-indigo-700"
                  >
                    Flowchart
                  </button>
                </div>
              </form>

              {/* Map + Inspector */}
              <div className="grid gap-6 xl:grid-cols-3">
                <div className="space-y-4 xl:col-span-2">
                  <form onSubmit={handleTracePath} className="clay flex flex-wrap items-center gap-2.5 px-5 py-3">
                    <span className="text-xs font-bold text-slate-700">Find Connection:</span>
                    <input
                      value={pathSrc}
                      onChange={(e) => setPathSrc(e.target.value)}
                      placeholder="Start function"
                      className="clay-well w-32 flex-1 px-3.5 py-2 font-mono text-xs text-slate-800 outline-none"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      value={pathTgt}
                      onChange={(e) => setPathTgt(e.target.value)}
                      placeholder="Target function"
                      className="clay-well w-32 flex-1 px-3.5 py-2 font-mono text-xs text-slate-800 outline-none"
                    />
                    <button disabled={busy} className="clay-btn px-4 py-2 text-xs font-semibold">
                      Trace
                    </button>
                  </form>

                  {subgraphOverlay && (
                    <div className="clay-peach flex items-center justify-between !rounded-2xl px-4 py-2.5 text-xs font-semibold text-amber-900">
                      <span>{subgraphOverlay.label}</span>
                      <button onClick={() => setSubgraphOverlay(null)} className="underline">
                        Show Full Map
                      </button>
                    </div>
                  )}

                  <GraphView data={activeGraph} selectedId={selectedNode?.node_id} onSelectNode={handleSelectNode} />
                </div>

                <div className="clay p-6">
                  {selectedNode ? (
                    <div key={selectedNode.node_id} className="animate-slide-right space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="clay-lavender px-3 py-1 text-[11px] font-bold text-indigo-700">{selectedNode.kind}</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          Lines {selectedNode.start_line}-{selectedNode.end_line}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{selectedNode.name}</h3>
                        <p className="mt-0.5 truncate font-mono text-xs text-indigo-600">{selectedNode.file_path}</p>
                      </div>
                      {(selectedNode.raw_code || selectedNode.signature) && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => handleCopyCode(selectedNode.raw_code || selectedNode.signature || "")}
                            className="clay-btn-soft absolute top-2 right-2 px-2.5 py-1 text-[10px] font-semibold"
                          >
                            {copied ? "Copied" : <Copy className="h-3 w-3" />}
                          </button>
                          <pre className="clay-well max-h-48 overflow-auto p-3.5 font-mono text-[11px] leading-relaxed text-slate-800">
                            {selectedNode.raw_code || selectedNode.signature}
                          </pre>
                        </div>
                      )}
                      <button onClick={() => handleBlastRadius(selectedNode)} disabled={busy} className="clay-btn w-full py-2.5 text-xs font-semibold">
                        See Connected Code
                      </button>
                      <div className="border-t border-indigo-100 pt-3">
                        <div className="mb-2 text-[11px] font-bold text-slate-600">Direct Links ({connectedEdges.length})</div>
                        <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                          {connectedEdges.slice(0, 10).map((e, i) => (
                            <div key={i} className="clay-well truncate !rounded-xl px-3 py-1.5 font-mono text-[10px] text-slate-700">
                              {e.source.split(":").slice(-2, -1)[0] || e.source}{" "}
                              <span className="font-bold text-indigo-600">[{e.kind}]</span>{" "}
                              {e.target.split(":").slice(-2, -1)[0] || e.target}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                      <div className="text-sm font-bold text-slate-800">Code Inspector</div>
                      <p className="mt-2 max-w-[230px] text-xs leading-6 text-slate-500">
                        Click any dot on the map to read its code and see which parts of the project depend on it.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {auditRes && (
                <div className="clay animate-tab grid gap-6 p-7 md:grid-cols-3">
                  <div>
                    <div className="mb-3 text-xs font-bold text-rose-700">Circular Loops ({auditRes.cycles.length})</div>
                    {auditRes.cycles.length ? (
                      <div className="space-y-2">
                        {auditRes.cycles.map((c, i) => (
                          <div key={i} className="clay-well !rounded-xl px-3 py-2 font-mono text-[11px] text-rose-800">
                            {c.join(" -> ")}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No circular loops found.</p>
                    )}
                  </div>
                  <div>
                    <div className="mb-3 text-xs font-bold text-indigo-700">Most Connected Code ({auditRes.hotspots.length})</div>
                    <div className="space-y-2">
                      {auditRes.hotspots.map((h) => (
                        <div key={h.node_id} className="clay-well flex items-center justify-between !rounded-xl px-3 py-2 text-xs">
                          <span className="truncate font-mono font-semibold text-slate-800">{h.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">{h.fan_in} in / {h.fan_out} out</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 text-xs font-bold text-sky-700">Unused Functions ({auditRes.orphan_symbols.length})</div>
                    <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                      {auditRes.orphan_symbols.map((o) => (
                        <div key={o.node_id} className="clay-well flex items-center justify-between !rounded-xl px-3 py-2 text-xs">
                          <span className="truncate font-mono font-semibold text-slate-800">{o.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">{o.file_path}:{o.start_line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {projectSummary && (
                <div className="clay animate-tab space-y-4 p-7 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      Project Summary · <span className="font-mono text-indigo-600">{projectSummary.repo_id}</span>
                    </h3>
                    <button
                      onClick={() => downloadMarkdown(`${projectSummary.repo_id}-overview.md`, projectSummary.summary)}
                      className="clay-btn-soft flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" /> Save Report
                    </button>
                  </div>
                  <div className="grid gap-6 md:grid-cols-3">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700 md:col-span-2">{projectSummary.summary}</pre>
                    <div className="clay-lavender p-5">
                      <div className="mb-3 text-xs font-bold text-indigo-900">Key Parts</div>
                      <div className="space-y-2.5">
                        {projectSummary.hubs.map((h) => (
                          <div key={`${h.file_path}:${h.name}`} className="flex items-center justify-between text-xs">
                            <span className="truncate font-mono font-semibold text-indigo-700">{h.name}</span>
                            <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 font-mono text-[10px] text-slate-600 shadow-sm">{h.degree} links</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: ASK AI (GEMINI / CHATGPT FORMAT) */}
          {tab === "chat" && (
            <ChatView
              repoId={repoId}
              onRepoIdChange={setRepoId}
              turns={chatTurns}
              busy={busy}
              onSend={handleSendChat}
              onClear={() => setChatTurns([])}
              onInspectCitation={(c) => {
                handleSelectNode(c);
                setTab("explorer");
              }}
            />
          )}

          {/* TAB 2B: FLOWCHART */}
          {tab === "flowchart" && (
            <FlowchartView
              repoId={repoId}
              onRepoIdChange={setRepoId}
              data={flowchartRes}
              busy={busy}
              onGenerate={handleFlowchart}
            />
          )}

          {/* TAB 3: RECENT UPDATES */}
          {tab === "github" && (
            <section key="github" className="animate-tab space-y-7">
              <div className="clay p-7 sm:p-8">
                <span className="clay-peach inline-block px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  Recent Updates
                </span>
                <h2 className="mt-2.5 text-2xl font-bold text-slate-900">Summarize recent commits &amp; pull requests</h2>

                {ghRepos.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Pick yours:</span>
                    {ghRepos.slice(0, 6).map((r) => (
                      <button
                        key={r.full_name}
                        type="button"
                        onClick={() => setRepoUrl(r.url)}
                        className={`px-3.5 py-1.5 text-xs font-semibold transition ${
                          repoUrl === r.url ? "clay-btn" : "clay-btn-soft"
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleGithubSummary} className="mt-5 flex flex-wrap items-center gap-3">
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="clay-well min-w-[260px] flex-1 px-4 py-3 text-sm text-slate-800 outline-none"
                  />
                  <div className="clay-well flex rounded-full p-1">
                    <button
                      type="button"
                      onClick={() => setGhKind("commits")}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${ghKind === "commits" ? "clay-btn" : "text-slate-600"}`}
                    >
                      Commits
                    </button>
                    <button
                      type="button"
                      onClick={() => setGhKind("prs")}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${ghKind === "prs" ? "clay-btn" : "text-slate-600"}`}
                    >
                      Pull Requests
                    </button>
                  </div>
                  <select
                    value={ghLimit}
                    onChange={(e) => setGhLimit(Number(e.target.value))}
                    className="clay-well px-4 py-3 text-xs font-semibold text-slate-700 outline-none"
                  >
                    <option value={5}>Last 5</option>
                    <option value={10}>Last 10</option>
                    <option value={15}>Last 15</option>
                  </select>
                  <button disabled={busy} className="clay-btn px-6 py-3 text-xs font-semibold disabled:opacity-50">
                    {busy ? "Summarizing..." : "Summarize"}
                  </button>
                </form>
              </div>

              {ghRes && (
                <div className="animate-tab space-y-5">
                  <div className="clay p-7 sm:p-8">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-bold text-slate-900">
                        Summary of {ghRes.kind === "commits" ? "Recent Commits" : "Pull Requests"} ·{" "}
                        <span className="font-mono text-indigo-600">{ghRes.repo}</span>
                      </h3>
                      <button
                        onClick={() => downloadMarkdown(`${ghRes.repo.replace("/", "_")}-${ghRes.kind}.md`, ghRes.summary)}
                        className="clay-btn-soft flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold"
                      >
                        <Download className="h-3.5 w-3.5" /> Save Summary
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">{ghRes.summary}</pre>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {ghRes.items.map((item) => (
                      <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="clay-card group flex flex-col justify-between p-5">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-indigo-600">{item.id}</span>
                            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-indigo-700">
                              {item.state}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600">{item.title}</p>
                          {item.body && <p className="line-clamp-2 text-xs leading-6 text-slate-500">{item.body}</p>}
                        </div>
                        <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-slate-400">
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
            <section key="eval" className="animate-tab space-y-7">
              <div className="clay flex flex-wrap items-center justify-between gap-4 p-7 sm:p-8">
                <div>
                  <span className="clay-sky inline-block px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800">
                    Benchmarks
                  </span>
                  <h2 className="mt-2.5 text-2xl font-bold text-slate-900">SyntaxGraph vs Standard Search</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Runs 10 real multi-file coding questions to measure accuracy, connection tracing, and update speed.
                  </p>
                </div>
                <button onClick={handleEval} disabled={busy} className="clay-btn px-6 py-3 text-xs font-semibold disabled:opacity-50">
                  {busy ? "Running Test..." : "Run Benchmark"}
                </button>
              </div>

              {evalRes && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {evalRes.summary.map((row) => {
                      const info = METRIC_LABELS[row.metric] || { title: row.metric, subtitle: "", tint: "clay-sky" };
                      const isPct = row.proposed_syntaxgraph.includes("%");
                      const val = pctValue(row.proposed_syntaxgraph);
                      return (
                        <div key={row.metric} className={`${info.tint} clay-card flex items-center justify-between gap-3 p-5`}>
                          <div>
                            <div className="text-xs font-bold text-slate-900">{info.title}</div>
                            <div className="mt-0.5 text-[11px] text-slate-600">{info.subtitle}</div>
                            <div className="mt-3 font-mono text-2xl font-bold text-slate-900">{row.proposed_syntaxgraph}</div>
                            <div className="mt-1 text-[11px] text-slate-600">
                              Standard: {row.baseline_vector_rag} · <span className="font-bold text-indigo-700">{row.improvement}</span>
                            </div>
                          </div>
                          {isPct && <RingGauge value={val} color={row.metric.includes("Hallucination") ? "#10b981" : "#6366f1"} />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="clay overflow-hidden p-3">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-indigo-100 text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Question Type</th>
                          <th className="px-4 py-3">Test Question</th>
                          <th className="px-4 py-3">Standard Search</th>
                          <th className="px-4 py-3">SyntaxGraph</th>
                          <th className="px-4 py-3">Connection Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-50">
                        {evalRes.cases.map((c, idx) => (
                          <tr key={idx} className="hover:bg-white/60">
                            <td className="px-4 py-3 font-semibold text-slate-600">
                              {c.category === "LOCAL_SYMBOL_LOOKUP"
                                ? "Quick Lookup"
                                : c.category === "CROSS_FILE_DEPENDENCY_TRACE"
                                ? "Cross-File Trace"
                                : "Bug Finding"}
                            </td>
                            <td className="px-4 py-3 text-slate-800">{c.query}</td>
                            <td className="px-4 py-3 font-mono text-slate-500">{c.baseline_recall}%</td>
                            <td className="px-4 py-3 font-mono font-bold text-emerald-700">{c.syntaxgraph_recall}%</td>
                            <td className="px-4 py-3 font-mono font-bold text-indigo-700">{c.syntaxgraph_edge_acc}%</td>
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

          {/* TAB 6: BUY US A COFFEE */}
          {tab === "coffee" && <CoffeeSection />}

          <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 pb-4 text-xs font-medium text-slate-500">
            <span>SyntaxGraph Team</span>
            <span>Krishan Kant Sharma · Divanshu Tiwari · Sahil · Deepak Baghel</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
