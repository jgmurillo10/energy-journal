"use client";

import { useVoiceCapture } from "@/lib/speech";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
};

export default function VoiceField({ value, onChange, placeholder, rows = 3 }: Props) {
  const { state, error, level, start, stop } = useVoiceCapture((text) =>
    onChange(value.trim() ? `${value.trim()} ${text}` : text),
  );
  const recording = state === "recording";
  const transcribing = state === "transcribing";

  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={transcribing ? "Transcribing with ElevenLabs..." : placeholder}
        className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-base text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/60"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (recording ? stop() : void start())}
          disabled={transcribing}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
            recording ? "bg-rose-500/90 text-white" : "bg-emerald-400/90 text-emerald-950 hover:bg-emerald-300"
          }`}
          style={recording ? { boxShadow: `0 0 0 ${4 + level * 14}px rgba(244,63,94,0.15)` } : undefined}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${recording ? "animate-pulse bg-white" : "bg-emerald-900"}`} />
          {recording ? "Stop & transcribe" : transcribing ? "Transcribing..." : "Record answer"}
        </button>
        {recording && (
          <div className="flex h-6 items-end gap-[3px]">
            {[0.25, 0.6, 1, 0.6, 0.25].map((weight, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-emerald-300 transition-all"
                style={{ height: `${Math.max(4, level * 24 * weight + 4)}px` }}
              />
            ))}
          </div>
        )}
        {error && <span className="text-xs text-rose-300/90">{error}</span>}
      </div>
    </div>
  );
}
