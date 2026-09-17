"use client";

import type { Entry } from "@/lib/types";

const WIDTH = 640;
const HEIGHT = 160;

export default function EnergyChart({ entries }: { entries: Entry[] }) {
  const points = [...entries].reverse().slice(-30);
  if (points.length === 0) {
    return <p className="text-sm text-white/40">Your energy curve appears once you log your first entry.</p>;
  }

  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const coords = points.map((entry, i) => ({
    x: points.length > 1 ? i * step : WIDTH / 2,
    y: HEIGHT - (entry.battery / 100) * HEIGHT,
    entry,
  }));
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${HEIGHT} L${coords[0].x.toFixed(1)},${HEIGHT} Z`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Energy over time">
      <defs>
        <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={WIDTH} y1={HEIGHT * f} y2={HEIGHT * f} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      ))}
      <path d={area} fill="url(#energyFill)" />
      <path d={line} fill="none" stroke="#34d399" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c) => (
        <circle
          key={c.entry.id}
          cx={c.x}
          cy={c.y}
          r={4}
          fill={c.entry.mood === "good" ? "#34d399" : c.entry.mood === "bad" ? "#fb7185" : "#cbd5f5"}
        >
          <title>{`${new Date(c.entry.created_at).toLocaleString()} — ${c.entry.battery}%`}</title>
        </circle>
      ))}
    </svg>
  );
}
