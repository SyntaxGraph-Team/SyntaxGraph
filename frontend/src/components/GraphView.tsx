"use client";

import { useMemo, useState } from "react";
import type { ASTNodeItem, GraphData } from "@/lib/api";

const KIND_META: Record<string, { label: string; color: string }> = {
  File: { label: "Files", color: "#58d5ba" },
  Class: { label: "Classes", color: "#60a5fa" },
  Interface: { label: "Types", color: "#a78bfa" },
  Function: { label: "Functions", color: "#34d399" },
  Method: { label: "Methods", color: "#fbbf24" },
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
      <div className="panel flex h-[430px] flex-col items-center justify-center rounded-[1.7rem] p-8 text-center">
        <svg viewBox="0 0 320 96" className="mb-5 h-20 w-64 opacity-90">
          <path d="M 48 48 C 100 48, 110 22, 160 22" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeOpacity="0.45" />
          <path d="M 48 48 C 100 48, 110 74, 160 74" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeOpacity="0.45" />
          <path d="M 160 22 C 210 22, 220 48, 272 48" fill="none" stroke="#58d5ba" strokeWidth="2" className="animate-edge-flow" />
          <path d="M 160 74 C 210 74, 220 48, 272 48" fill="none" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.45" />
          <circle cx="48" cy="48" r="6" fill="#58d5ba" />
          <circle cx="160" cy="22" r="6" fill="#60a5fa" className="animate-node-pulse" />
          <circle cx="160" cy="74" r="5" fill="#a78bfa" />
          <circle cx="272" cy="48" r="6" fill="#34d399" />
        </svg>
        <p className="text-base font-semibold text-white">Your interactive Code Map will appear here</p>
        <p className="mt-2 max-w-md text-xs leading-6 text-slate-400">
          Paste any GitHub repository link above and click <span className="font-medium text-[#77e7d2]">Analyze Repo</span>{" "}
          to see how files, classes, and functions connect.
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
    <div className="panel rounded-[1.7rem] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(KIND_META).map(([k, meta]) => {
          const active = spotKind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSpotKind(active ? null : k)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition ${
                active
                  ? "border-[#58d5ba]/50 bg-[#58d5ba]/15 text-white"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-full border border-white/10 bg-slate-950/70 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setLayout("lanes")}
              className={`rounded-full px-3 py-1 transition ${layout === "lanes" ? "bg-[#58d5ba] font-medium text-slate-950" : "text-slate-400"}`}
            >
              Flow Lanes
            </button>
            <button
              type="button"
              onClick={() => setLayout("orbit")}
              className={`rounded-full px-3 py-1 transition ${layout === "orbit" ? "bg-[#58d5ba] font-medium text-slate-950" : "text-slate-400"}`}
            >
              Orbit
            </button>
          </div>

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name..."
            className="w-36 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-200 outline-none focus:border-[#58d5ba]/60"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/75">
        {layout === "lanes" && (
          <div className="pointer-events-none grid grid-cols-3 border-b border-white/[0.06] bg-white/[0.02] px-6 py-2 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">
            <span>Files</span>
            <span>Classes &amp; Types</span>
            <span>Functions &amp; Methods</span>
          </div>
        )}

        {hovered && (
          <div className="pointer-events-none absolute top-10 left-3 z-10 rounded-2xl border border-[#58d5ba]/30 bg-slate-950/90 px-3.5 py-2 shadow-xl backdrop-blur-md">
            <div className="text-xs font-semibold text-white">{hovered.name}</div>
            <div className="mt-0.5 font-mono text-[10px] text-[#77e7d2]">
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
            const color = e.kind === "CALLS" ? "#58d5ba" : e.kind === "IMPORTS" ? "#60a5fa" : e.kind === "INHERITS" ? "#a78bfa" : "#475569";
            const midX = (s.x + t.x) / 2;
            const d = layout === "lanes" ? `M ${s.x} ${s.y} C ${midX} ${s.y}, ${midX} ${t.y}, ${t.x} ${t.y}` : `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={color}
                strokeOpacity={activeId ? (highlighted ? 0.95 : 0.08) : 0.34}
                strokeWidth={highlighted ? 2 : 1.05}
                className={highlighted && (e.kind === "CALLS" || e.kind === "IMPORTS") ? "animate-edge-flow" : undefined}
              />
            );
          })}

          {nodes.map((n) => {
            const p = pos.get(n.node_id)!;
            const isSel = n.node_id === selectedId;
            const isHov = n.node_id === hovered?.node_id;
            const color = KIND_META[n.kind]?.color || "#94a3b8";
            const showLabel = layout === "lanes" ? nodes.length <= 42 || isSel || isHov : isSel || isHov || nodes.length <= 24;
            return (
              <g
                key={n.node_id}
                onClick={() => onSelectNode?.(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                {(isSel || isHov) && <circle cx={p.x} cy={p.y} r={13} fill={color} fillOpacity={0.2} className="animate-node-pulse" />}
                <circle cx={p.x} cy={p.y} r={isSel || isHov ? 7 : 5} fill={color} />
                {showLabel && (
                  <text
                    x={layout === "lanes" ? p.x + 11 : p.x}
                    y={layout === "lanes" ? p.y + 3 : p.y + 15}
                    textAnchor={layout === "lanes" ? "start" : "middle"}
                    fill={isSel || isHov ? "#ffffff" : "#94a3b8"}
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
