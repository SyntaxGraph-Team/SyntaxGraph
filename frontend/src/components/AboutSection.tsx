"use client";

const TEAM_MEMBERS = [
  { name: "Krishan Kant Sharma", role: "Team Leader", rollNo: "2305111530026" },
  { name: "Divanshu Tiwari", role: "Member", rollNo: "2305111530014" },
  { name: "Sahil", role: "Member", rollNo: "2305111530049" },
  { name: "Deepak Baghel", role: "Member", rollNo: "2305111530010" },
];

export function AboutSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className="animate-fade-up space-y-5">
      <div className="glass-strong rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber-400">About Us</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">SyntaxGraph Team</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Department of Computer Science &amp; Engineering · GL Bajaj Group of Institutions, Mathura
            </p>
          </div>
          <div className="glass rounded-xl px-3.5 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Project Supervision</div>
            <div className="text-xs font-medium text-zinc-100">Er. Richa Mishra</div>
            <div className="text-[11px] text-zinc-400">Assistant Professor, Dept. of CSE</div>
          </div>
        </div>

        {!compact && (
          <p className="mt-4 text-sm leading-relaxed text-zinc-300">
            SyntaxGraph replaces flat token-chunk code retrieval with a deterministic Tree-sitter Abstract Syntax Tree
            (AST) property graph in Neo4j fused with Qdrant vector search and stateful LangGraph orchestration. It preserves
            cross-file <span className="font-mono text-xs text-zinc-200">CALLS</span>,{" "}
            <span className="font-mono text-xs text-zinc-200">IMPORTS</span>, and{" "}
            <span className="font-mono text-xs text-zinc-200">INHERITS</span> edges alongside incremental commit-level sync.
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_MEMBERS.map((m, idx) => (
            <div
              key={m.rollNo}
              style={{ animationDelay: `${idx * 60}ms` }}
              className="glass animate-fade-up rounded-xl p-4 transition duration-200 hover:-translate-y-0.5 hover:border-amber-400/35"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-zinc-500">{m.rollNo}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                    m.role === "Team Leader"
                      ? "border border-amber-400/30 bg-amber-400/10 text-amber-300"
                      : "border border-white/10 bg-white/[0.04] text-zinc-300"
                  }`}
                >
                  {m.role}
                </span>
              </div>
              <div className="mt-2.5 text-sm font-semibold text-white">{m.name}</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">B.Tech CSE · SyntaxGraph Team</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
