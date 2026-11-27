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

      {/* Floating Clay Top Header */}
      <header className="clay mx-auto mb-8 flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-indigo-500">Codebase Intelligence</span>
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

      <main className="mx-auto max-w-6xl space-y-8">
        <div className="clay grid items-center gap-8 p-7 sm:p-11 lg:grid-cols-12">
          {/* Left Story Column */}
          <div className="space-y-6 lg:col-span-7">
            <span className="clay-lavender inline-block px-4 py-1.5 text-xs font-semibold text-indigo-700">
              Built by SyntaxGraph Team
            </span>

            <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.08]">
              Understand any codebase without reading every file.
            </h2>

            <p className="max-w-xl text-base leading-relaxed text-slate-600">
              Sign in with GitHub to pick from your repositories in one click, explore how files and functions connect,
              ask questions in plain English, and summarize recent updates.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="clay-sky p-4">
                <div className="text-sm font-bold text-slate-800">Visual Code Map</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">See files, classes, and links clearly.</p>
              </div>
              <div className="clay-mint p-4">
                <div className="text-sm font-bold text-slate-800">Plain Q&amp;A</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">Ask questions and get exact lines.</p>
              </div>
              <div className="clay-peach p-4">
                <div className="text-sm font-bold text-slate-800">PR &amp; Commits</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">Quick summaries of recent changes.</p>
              </div>
            </div>
          </div>

          {/* Right Clay Sign-In Card */}
          <div className="clay-lavender p-7 sm:p-8 lg:col-span-5">
            <h3 className="text-xl font-bold text-slate-900">Sign in to start</h3>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              Connect with GitHub to load your own repositories automatically, or use Google to explore public links.
            </p>

            {error && (
              <div className="mt-4 rounded-2xl bg-rose-100 px-4 py-3 text-xs font-medium text-rose-800 shadow-inner">
                {error}
              </div>
            )}

            {firebaseConfigured ? (
              <div className="mt-6 space-y-3.5">
                <button
                  onClick={() => handleLogin("github")}
                  disabled={loading !== null}
                  className="clay-btn flex w-full items-center justify-between px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5">
                    <Github className="h-4 w-4" />
                    {loading === "github" ? "Connecting to GitHub..." : "Continue with GitHub"}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  onClick={() => handleLogin("google")}
                  disabled={loading !== null}
                  className="clay-btn-soft flex w-full items-center justify-between px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
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
                className="clay-btn mt-6 flex w-full items-center justify-between px-5 py-3.5 text-sm font-semibold"
              >
                <span>Open Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {showAbout && <AboutSection compact />}
      </main>
    </div>
  );
}
