"use client";

export type OrbMode = "idle" | "speaking" | "listening" | "thinking";

const PALETTE: Record<OrbMode, { from: string; to: string; glow: string }> = {
  idle: { from: "#5eead4", to: "#6366f1", glow: "rgba(94,234,212,0.35)" },
  speaking: { from: "#34d399", to: "#22d3ee", glow: "rgba(52,211,153,0.5)" },
  listening: { from: "#fb7185", to: "#f472b6", glow: "rgba(251,113,133,0.5)" },
  thinking: { from: "#c4b5fd", to: "#818cf8", glow: "rgba(167,139,250,0.45)" },
};

type Props = {
  mode: OrbMode;
  level: number;
  onClick?: () => void;
  label?: string;
  size?: "sm" | "lg";
};

export default function Orb({ mode, level, onClick, label, size = "lg" }: Props) {
  const palette = PALETTE[mode];
  const amplitude = Math.min(1, level);
  const scale = 1 + amplitude * 0.22;
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={label ?? mode}
      className={`group relative grid place-items-center rounded-full outline-none disabled:cursor-default ${
        size === "lg" ? "h-64 w-64" : "h-28 w-28"
      }`}
      style={{ ["--orb-glow" as string]: palette.glow, ["--orb-size" as string]: size === "lg" ? "13rem" : "5.5rem" }}
    >
      <span className="orb-ripple" style={{ animationDuration: mode === "listening" ? "2.2s" : "3.6s" }} />
      <span className="orb-ripple orb-ripple--delayed" style={{ animationDuration: mode === "listening" ? "2.2s" : "3.6s" }} />

      <span
        className="orb-core"
        style={{
          transform: `scale(${scale})`,
          background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${palette.from} 28%, ${palette.to} 72%, #0b1120 100%)`,
          boxShadow: `0 0 ${60 + amplitude * 90}px ${10 + amplitude * 30}px ${palette.glow}`,
        }}
      >
        <span className="orb-shine" />
        <span className="orb-swirl" style={{ animationDuration: mode === "speaking" ? "6s" : "14s" }} />
      </span>

      {mode === "thinking" && (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-white/40 [animation-duration:2.6s]" />
      )}

      {label && (
        <span
          className={`absolute w-72 text-center uppercase tracking-[0.32em] text-white/45 ${
            size === "lg" ? "-bottom-10 text-xs" : "-bottom-6 text-[10px]"
          }`}
        >
          {label}
        </span>
      )}
    </button>
  );
}
