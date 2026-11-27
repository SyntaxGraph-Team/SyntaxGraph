"use client";

import { useState } from "react";
import { ArrowRight, GitBranch, Github, Info } from "lucide-react";
import { firebaseConfigured, signInProvider } from "@/lib/firebase";
import { AboutSection } from "@/components/AboutSection";

export function LoginView({ onDemoEnter }: { onDemoEnter?: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"google" | "github" | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  async function handleLogin(provider: "google" | "github") {
    setError("");
    setLoading(provider);
    try {
      await signInProvider(provider);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Authentication failed";
      if (msg.includes("unauthorized-domain")) {
        setError("Add your deployment domain (e.g. syntaxgraph.vercel.app) under Firebase Console -> Authentication -> Settings -> Authorized domains.");
      } else if (msg.includes("popup-blocked")) {
        setError("Browser popup was blocked. Allow popups for this site or disable redirect-blocking extensions and retry.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-10">
      <div className="grid items-center gap-8 lg:grid-cols-12">
        {/* Architectural Left Column */}
        <div className="animate-fade-up space-y-6 lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            SyntaxGraph Team · GL Bajaj CSE
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Codebase intelligence built on syntax, not flat chunks.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
              Parse multi-language repositories with Tree-sitter into a Neo4j AST property graph, pair with Qdrant
              semantic search, and trace cross-file dependencies through LangGraph.
            </p>
          </div>

          {/* Animated Topology Preview */}
          <div className="glass rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-zinc-500">
              <span>AST_GRAPH :: LIVE TOPOLOGY PREVIEW</span>
              <span>CALLS · IMPORTS · INHERITS</span>
            </div>
            <svg viewBox="0 0 560 150" className="h-32 w-full">
              <line x1="70" y1="75" x2="205" y2="38" stroke="#38bdf8" strokeWidth="1.4" strokeOpacity="0.6" />
              <line x1="70" y1="75" x2="205" y2="112" stroke="#38bdf8" strokeWidth="1.4" strokeOpacity="0.6" />
              <line x1="205" y1="38" x2="355" y2="38" stroke="#f59e0b" strokeWidth="1.8" className="animate-edge-flow" />
              <line x1="205" y1="112" x2="355" y2="38" stroke="#f59e0b" strokeWidth="1.4" strokeOpacity="0.45" />
              <line x1="355" y1="38" x2="485" y2="75" stroke="#34d399" strokeWidth="1.8" className="animate-edge-flow" />
              <line x1="205" y1="112" x2="485" y2="75" stroke="#a78bfa" strokeWidth="1.4" strokeOpacity="0.55" />

              {[
                { x: 70, y: 75, label: "router.py", color: "#38bdf8" },
                { x: 205, y: 38, label: "handleCheckout()", color: "#f59e0b" },
                { x: 205, y: 112, label: "verifySignature()", color: "#a78bfa" },
                { x: 355, y: 38, label: "authorizePayment()", color: "#f59e0b" },
                { x: 485, y: 75, label: "ledgerCommit()", color: "#34d399" },
              ].map((n) => (
                <g key={n.label}>
                  <circle cx={n.x} cy={n.y} r="11" fill={n.color} fillOpacity="0.14" className="animate-node-pulse" />
                  <circle cx={n.x} cy={n.y} r="4.5" fill={n.color} />
                  <text x={n.x} y={n.y + 22} textAnchor="middle" fill="#a1a1aa" fontSize="10" fontFamily="monospace">
                    {n.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <button
            type="button"
            onClick={() => setShowAbout((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 transition hover:text-amber-300"
          >
            <Info className="h-3.5 w-3.5" />
            {showAbout ? "Hide About Us & Team" : "About Us · Meet the SyntaxGraph Team"}
          </button>
        </div>

        {/* Glass Sign-In Panel */}
        <div className="glass-strong animate-fade-up-delay rounded-2xl p-7 lg:col-span-5">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Sign in to SyntaxGraph</h2>
              <p className="text-xs text-zinc-400">Authenticate to access AST Explorer, Chat, and PR Summaries</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-rose-200">
              {error}
            </div>
          )}

          {firebaseConfigured ? (
            <div className="space-y-3">
              <button
                onClick={() => handleLogin("google")}
                disabled={loading !== null}
                className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-100 transition hover:border-white/25 hover:bg-white/[0.08] active:scale-[0.99] disabled:opacity-50"
              >
                <span className="flex items-center gap-2.5">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-2H12z" />
                  </svg>
                  {loading === "google" ? "Connecting to Google..." : "Continue with Google"}
                </span>
                <ArrowRight className="h-4 w-4 text-zinc-500" />
              </button>

              <button
                onClick={() => handleLogin("github")}
                disabled={loading !== null}
                className="flex w-full items-center justify-between rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.99] disabled:opacity-50"
              >
                <span className="flex items-center gap-2.5">
                  <Github className="h-4 w-4" />
                  {loading === "github" ? "Connecting to GitHub..." : "Continue with GitHub"}
                </span>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
              </button>
            </div>
          ) : (
            <button
              onClick={onDemoEnter}
              className="flex w-full items-center justify-between rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              <span>Enter Local Dev Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          <div className="mt-6 border-t border-white/10 pt-4 text-[11px] text-zinc-500">
            Protected via Firebase OAuth 2.0. Ensure popups are allowed for OAuth sign-in.
          </div>
        </div>
      </div>

      {showAbout && (
        <div className="mt-8">
          <AboutSection compact />
        </div>
      )}
    </main>
  );
}
