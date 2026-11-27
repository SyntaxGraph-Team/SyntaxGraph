"use client";

import { useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import type { FlowchartResult } from "@/lib/api";

const KIND_FILL: Record<string, { bg: string; badge: string; text: string }> = {
  File: { bg: "#e0f2fe", badge: "#0284c7", text: "#0c4a6e" },
  Class: { bg: "#ede9fe", badge: "#7c3aed", text: "#4c1d95" },
  Interface: { bg: "#e0e7ff", badge: "#4f46e5", text: "#312e81" },
  Function: { bg: "#d1fae5", badge: "#059669", text: "#064e3b" },
  Method: { bg: "#fef3c7", badge: "#d97706", text: "#78350f" },
};

interface Props {
  repoId: string;
  onRepoIdChange: (val: string) => void;
  data: FlowchartResult | null;
  busy: boolean;
  onGenerate: () => void;
}

export function FlowchartView({ repoId, onRepoIdChange, data, busy, onGenerate }: Props) {
  const [mode, setMode] = useState<"diagram" | "code">("diagram");
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function copyMermaid() {
    if (!data) return;
    navigator.clipboard?.writeText(data.mermaid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadMmd() {
    if (!data) return;
    const blob = new Blob([data.mermaid], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.repo_id}-flowchart.mmd`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPng() {
    const svgEl = svgRef.current;
    if (!svgEl || !data) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const vb = svgEl.viewBox.baseVal;
      const w = vb.width || 980;
      const h = vb.height || 520;
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#f4f6ff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, w, h);
        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `${data.repo_id}-flowchart.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  // Compute clean layered positions
  const layers = new Map<number, typeof data extends null ? never : NonNullable<FlowchartResult>["nodes"]>();
  data?.nodes.forEach((n) => {
    const arr = layers.get(n.layer) || [];
    arr.push(n);
    layers.set(n.layer, arr);
  });

  const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);
  const colCount = Math.max(sortedLayers.length, 1);
  const maxRows = Math.max(...Array.from(layers.values()).map((a) => a.length), 1);
  const svgW = Math.max(920, colCount * 240);
  const svgH = Math.max(440, maxRows * 92 + 60);

  const nodeW = 168;
  const nodeH = 54;
  const pos = new Map<string, { x: number; y: number }>();

  sortedLayers.forEach((lvl, colIdx) => {
    const colNodes = layers.get(lvl) || [];
    const x = ((colIdx + 0.5) / colCount) * (svgW - 60) + 30 - nodeW / 2;
    colNodes.forEach((n, rowIdx) => {
      const y = ((rowIdx + 0.5) / colNodes.length) * (svgH - 40) + 20 - nodeH / 2;
      pos.set(n.id, { x, y });
    });
  });

  return (
    <section className="animate-tab space-y-6">
      <div className="clay space-y-5 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="clay-lavender inline-block px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
              Architecture Flowchart
            </span>
            <h2 className="mt-2.5 text-2xl font-bold text-slate-900">Exportable System Flowchart</h2>
            <p className="mt-1 text-sm text-slate-500">
              Turns your repository connections into a clean architecture diagram ready for READMEs and reports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={repoId}
              onChange={(e) => onRepoIdChange(e.target.value)}
              placeholder="Project ID"
              className="clay-well w-48 px-3.5 py-2 font-mono text-xs text-slate-700 outline-none"
            />
            <button type="button" onClick={onGenerate} disabled={busy} className="clay-btn px-5 py-2.5 text-xs font-semibold disabled:opacity-50">
              {busy ? "Generating..." : data ? "Refresh Diagram" : "Generate Flowchart"}
            </button>
          </div>
        </div>

        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-indigo-100 pt-4">
            <div className="clay-well flex rounded-full p-1 text-xs">
              <button
                type="button"
                onClick={() => setMode("diagram")}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${mode === "diagram" ? "clay-btn" : "text-slate-600"}`}
              >
                Visual Diagram
              </button>
              <button
                type="button"
                onClick={() => setMode("code")}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${mode === "code" ? "clay-btn" : "text-slate-600"}`}
              >
                Mermaid Code
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyMermaid} className="clay-btn-soft flex items-center gap-1.5 px-4 py-2 text-xs font-semibold">
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied Mermaid" : "Copy Mermaid"}
              </button>
              <button type="button" onClick={downloadMmd} className="clay-btn-soft flex items-center gap-1.5 px-4 py-2 text-xs font-semibold">
                <Download className="h-3.5 w-3.5" />
                Export .mmd
              </button>
              {mode === "diagram" && (
                <button type="button" onClick={downloadPng} className="clay-btn-mint flex items-center gap-1.5 px-4 py-2 text-xs font-semibold">
                  <Download className="h-3.5 w-3.5" />
                  Export PNG
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!data ? (
        <div className="clay flex h-80 flex-col items-center justify-center p-8 text-center">
          <p className="text-base font-bold text-slate-800">No flowchart generated yet</p>
          <p className="mt-1.5 max-w-md text-xs leading-6 text-slate-500">
            First map a repository in <span className="font-semibold text-indigo-600">Code Map</span>, then click{" "}
            <span className="font-semibold text-indigo-600">Generate Flowchart</span> to create a Mermaid &amp; PNG diagram.
          </p>
        </div>
      ) : mode === "code" ? (
        <div className="clay p-6">
          <pre className="clay-well overflow-x-auto p-5 font-mono text-xs leading-relaxed text-slate-800">{data.mermaid}</pre>
        </div>
      ) : (
        <div className="clay overflow-x-auto p-5">
          <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`} className="min-w-[760px] w-full rounded-[20px] bg-[#f4f6ff]">
            <defs>
              <marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
              </marker>
            </defs>

            {data.edges.map((e, i) => {
              const s = pos.get(e.source);
              const t = pos.get(e.target);
              if (!s || !t) return null;
              const x1 = s.x + nodeW;
              const y1 = s.y + nodeH / 2;
              const x2 = t.x;
              const y2 = t.y + nodeH / 2;
              const dx = Math.max(45, Math.abs(x2 - x1) * 0.45);
              const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              const active = !selected || selected === e.source || selected === e.target;
              const stroke = e.kind === "CALLS" ? "#4f46e5" : e.kind === "IMPORTS" ? "#0284c7" : "#7c3aed";
              return (
                <g key={i} opacity={active ? 0.9 : 0.16}>
                  <path d={d} fill="none" stroke={stroke} strokeWidth={active && selected ? 2.2 : 1.6} markerEnd="url(#fc-arrow)" />
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 6}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {e.label}
                  </text>
                </g>
              );
            })}

            {data.nodes.map((n) => {
              const p = pos.get(n.id)!;
              const st = KIND_FILL[n.kind] || KIND_FILL.File;
              const isSel = selected === n.id;
              return (
                <g key={n.id} onClick={() => setSelected(isSel ? null : n.id)} className="cursor-pointer">
                  <rect
                    x={p.x}
                    y={p.y}
                    width={nodeW}
                    height={nodeH}
                    rx={16}
                    fill="#ffffff"
                    stroke={isSel ? "#4f46e5" : "#dbeafe"}
                    strokeWidth={isSel ? 2.5 : 1.5}
                  />
                  <rect x={p.x + 8} y={p.y + 8} width={54} height={15} rx={7} fill={st.bg} />
                  <text x={p.x + 35} y={p.y + 18.5} textAnchor="middle" fill={st.text} fontSize="8.5" fontWeight="700" fontFamily="sans-serif">
                    {n.kind}
                  </text>
                  <text x={p.x + 10} y={p.y + 40} fill="#0f172a" fontSize="11" fontWeight="700" fontFamily="monospace">
                    {n.label.slice(0, 20)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
