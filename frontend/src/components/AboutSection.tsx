"use client";

const TEAM_MEMBERS: Array<{ name: string; image: string; tint: string }> = [
  { name: "Krishan Kant Sharma", image: "/team/krishan.jpg", tint: "clay-lavender" },
  { name: "Divanshu Tiwari", image: "/team/divanshu.jpg", tint: "clay-sky" },
  { name: "Sahil", image: "/team/sahil.jpg", tint: "clay-mint" },
  { name: "Deepak Baghel", image: "/team/deepak.jpg", tint: "clay-peach" },
];

export function AboutSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className="animate-tab space-y-5">
      <div className="clay p-7 sm:p-10">
        <div className="border-b border-indigo-100 pb-5">
          <span className="clay-lavender inline-block px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            About Us
          </span>
          <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">SyntaxGraph Team</h2>
        </div>

        {!compact && (
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            SyntaxGraph turns any GitHub codebase into a visual map of files, classes, and functions. You can explore
            how parts depend on each other, ask questions in plain English with exact line numbers, and get quick
            summaries of recent commits and pull requests.
          </p>
        )}

        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_MEMBERS.map((m) => (
            <div key={m.name} className={`clay-card ${m.tint} group overflow-hidden p-3`}>
              <div className="aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-white shadow-inner">
                <img
                  src={m.image}
                  alt={m.name}
                  className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="px-1.5 pt-3.5 pb-1">
                <div className="text-sm font-bold text-slate-900">{m.name}</div>
                <div className="mt-0.5 text-xs font-medium text-slate-500">SyntaxGraph Team</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
