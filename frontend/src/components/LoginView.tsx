"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Github } from "lucide-react";
import { consumeRedirectError, firebaseConfigured, formatAuthError, signInProvider } from "@/lib/firebase";
import { AboutSection } from "@/components/AboutSection";

const MARQUEE_WORDS = ["MAP CODE", "TRACE FILES", "ASK QUESTIONS", "REVIEW PRS", "FOLLOW PUSHES", "CHECK HEALTH"];

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
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 faded-grid opacity-45" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/65 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#58d5ba]/80">Codebase Intelligence</p>
            <p className="text-lg font-semibold text-white">SyntaxGraph</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAbout((v) => !v)}
            className="rounded-full border border-[#58d5ba]/25 bg-[#58d5ba]/10 px-4 py-1.5 text-xs font-medium text-[#77e7d2] transition hover:bg-[#58d5ba]/20"
          >
            {showAbout ? "Hide Team" : "SyntaxGraph Team"}
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="panel-strong relative overflow-hidden rounded-[2.2rem] px-6 py-10 sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(88,213,186,0.18),transparent_55%),radial-gradient(circle_at_top_right,rgba(66,121,255,0.18),transparent_45%)]" />

          <div className="pointer-events-none absolute inset-x-0 top-6">
            <div className="headline-marquee">
              <div className="headline-marquee-track">
                {[...MARQUEE_WORDS, ...MARQUEE_WORDS].map((w, i) => (
                  <span key={i} className="headline-marquee-word">{w}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="relative mt-6 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.34em] text-[#58d5ba]/85">SyntaxGraph Team</p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[4.2rem] lg:leading-[0.98]">
                See how any codebase works
                <span className="hero-accent-text block">without reading every file.</span>
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                Paste a GitHub repository link to map how files and functions connect, ask plain-English questions with
                exact line references, and summarize recent commits or pull requests.
              </p>

              <div className="mt-7 flex flex-wrap gap-2">
                {["Visual Code Map", "Plain-English Q&A", "Commit & PR Summaries", "Live Health Check"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="interactive-card rounded-[1.8rem] border border-white/12 bg-slate-950/75 p-7">
              <p className="text-xs uppercase tracking-[0.26em] text-[#58d5ba]/80">Get Started</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Sign in to SyntaxGraph</h2>
              <p className="mt-1.5 text-xs leading-6 text-slate-400">
                Sign in with Google or GitHub to open the interactive Code Map, AI Assistant, and Team workspace.
              </p>

              {error && (
                <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-200">
                  {error}
                </div>
              )}

              {firebaseConfigured ? (
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => handleLogin("google")}
                    disabled={loading !== null}
                    className="flex w-full items-center justify-between rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:border-[#58d5ba]/40 hover:bg-white/10 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2.5">
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-2H12z" />
                      </svg>
                      {loading === "google" ? "Connecting to Google..." : "Continue with Google"}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </button>

                  <button
                    onClick={() => handleLogin("github")}
                    disabled={loading !== null}
                    className="flex w-full items-center justify-between rounded-full bg-[#58d5ba] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#77e7d2] disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2.5">
                      <Github className="h-4 w-4" />
                      {loading === "github" ? "Connecting to GitHub..." : "Continue with GitHub"}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={onDemoEnter}
                  className="mt-6 flex w-full items-center justify-between rounded-full bg-[#58d5ba] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#77e7d2]"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-xs">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-semibold text-white">Flow Map</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Files, classes &amp; calls</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-semibold text-white">Grounded AI</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Answers with file lines</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {showAbout && (
          <div className="mt-8">
            <AboutSection compact />
          </div>
        )}
      </main>
    </div>
  );
}
