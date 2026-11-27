"use client";

const TEAM_MEMBERS: Array<{ name: string; image: string }> = [
  { name: "Krishan Kant Sharma", image: "/team/krishan.jpg" },
  { name: "Divanshu Tiwari", image: "/team/divanshu.jpg" },
  { name: "Sahil", image: "/team/sahil.jpg" },
  { name: "Deepak Baghel", image: "/team/deepak.jpg" },
];

export function AboutSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className="animate-fade-up space-y-5">
      <div className="glass-strong rounded-2xl p-6 sm:p-8">
        <div className="border-b border-white/10 pb-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber-400">About Us</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">SyntaxGraph Team</h2>
        </div>

        {!compact && (
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-zinc-300">
            SyntaxGraph replaces flat token-chunk code retrieval with a deterministic Tree-sitter Abstract Syntax Tree
            property graph in Neo4j fused with Qdrant vector search and stateful LangGraph orchestration. It preserves
            cross-file <span className="font-mono text-xs text-zinc-100">CALLS</span>,{" "}
            <span className="font-mono text-xs text-zinc-100">IMPORTS</span>, and{" "}
            <span className="font-mono text-xs text-zinc-100">INHERITS</span> edges alongside incremental commit-level sync.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_MEMBERS.map((m, idx) => (
            <div
              key={m.name}
              style={{ animationDelay: `${idx * 70}ms` }}
              className="glass glass-interactive group animate-fade-up overflow-hidden rounded-2xl"
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-black/40">
                <img
                  src={m.image}
                  alt={m.name}
                  className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <div className="text-sm font-semibold text-white">{m.name}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">SyntaxGraph Team</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
