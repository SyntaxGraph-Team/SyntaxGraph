"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Copy, Plus } from "lucide-react";
import type { ASTNodeItem, QueryResult } from "@/lib/api";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: QueryResult;
}

interface Props {
  repoId: string;
  onRepoIdChange: (val: string) => void;
  turns: ChatTurn[];
  busy: boolean;
  onSend: (prompt: string) => void;
  onClear: () => void;
  onInspectCitation: (node: ASTNodeItem) => void;
}

const STARTER_CARDS = [
  { title: "Project Structure", prompt: "How do the main files connect to each other?" },
  { title: "Auth & Security", prompt: "Where are logins and security checks handled?" },
  { title: "Cross-File Calls", prompt: "Which functions depend on each other across files?" },
  { title: "Find Potential Bugs", prompt: "Where could errors or edge cases happen in this codebase?" },
];

const FOLLOW_UPS = [
  "Walk me through this step by step",
  "What else depends on these files?",
  "Summarize this in 3 simple bullet points",
];

function renderFormattedText(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
      return (
        <pre key={idx} className="clay-well my-3 overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-slate-800">
          {inner}
        </pre>
      );
    }

    return (
      <div key={idx} className="space-y-2">
        {part
          .split("\n")
          .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
          .map((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={lIdx} className="h-1" />;
            const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
            const clean = isBullet ? trimmed.slice(2) : trimmed;
            const tokens = clean.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((tok, tIdx) => {
              if (tok.startsWith("`") && tok.endsWith("`")) {
                return (
                  <code key={tIdx} className="rounded-lg bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-indigo-700">
                    {tok.slice(1, -1)}
                  </code>
                );
              }
              if (tok.startsWith("**") && tok.endsWith("**")) {
                return (
                  <strong key={tIdx} className="font-bold text-slate-900">
                    {tok.slice(2, -2)}
                  </strong>
                );
              }
              return tok;
            });

            if (isBullet) {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-1 text-sm leading-7 text-slate-700">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  <span>{tokens}</span>
                </div>
              );
            }
            return (
              <p key={lIdx} className="text-sm leading-7 text-slate-700">
                {tokens}
              </p>
            );
          })}
      </div>
    );
  });
}

export function ChatView({ repoId, onRepoIdChange, turns, busy, onSend, onClear, onInspectCitation }: Props) {
  const [input, setInput] = useState("");
  const [openTrace, setOpenTrace] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, busy]);

  function submit(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    onSend(q);
  }

  return (
    <section className="animate-tab clay flex h-[calc(100vh-8.5rem)] min-h-[580px] flex-col overflow-hidden p-4 sm:p-6">
      {/* Top Chat Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 pb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="SyntaxGraph" className="h-8 w-8 rounded-xl shadow-sm" />
          <div>
            <h2 className="text-base font-bold text-slate-900">SyntaxGraph Assistant</h2>
            <p className="text-[11px] font-medium text-slate-500">
              Grounded answers from <span className="font-mono font-semibold text-indigo-600">{repoId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={repoId}
            onChange={(e) => onRepoIdChange(e.target.value)}
            placeholder="Project ID"
            className="clay-well w-44 px-3.5 py-1.5 font-mono text-[11px] text-slate-700 outline-none sm:w-52"
          />
          {turns.length > 0 && (
            <button type="button" onClick={onClear} className="clay-btn-soft flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold">
              <Plus className="h-3.5 w-3.5" /> New Chat
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Conversation Thread */}
      <div className="flex-1 space-y-5 overflow-y-auto px-1 py-6 sm:px-4">
        {turns.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
            <img src="/logo.png" alt="SyntaxGraph" className="mb-4 h-14 w-14 rounded-2xl shadow-md" />
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              What do you want to know about this code?
            </h3>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Ask any question in plain English. I will trace the connected files and show exact line links.
            </p>

            <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
              {STARTER_CARDS.map((card) => (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => submit(card.prompt)}
                  className="clay-card p-4 text-left"
                >
                  <div className="text-xs font-bold text-indigo-600">{card.title}</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">{card.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="flex justify-end">
                  <div className="clay-btn max-w-[82%] !rounded-[22px] !rounded-br-md px-5 py-3 text-sm font-medium leading-relaxed">
                    {turn.text}
                  </div>
                </div>
              ) : (
                <div key={turn.id} className="flex items-start gap-3">
                  <img src="/logo.png" alt="AI" className="mt-1 h-8 w-8 shrink-0 rounded-xl shadow-sm" />
                  <div className="clay-card min-w-0 flex-1 space-y-3 p-5">
                    {turn.result?.trace && turn.result.trace.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setOpenTrace((p) => ({ ...p, [turn.id]: !p[turn.id] }))}
                          className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          <span>Checked {turn.result.trace.length} steps</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition ${openTrace[turn.id] ? "rotate-180" : ""}`} />
                        </button>
                        {openTrace[turn.id] && (
                          <div className="mt-2 space-y-1 rounded-2xl bg-slate-50 p-3">
                            {turn.result.trace.map((step, sIdx) => (
                              <div key={sIdx} className="font-mono text-[11px] text-slate-600">
                                {step}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div>{renderFormattedText(turn.text)}</div>

                    {turn.result?.citations && turn.result.citations.length > 0 && (
                      <div className="border-t border-indigo-100 pt-3">
                        <div className="mb-2 text-[11px] font-bold text-slate-500">Sources (click to inspect in Code Map)</div>
                        <div className="flex flex-wrap gap-1.5">
                          {turn.result.citations.map((c) => (
                            <button
                              key={c.node_id}
                              type="button"
                              onClick={() => onInspectCitation(c)}
                              className="clay-btn-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-indigo-700"
                            >
                              {c.file_path}:{c.start_line}-{c.end_line} · {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex flex-wrap gap-1.5">
                        {FOLLOW_UPS.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => submit(f)}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(turn.text);
                          setCopiedId(turn.id);
                          setTimeout(() => setCopiedId(null), 1500);
                        }}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedId === turn.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}

            {busy && (
              <div className="flex items-start gap-3">
                <img src="/logo.png" alt="AI" className="mt-1 h-8 w-8 shrink-0 rounded-xl shadow-sm" />
                <div className="clay-card flex items-center gap-2 px-5 py-4">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
                  <span className="ml-2 text-xs font-semibold text-slate-500">Reading connected files...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Bottom Sticky ChatGPT/Gemini Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="mx-auto w-full max-w-3xl pt-2"
      >
        <div className="clay-well flex items-center gap-2 !rounded-full p-2 pl-5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask anything about ${repoId}...`}
            className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="clay-btn flex h-10 w-10 shrink-0 items-center justify-center !p-0 disabled:opacity-45"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
