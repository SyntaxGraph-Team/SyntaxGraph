"use client";

const TEAM_MEMBERS: Array<{ name: string; initials: string; image?: string }> = [
  { name: "Krishan Kant Sharma", initials: "KS", image: "/team/krishan.jpg" },
  { name: "Divanshu Tiwari", initials: "DT", image: "/team/divanshu.jpg" },
  { name: "Sahil", initials: "S", image: "/team/sahil.jpg" },
  { name: "Deepak Baghel", initials: "DB", image: "/team/deepak.jpg" },
];

export function AboutSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className="animate-fade-up space-y-5">
      <div className="glass-strong rounded-2xl p-6">
        <div className="border-b border-white/10 pb-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber-400">About Us</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">SyntaxGraph Team</h2>
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

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_MEMBERS.map((m, idx) => (
            <div
              key={m.name}
              style={{ animationDelay: `${idx * 60}ms` }}
              className="glass animate-fade-up flex items-center gap-3.5 rounded-xl p-4 transition duration-200 hover:-translate-y-0.5 hover:border-amber-400/35"
            >
              {m.image ? (
                <img
                  src={m.image}
                  alt={m.name}
                  className="h-14 w-14 shrink-0 rounded-xl border border-white/15 object-cover object-top"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] font-mono text-sm font-semibold text-amber-300">
                  {m.initials}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{m.name}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">SyntaxGraph Team</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
