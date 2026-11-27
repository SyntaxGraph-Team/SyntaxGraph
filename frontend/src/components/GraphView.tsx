"use client";

import { useMemo, useState } from "react";
import type { ASTNodeItem, GraphData } from "@/lib/api";

const KIND_META: Record<string, { label: string; color: string }> = {
  File: { label: "Files", color: "#38bdf8" },
  Class: { label: "Classes", color: "#c084fc" },
  Interface: { label: "Interfaces", color: "#a78bfa" },
  Function: { label: "Functions", color: "#34d399" },
  Method: { label: "Methods", color: "#f59e0b" },
};

interface Props {
  data: GraphData;
  selectedId?: string;
  onSelectNode?: (node: ASTNodeItem) => void;
}

export function GraphView({ data, selectedId, onSelectNode }: Props) {
  const [filter, setFilter] = useState("");
  const [layout, setLayout] = useState<"lanes" | "orbit">("lanes");
  const [spotKind, setSpotKind] = useState<string | null>(null);
  const [hovered, setHovered] = useState<ASTNodeItem | null>(null);

  const nodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.nodes
      .filter((n) => (!spotKind || n.kind === spotKind) && (!q || n.name.toLowerCase().includes(q) || n.file_path.toLowerCase().includes(q)))
      .slice(0, 72);
  }, [data.nodes, filter, spotKind]);

  if (!data.nodes.length) {
    return (
      <div className="glass flex h-[430px] flex-col items-center justify-center rounded-2xl p-8 text-center">
        <svg viewBox="0 0 320 96" className="mb-5 h-20 w-64 opacity-85">
          <path d="M 48 48 C 100 48, 110 22, 160 22" fill="none" stroke="#38bdf8" strokeWidth="1.4" strokeOpacity="0.45" />
          <path d="M 48 48 C 100 48, 110 74, 160 74" fill="none" stroke="#c084fc" strokeWidth="1.4" strokeOpacity="0.45" />
          <path d="M 160 22 C 210 22, 220 48, 272 48" fill="none" stroke="#f59e0b" strokeWidth="1.8" className="animate-edge-flow" />
          <path d="M 160 74 C 210 74, 220 48, 272 48" fill="none" stroke="#34d399" strokeWidth="1.4" strokeOpacity="0.45" />
          <circle cx="48" cy="48" r="6" fill="#38bdf8" />
          <circle cx="160" cy="22" r="6" fill="#f59e0b" className="animate-node-pulse" />
          <circle cx="160" cy="74" r="5" fill="#c084fc" />
          <circle cx="272" cy="48" r="6" fill="#34d399" />
        </svg>
        <p className="text-base font-medium text-white">Your interactive Code Map will appear here</p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-zinc-400">
          Paste any public GitHub link above and click <span className="font-medium text-amber-300">Analyze Repo</span> to
          see how files, classes, and functions connect.
        </p>
      </div>
    );
  }

  const w = 840;
  const h = 420;
  const pos = new Map<string, { x: number; y: number }>();

  if (layout === "lanes") {
    const col0 = nodes.filter((n) => n.kind === "File");
    const col1 = nodes.filter((n) => n.kind === "Class" || n.kind === "Interface");
    const col2 = nodes.filter((n) => n.kind === "Function" || n.kind === "Method");
    const placeCol = (arr: ASTNodeItem[], x: number) => {
      arr.forEach((n, i) => {
        const y = ((i + 1) / (arr.length + 1)) * (h - 54) + 34;
        pos.set(n.node_id, { x, y });
      });
    };
    placeCol(col0, 125);
    placeCol(col1, 420);
    placeCol(col2, 705);
  } else {
    const cx = w / 2;
    const cy = h / 2;
    nodes.forEach((n, idx) => {
      const ring = n.kind === "File" ? 82 : n.kind === "Class" || n.kind === "Interface" ? 138 : 182;
      const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1);
      pos.set(n.node_id, { x: cx + ring * Math.cos(angle) * 1.72, y: cy + ring * Math.sin(angle) * 0.9 });
    });
  }

  const activeId = hovered?.node_id || selectedId;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(KIND_META).map(([k, meta]) => {
          const active = spotKind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSpotKind(active ? null : k)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                active ? "border-amber-400/50 bg-amber-400/15 text-white" : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setLayout("lanes")}
              className={`rounded-md px-2.5 py-0.5 transition ${layout === "lanes" ? "bg-white/12 text-white" : "text-zinc-400"}`}
            >
              Flow Lanes
            </button>
            <button
              type="button"
              onClick={() => setLayout("orbit")}
              className={`rounded-md px-2.5 py-0.5 transition ${layout === "orbit" ? "bg-white/12 text-white" : "text-zinc-400"}`}
            >
              Orbit
            </button>
          </div>

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search name or file..."
            className="w-40 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-amber-400/60"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/40">
        {layout === "lanes" && (
          <div className="pointer-events-none grid grid-cols-3 border-b border-white/[0.06] bg-white/[0.02] px-6 py-1.5 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            <span>Files</span>
            <span>Classes &amp; Types</span>
            <span>Functions &amp; Methods</span>
          </div>
        )}

        {hovered && (
          <div className="pointer-events-none absolute top-9 left-3 z-10 rounded-xl border border-white/15 bg-zinc-950/90 px-3 py-2 shadow-xl backdrop-blur-md">
            <div className="text-xs font-medium text-white">{hovered.name}</div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
              {hovered.kind} · {hovered.file_path}:{hovered.start_line}
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${w} ${h}`} className="h-[370px] w-full">
          {data.edges.map((e, i) => {
            const s = pos.get(e.source);
            const t = pos.get(e.target);
            if (!s || !t) return null;
            const highlighted = Boolean(activeId && (e.source === activeId || e.target === activeId));
            const color = e.kind === "CALLS" ? "#f59e0b" : e.kind === "IMPORTS" ? "#38bdf8" : e.kind === "INHERITS" ? "#c084fc" : "#52525b";
            const midX = (s.x + t.x) / 2;
            const d = layout === "lanes" ? `M ${s.x} ${s.y} C ${midX} ${s.y}, ${midX} ${t.y}, ${t.x} ${t.y}` : `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={color}
                strokeOpacity={activeId ? (highlighted ? 0.95 : 0.08) : 0.35}
                strokeWidth={highlighted ? 2 : 1.05}
                className={highlighted && (e.kind === "CALLS" || e.kind === "IMPORTS") ? "animate-edge-flow" : undefined}
              />
            );
          })}

          {nodes.map((n) => {
            const p = pos.get(n.node_id)!;
            const isSel = n.node_id === selectedId;
            const isHov = n.node_id === hovered?.node_id;
            const color = KIND_META[n.kind]?.color || "#a1a1aa";
            const showLabel = layout === "lanes" ? nodes.length <= 42 || isSel || isHov : isSel || isHov || nodes.length <= 24;
            return (
              <g
                key={n.node_id}
                onClick={() => onSelectNode?.(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                {(isSel || isHov) && <circle cx={p.x} cy={p.y} r={13} fill={color} fillOpacity={0.18} className="animate-node-pulse" />}
                <circle cx={p.x} cy={p.y} r={isSel || isHov ? 6.8 : 5} fill={color} />
                {showLabel && (
                  <text
                    x={layout === "lanes" ? p.x + 11 : p.x}
                    y={layout === "lanes" ? p.y + 3 : p.y + 15}
                    textAnchor={layout === "lanes" ? "start" : "middle"}
                    fill={isSel || isHov ? "#ffffff" : "#a1a1aa"}
                    fontSize={isSel || isHov ? "10" : "8.5"}
                    fontFamily="monospace"
                  >
                    {n.name.slice(0, 18)}
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
