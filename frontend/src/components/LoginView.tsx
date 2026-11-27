"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Github } from "lucide-react";
import { consumeRedirectError, firebaseConfigured, formatAuthError, signInProvider } from "@/lib/firebase";
import { AboutSection } from "@/components/AboutSection";

export function LoginView({ onDemoEnter }: { onDemoEnter?: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"google" | "github" | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    consumeRedirectError().then((msg) => {
      if (msg) setError(msg);
    });
  }, []);

  async function handleLogin(provider: "google" | "github") {
    setError("");
    setLoading(provider);
    try {
      await signInProvider(provider);
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="clay-blob-1" />
      <div className="clay-blob-2" />

      {/* Floating Clay Header */}
      <header className="clay mx-auto mb-10 flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Codebase Intelligence</span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">SyntaxGraph</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowAbout((v) => !v)}
          className="clay-btn-soft px-5 py-2 text-xs font-semibold"
        >
          {showAbout ? "Hide Team" : "About SyntaxGraph Team"}
        </button>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 pb-12">
        {/* Big Hero Heading First */}
        <section className="clay px-7 py-12 text-center sm:px-14 sm:py-16">
          <span className="clay-lavender inline-block px-4 py-1.5 text-xs font-bold text-indigo-700">
            Built by SyntaxGraph Team
          </span>

          <h2 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl sm:leading-[1.06]">
            Understand any codebase without reading every single file.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Sign in with GitHub to pick your repositories in one click, see how files and functions connect, ask
            questions in plain English, and summarize recent updates.
          </p>

          <div className="mx-auto mt-9 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
            <div className="clay-sky clay-card p-5">
              <div className="text-sm font-bold text-slate-900">Visual Code Map</div>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">See files, classes, and how everything connects.</p>
            </div>
            <div className="clay-mint clay-card p-5">
              <div className="text-sm font-bold text-slate-900">Plain-English Q&amp;A</div>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">Ask questions and jump straight to exact lines.</p>
            </div>
            <div className="clay-peach clay-card p-5">
              <div className="text-sm font-bold text-slate-900">Commits &amp; PRs</div>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">Clear summaries of what changed and why.</p>
            </div>
          </div>
        </section>

        {/* Spacious Sign-In Card Below */}
        <section className="clay-lavender mx-auto max-w-xl p-8 sm:p-10">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-900">Sign in to continue</h3>
            <p className="mt-2 text-sm text-slate-600">
              Use GitHub to load your repositories automatically, or Google to paste any public link.
            </p>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl bg-rose-100 px-4 py-3 text-xs font-semibold text-rose-800 shadow-inner">
              {error}
            </div>
          )}

          {firebaseConfigured ? (
            <div className="mt-7 space-y-3.5">
              <button
                onClick={() => handleLogin("github")}
                disabled={loading !== null}
                className="clay-btn flex w-full items-center justify-between px-6 py-4 text-sm font-semibold disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <Github className="h-4.5 w-4.5" />
                  {loading === "github" ? "Connecting to GitHub..." : "Continue with GitHub"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => handleLogin("google")}
                disabled={loading !== null}
                className="clay-btn-soft flex w-full items-center justify-between px-6 py-4 text-sm font-semibold disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-2H12z" />
                  </svg>
                  {loading === "google" ? "Connecting to Google..." : "Continue with Google"}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          ) : (
            <button
              onClick={onDemoEnter}
              className="clay-btn mt-7 flex w-full items-center justify-between px-6 py-4 text-sm font-semibold"
            >
              <span>Open Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </section>

        {showAbout && <AboutSection compact />}
      </main>
    </div>
  );
}
