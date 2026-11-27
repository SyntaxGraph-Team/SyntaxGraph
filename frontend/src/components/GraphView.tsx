"use client";
import type { GraphData } from "@/lib/api";

const KIND_COLOR: Record<string, string> = {
  File: "#38bdf8",
  Class: "#c084fc",
  Interface: "#a78bfa",
  Function: "#34d399",
  Method: "#fbbf24",
};

export function GraphView({ data }: { data: GraphData }) {
  const nodes = data.nodes.slice(0, 60);
  if (!nodes.length) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
        Ingest a repository to inspect AST nodes and edges.
      </div>
    );
  }

  const w = 760;
  const h = 380;
  const cx = w / 2;
  const cy = h / 2;
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, idx) => {
    const ring = n.kind === "File" ? 85 : n.kind === "Class" || n.kind === "Interface" ? 135 : 170;
    const angle = (2 * Math.PI * idx) / nodes.length;
    pos.set(n.node_id, { x: cx + ring * Math.cos(angle) * 1.5, y: cy + ring * Math.sin(angle) * 0.9 });
  });

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-zinc-400">
        {Object.entries(KIND_COLOR).map(([k, color]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {k}
          </span>
        ))}
        <span className="ml-auto text-zinc-500">
          Showing {nodes.length} nodes / {data.edges.length} edges
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-80 w-full">
        {data.edges.map((e, i) => {
          const s = pos.get(e.source);
          const t = pos.get(e.target);
          if (!s || !t) return null;
          const color = e.kind === "CALLS" ? "#f97316" : e.kind === "IMPORTS" ? "#38bdf8" : e.kind === "INHERITS" ? "#c084fc" : "#27272a";
          return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={color} strokeOpacity={0.55} strokeWidth={1.2} />;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.node_id)!;
          return (
            <g key={n.node_id}>
              <circle cx={p.x} cy={p.y} r={n.kind === "File" ? 6 : 4.5} fill={KIND_COLOR[n.kind] || "#a1a1aa"} />
              <title>{`${n.kind}: ${n.name} (${n.file_path}:${n.start_line})`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
