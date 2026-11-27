"use client";

const TEAM_MEMBERS: Array<{ name: string; image: string }> = [
  { name: "Krishan Kant Sharma", image: "/team/krishan.jpg" },
  { name: "Divanshu Tiwari", image: "/team/divanshu.jpg" },
  { name: "Sahil", image: "/team/sahil.jpg" },
  { name: "Deepak Baghel", image: "/team/deepak.jpg" },
];

export function AboutSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className="animate-tab space-y-5">
      <div className="panel-strong rounded-[2.2rem] p-6 sm:p-10">
        <div className="border-b border-white/10 pb-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[#58d5ba]/80">About Us</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">SyntaxGraph Team</h2>
        </div>

        {!compact && (
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            SyntaxGraph turns complex GitHub repositories into an interactive visual map. Instead of reading isolated
            text chunks, anyone can explore how files connect, ask plain-English questions with exact line citations,
            and review recent updates in seconds.
          </p>
        )}

        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_MEMBERS.map((m) => (
            <div key={m.name} className="interactive-card group overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/60">
              <div className="aspect-[4/3] w-full overflow-hidden bg-slate-950">
                <img
                  src={m.image}
                  alt={m.name}
                  className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <div className="text-sm font-semibold text-white">{m.name}</div>
                <div className="mt-0.5 text-xs text-slate-400">SyntaxGraph Team</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
