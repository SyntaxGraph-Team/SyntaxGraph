"use client";

import { useMemo, useState } from "react";
import type { ASTNodeItem, GraphData } from "@/lib/api";

const KIND_META: Record<string, { label: string; color: string; pill: string }> = {
  File: { label: "Files", color: "#0ea5e9", pill: "bg-sky-100 text-sky-800" },
  Class: { label: "Classes", color: "#8b5cf6", pill: "bg-violet-100 text-violet-800" },
  Interface: { label: "Types", color: "#6366f1", pill: "bg-indigo-100 text-indigo-800" },
  Function: { label: "Functions", color: "#10b981", pill: "bg-emerald-100 text-emerald-800" },
  Method: { label: "Methods", color: "#f59e0b", pill: "bg-amber-100 text-amber-800" },
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
      <div className="clay flex h-[430px] flex-col items-center justify-center p-8 text-center">
        <svg viewBox="0 0 320 96" className="mb-4 h-20 w-64">
          <path d="M 48 48 C 100 48, 110 22, 160 22" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeOpacity="0.45" />
          <path d="M 48 48 C 100 48, 110 74, 160 74" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeOpacity="0.45" />
          <path d="M 160 22 C 210 22, 220 48, 272 48" fill="none" stroke="#10b981" strokeWidth="2.5" className="animate-edge-flow" />
          <path d="M 160 74 C 210 74, 220 48, 272 48" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.45" />
          <circle cx="48" cy="48" r="8" fill="#38bdf8" stroke="#fff" strokeWidth="2.5" />
          <circle cx="160" cy="22" r="8" fill="#8b5cf6" stroke="#fff" strokeWidth="2.5" />
          <circle cx="160" cy="74" r="7" fill="#f59e0b" stroke="#fff" strokeWidth="2.5" />
          <circle cx="272" cy="48" r="8" fill="#10b981" stroke="#fff" strokeWidth="2.5" />
        </svg>
        <p className="text-base font-bold text-slate-800">Your Code Map will show up here</p>
        <p className="mt-1.5 max-w-md text-xs leading-6 text-slate-500">
          Pick one of your GitHub repositories above (or paste any repo link) to map out how files and functions connect.
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
    <div className="clay p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(KIND_META).map(([k, meta]) => {
          const active = spotKind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSpotKind(active ? null : k)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                active ? "clay-btn !py-1" : `${meta.pill} shadow-sm hover:opacity-90`
              }`}
            >
              <span className="h-2 w-2 rounded-full border border-white" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <div className="clay-well flex rounded-full p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setLayout("lanes")}
              className={`rounded-full px-3 py-1 font-semibold transition ${layout === "lanes" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
            >
              Flow Lanes
            </button>
            <button
              type="button"
              onClick={() => setLayout("orbit")}
              className={`rounded-full px-3 py-1 font-semibold transition ${layout === "orbit" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
            >
              Orbit
            </button>
          </div>

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name..."
            className="clay-well w-36 px-3.5 py-1.5 text-xs text-slate-800 outline-none"
          />
        </div>
      </div>

      <div className="clay-well relative overflow-hidden rounded-[22px]">
        {layout === "lanes" && (
          <div className="pointer-events-none grid grid-cols-3 border-b border-indigo-100 bg-white/55 px-6 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            <span>Files</span>
            <span>Classes &amp; Types</span>
            <span>Functions &amp; Methods</span>
          </div>
        )}

        {hovered && (
          <div className="clay pointer-events-none absolute top-10 left-3 z-10 !rounded-2xl px-3.5 py-2">
            <div className="text-xs font-bold text-slate-800">{hovered.name}</div>
            <div className="font-mono text-[10px] text-indigo-600">
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
            const color = e.kind === "CALLS" ? "#6366f1" : e.kind === "IMPORTS" ? "#0ea5e9" : e.kind === "INHERITS" ? "#8b5cf6" : "#94a3b8";
            const midX = (s.x + t.x) / 2;
            const d = layout === "lanes" ? `M ${s.x} ${s.y} C ${midX} ${s.y}, ${midX} ${t.y}, ${t.x} ${t.y}` : `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={color}
                strokeOpacity={activeId ? (highlighted ? 0.92 : 0.14) : 0.42}
                strokeWidth={highlighted ? 2.4 : 1.3}
                className={highlighted && (e.kind === "CALLS" || e.kind === "IMPORTS") ? "animate-edge-flow" : undefined}
              />
            );
          })}

          {nodes.map((n) => {
            const p = pos.get(n.node_id)!;
            const isSel = n.node_id === selectedId;
            const isHov = n.node_id === hovered?.node_id;
            const color = KIND_META[n.kind]?.color || "#64748b";
            const showLabel = layout === "lanes" ? nodes.length <= 42 || isSel || isHov : isSel || isHov || nodes.length <= 24;
            return (
              <g
                key={n.node_id}
                onClick={() => onSelectNode?.(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                {(isSel || isHov) && <circle cx={p.x} cy={p.y} r={14} fill={color} fillOpacity={0.22} />}
                <circle cx={p.x} cy={p.y} r={isSel || isHov ? 8.5 : 6.5} fill={color} stroke="#ffffff" strokeWidth="2.2" />
                {showLabel && (
                  <text
                    x={layout === "lanes" ? p.x + 12 : p.x}
                    y={layout === "lanes" ? p.y + 3 : p.y + 17}
                    textAnchor={layout === "lanes" ? "start" : "middle"}
                    fill={isSel || isHov ? "#1e293b" : "#475569"}
                    fontWeight={isSel || isHov ? "700" : "500"}
                    fontSize={isSel || isHov ? "10.5" : "9"}
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
