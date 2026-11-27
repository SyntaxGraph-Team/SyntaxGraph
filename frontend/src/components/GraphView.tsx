"use client";

import { useMemo, useState } from "react";
import type { ASTNodeItem, GraphData } from "@/lib/api";

const KIND_COLOR: Record<string, string> = {
  File: "#38bdf8",
  Class: "#c084fc",
  Interface: "#a78bfa",
  Function: "#34d399",
  Method: "#fbbf24",
};

interface Props {
  data: GraphData;
  selectedId?: string;
  onSelectNode?: (node: ASTNodeItem) => void;
}

export function GraphView({ data, selectedId, onSelectNode }: Props) {
  const [filter, setFilter] = useState("");
  const nodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? data.nodes.filter((n) => n.name.toLowerCase().includes(q) || n.file_path.toLowerCase().includes(q))
      : data.nodes;
    return list.slice(0, 80);
  }, [data.nodes, filter]);

  if (!data.nodes.length) {
    return (
      <div className="glass flex h-96 flex-col items-center justify-center rounded-2xl text-center">
        <p className="text-sm font-medium text-zinc-300">No AST Graph Loaded</p>
        <p className="mt-1 text-xs text-zinc-500">Ingest a GitHub repository or load an existing repo ID to visualize AST nodes &amp; edges.</p>
      </div>
    );
  }

  const w = 780;
  const h = 390;
  const cx = w / 2;
  const cy = h / 2;
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, idx) => {
    const ring = n.kind === "File" ? 78 : n.kind === "Class" || n.kind === "Interface" ? 132 : 172;
    const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1);
    pos.set(n.node_id, { x: cx + ring * Math.cos(angle) * 1.65, y: cy + ring * Math.sin(angle) * 0.9 });
  });

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-zinc-300">
        {Object.entries(KIND_COLOR).map(([k, color]) => (
          <span key={k} className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-0.5 border border-white/10">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {k}
          </span>
        ))}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter symbol or file..."
          className="ml-auto rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-emerald-400/60"
        />
        <span className="text-[11px] text-zinc-400">
          {nodes.length} nodes · {data.edges.length} edges
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-84 w-full rounded-xl bg-black/25">
        {data.edges.map((e, i) => {
          const s = pos.get(e.source);
          const t = pos.get(e.target);
          if (!s || !t) return null;
          const highlighted = selectedId && (e.source === selectedId || e.target === selectedId);
          const color = e.kind === "CALLS" ? "#fb923c" : e.kind === "IMPORTS" ? "#38bdf8" : e.kind === "INHERITS" ? "#c084fc" : "#3f3f46";
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={color}
              strokeOpacity={selectedId ? (highlighted ? 0.95 : 0.14) : 0.5}
              strokeWidth={highlighted ? 2 : 1.1}
            />
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.node_id)!;
          const isSel = n.node_id === selectedId;
          return (
            <g key={n.node_id} onClick={() => onSelectNode?.(n)} className="cursor-pointer">
              {isSel && <circle cx={p.x} cy={p.y} r={11} fill="none" stroke="#34d399" strokeWidth={1.8} strokeOpacity={0.85} />}
              <circle cx={p.x} cy={p.y} r={n.kind === "File" ? 6.5 : 4.8} fill={KIND_COLOR[n.kind] || "#a1a1aa"} />
              <title>{`${n.kind}: ${n.name} (${n.file_path}:${n.start_line})`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
