"use client";

import { useState } from "react";
import { GitBranch, Github, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { firebaseConfigured, signInProvider } from "@/lib/firebase";

export function LoginView({ onDemoEnter }: { onDemoEnter?: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"google" | "github" | null>(null);

  async function handleLogin(provider: "google" | "github") {
    setError("");
    setLoading(provider);
    try {
      await signInProvider(provider);
    } catch (err) {
      setError((err as Error).message || "Authentication failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-strong w-full max-w-md rounded-3xl p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/35 bg-gradient-to-br from-emerald-400/25 to-sky-400/20 text-emerald-300 shadow-lg">
            <GitBranch className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">SyntaxGraph</h1>
          <p className="mt-1.5 text-xs text-zinc-400">
            AST-Driven Property Graph &amp; Agentic Hybrid GraphRAG Platform
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-300">
          <div className="glass rounded-xl p-2.5">
            <Layers className="mx-auto mb-1 h-4 w-4 text-emerald-300" />
            AST Graph
          </div>
          <div className="glass rounded-xl p-2.5">
            <Sparkles className="mx-auto mb-1 h-4 w-4 text-sky-300" />
            Hybrid RAG
          </div>
          <div className="glass rounded-xl p-2.5">
            <ShieldCheck className="mx-auto mb-1 h-4 w-4 text-violet-300" />
            PR &amp; Eval
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        {firebaseConfigured ? (
          <div className="space-y-3">
            <button
              onClick={() => handleLogin("google")}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm font-medium text-white transition hover:bg-white/12 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-2H12z" />
              </svg>
              {loading === "google" ? "Signing in..." : "Continue with Google"}
            </button>

            <button
              onClick={() => handleLogin("github")}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
            >
              <Github className="h-4 w-4" />
              {loading === "github" ? "Signing in..." : "Continue with GitHub"}
            </button>
          </div>
        ) : (
          <button
            onClick={onDemoEnter}
            className="w-full rounded-xl bg-emerald-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
          >
            Continue in Dev Mode
          </button>
        )}

        <p className="mt-6 text-center text-[11px] text-zinc-500">
          Secured by Firebase Authentication · Google &amp; GitHub OAuth 2.0
        </p>
      </div>
    </main>
  );
}
