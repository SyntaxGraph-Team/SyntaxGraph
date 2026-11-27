"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Activity, GitBranch, LogOut, Play, Search, ShieldCheck } from "lucide-react";
import { api, type EvalResult, type GraphData, type QueryResult } from "@/lib/api";
import { firebaseConfigured, getFirebaseAuth, signInProvider, signOutUser } from "@/lib/firebase";
import { GraphView } from "@/components/GraphView";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [tab, setTab] = useState<"explorer" | "chat" | "eval">("explorer");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoId, setRepoId] = useState("eval_benchmark_repo");
  const [status, setStatus] = useState("");
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [query, setQuery] = useState("Trace the full call chain from handle_checkout down to accounting");
  const [queryRes, setQueryRes] = useState<QueryResult | null>(null);
  const [evalRes, setEvalRes] = useState<EvalResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setToken(u ? await u.getIdToken() : undefined);
    });
  }, []);

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setBusy(true);
    setStatus("Parsing AST & indexing into Neo4j + Qdrant...");
    try {
      const res = await api.ingest(repoUrl.trim(), undefined, token);
      setRepoId(res.repo_id);
      setStatus(`Indexed ${res.files_parsed} files, ${res.nodes_indexed} nodes, ${res.edges_indexed} edges in ${res.latency_ms}ms`);
      setGraph(await api.graph(res.repo_id, token));
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      setQueryRes(await api.query(repoId, query, token));
    } catch (err) {
      setStatus(`Query failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleEval() {
    setBusy(true);
    try {
      setEvalRes(await api.eval(false, false, token));
    } catch (err) {
      setStatus(`Eval failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">SyntaxGraph</h1>
          <p className="text-xs text-zinc-400">AST Property Graph (Tree-sitter + Neo4j) &amp; Hybrid GraphRAG (Qdrant + LangGraph + Gemini)</p>
        </div>
        <div className="flex items-center gap-2">
          {firebaseConfigured ? (
            user ? (
              <button onClick={signOutUser} className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {user.email || user.displayName}
                <LogOut className="ml-1 h-3.5 w-3.5 text-zinc-400" />
              </button>
            ) : (
              <>
                <button onClick={() => signInProvider("google")} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900">
                  Google Sign-In
                </button>
                <button onClick={() => signInProvider("github")} className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-white">
                  GitHub Sign-In
                </button>
              </>
            )
          ) : (
            <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">Dev Mode (Firebase Optional)</span>
          )}
        </div>
      </header>

      <nav className="mb-6 flex gap-2">
        {[
          { id: "explorer", label: "Repo & AST Graph", icon: GitBranch },
          { id: "chat", label: "Hybrid GraphRAG Query", icon: Search },
          { id: "eval", label: "Evaluation Benchmark", icon: Activity },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === id ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40" : "border border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {status && <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">{status}</div>}

      {tab === "explorer" && (
        <section className="space-y-4">
          <form onSubmit={handleIngest} className="flex gap-2">
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="GitHub repo URL (https://github.com/org/repo) or local path"
              className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <button disabled={busy} className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
              {busy ? "Indexing..." : "Ingest Repo"}
            </button>
          </form>
          <GraphView data={graph} />
        </section>
      )}

      {tab === "chat" && (
        <section className="space-y-4">
          <form onSubmit={handleQuery} className="flex gap-2">
            <input
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              placeholder="repo_id"
              className="w-48 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-emerald-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about cross-file calls, bugs, or architecture..."
              className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <button disabled={busy} className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
              {busy ? "Tracing..." : "Run Agent"}
            </button>
          </form>

          {queryRes && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 md:col-span-2">
                <div className="text-xs font-semibold text-emerald-400">Intent: {queryRes.intent}</div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">{queryRes.answer}</pre>
                <div className="border-t border-zinc-800 pt-3">
                  <div className="mb-1.5 text-xs font-medium text-zinc-400">File-Level Citations</div>
                  <div className="flex flex-wrap gap-1.5">
                    {queryRes.citations.map((c) => (
                      <span key={c.node_id} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                        {c.file_path}:{c.start_line}-{c.end_line} ({c.name})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs font-semibold text-zinc-300">LangGraph Execution Trace</div>
                {queryRes.trace.map((t, i) => (
                  <div key={i} className="rounded border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "eval" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Compares Baseline Vector-Only RAG vs SyntaxGraph (AST Property Graph + Hybrid GraphRAG) across Local Lookup, Multi-Hop Tracing, and Bug Localization.
            </p>
            <button onClick={handleEval} disabled={busy} className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
              <Play className="h-3.5 w-3.5" />
              {busy ? "Evaluating..." : "Run Evaluation"}
            </button>
          </div>

          {evalRes && (
            <>
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="px-4 py-2.5">Evaluation Metric</th>
                      <th className="px-4 py-2.5">Baseline Vector RAG</th>
                      <th className="px-4 py-2.5">Proposed SyntaxGraph</th>
                      <th className="px-4 py-2.5">Net Improvement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                    {evalRes.summary.map((row) => (
                      <tr key={row.metric}>
                        <td className="px-4 py-2.5 font-medium text-zinc-200">{row.metric}</td>
                        <td className="px-4 py-2.5 text-zinc-400">{row.baseline_vector_rag}</td>
                        <td className="px-4 py-2.5 font-semibold text-emerald-400">{row.proposed_syntaxgraph}</td>
                        <td className="px-4 py-2.5 font-semibold text-amber-400">{row.improvement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Query</th>
                      <th className="px-3 py-2">Baseline Recall</th>
                      <th className="px-3 py-2">SyntaxGraph Recall</th>
                      <th className="px-3 py-2">Edge Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                    {evalRes.cases.map((c, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{c.category}</td>
                        <td className="px-3 py-2 text-zinc-200">{c.query}</td>
                        <td className="px-3 py-2 text-zinc-400">{c.baseline_recall}%</td>
                        <td className="px-3 py-2 text-emerald-400">{c.syntaxgraph_recall}%</td>
                        <td className="px-3 py-2 text-sky-400">{c.syntaxgraph_edge_acc}%</td>
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
