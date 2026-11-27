"use client";

import { useMemo, useState } from "react";
import type { ASTNodeItem, GraphData } from "@/lib/api";

const KIND_COLOR: Record<string, string> = {
  File: "#38bdf8",
  Class: "#c084fc",
  Interface: "#a78bfa",
  Function: "#34d399",
  Method: "#f59e0b",
};

interface Props {
  data: GraphData;
  selectedId?: string;
  onSelectNode?: (node: ASTNodeItem) => void;
}

export function GraphView({ data, selectedId, onSelectNode }: Props) {
  const [filter, setFilter] = useState("");
  const [hovered, setHovered] = useState<ASTNodeItem | null>(null);

  const nodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? data.nodes.filter((n) => n.name.toLowerCase().includes(q) || n.file_path.toLowerCase().includes(q))
      : data.nodes;
    return list.slice(0, 80);
  }, [data.nodes, filter]);

  if (!data.nodes.length) {
    return (
      <div className="glass flex h-[430px] flex-col items-center justify-center rounded-2xl p-6 text-center">
        <svg viewBox="0 0 280 80" className="mb-4 h-16 w-56 opacity-75">
          <line x1="40" y1="40" x2="140" y2="20" stroke="#38bdf8" strokeWidth="1.2" strokeOpacity="0.4" />
          <line x1="140" y1="20" x2="240" y2="40" stroke="#f59e0b" strokeWidth="1.5" className="animate-edge-flow" />
          <line x1="40" y1="40" x2="140" y2="62" stroke="#a78bfa" strokeWidth="1.2" strokeOpacity="0.4" />
          <circle cx="40" cy="40" r="5" fill="#38bdf8" />
          <circle cx="140" cy="20" r="5" fill="#f59e0b" className="animate-node-pulse" />
          <circle cx="140" cy="62" r="4" fill="#a78bfa" />
          <circle cx="240" cy="40" r="5" fill="#34d399" />
        </svg>
        <p className="text-sm font-medium text-zinc-200">AST Canvas Ready</p>
        <p className="mt-1 max-w-sm text-xs text-zinc-500">
          Ingest a repository URL or pick an indexed codebase above to explore files, classes, and call edges.
        </p>
      </div>
    );
  }

  const w = 820;
  const h = 420;
  const cx = w / 2;
  const cy = h / 2;
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, idx) => {
    const ring = n.kind === "File" ? 82 : n.kind === "Class" || n.kind === "Interface" ? 138 : 180;
    const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1);
    pos.set(n.node_id, { x: cx + ring * Math.cos(angle) * 1.72, y: cy + ring * Math.sin(angle) * 0.92 });
  });

  const activeId = hovered?.node_id || selectedId;

  return (
    <div className="glass relative rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        {Object.entries(KIND_COLOR).map(([k, color]) => (
          <span key={k} className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {k}
          </span>
        ))}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter symbol or path..."
          className="ml-auto rounded-lg border border-white/10 bg-black/40 px-3 py-1 text-xs text-zinc-200 outline-none transition focus:border-amber-400/60"
        />
        <span className="font-mono text-[11px] text-zinc-400">
          {nodes.length} nodes · {data.edges.length} edges
        </span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-black/35">
        {hovered && (
          <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-lg border border-white/15 bg-zinc-950/85 px-3 py-1.5 backdrop-blur-md">
            <div className="font-mono text-[11px] font-medium text-white">
              {hovered.kind} · {hovered.name}
            </div>
            <div className="font-mono text-[10px] text-zinc-400">
              {hovered.file_path}:{hovered.start_line}
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${w} ${h}`} className="h-[370px] w-full">
          {data.edges.map((e, i) => {
            const s = pos.get(e.source);
            const t = pos.get(e.target);
            if (!s || !t) return null;
            const highlighted = Boolean(activeId && (e.source === activeId || e.target === activeId));
            const color = e.kind === "CALLS" ? "#f59e0b" : e.kind === "IMPORTS" ? "#38bdf8" : e.kind === "INHERITS" ? "#c084fc" : "#3f3f46";
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={color}
                strokeOpacity={activeId ? (highlighted ? 0.95 : 0.1) : 0.42}
                strokeWidth={highlighted ? 2 : 1.05}
                className={highlighted && (e.kind === "CALLS" || e.kind === "IMPORTS") ? "animate-edge-flow" : undefined}
              />
            );
          })}
          {nodes.map((n) => {
            const p = pos.get(n.node_id)!;
            const isSel = n.node_id === selectedId;
            const isHov = n.node_id === hovered?.node_id;
            const showLabel = isSel || isHov || (nodes.length <= 28 && n.kind !== "Method");
            return (
              <g
                key={n.node_id}
                onClick={() => onSelectNode?.(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                {(isSel || isHov) && (
                  <circle cx={p.x} cy={p.y} r={13} fill={KIND_COLOR[n.kind] || "#f59e0b"} fillOpacity={0.16} className="animate-node-pulse" />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSel || isHov ? 7 : n.kind === "File" ? 6 : 4.6}
                  fill={KIND_COLOR[n.kind] || "#a1a1aa"}
                />
                {showLabel && (
                  <text
                    x={p.x}
                    y={p.y + 15}
                    textAnchor="middle"
                    fill={isSel || isHov ? "#ffffff" : "#a1a1aa"}
                    fontSize={isSel || isHov ? "10" : "8.5"}
                    fontFamily="monospace"
                  >
                    {n.name.slice(0, 20)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
