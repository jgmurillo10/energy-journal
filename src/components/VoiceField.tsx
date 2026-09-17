"use client";

import Orb from "./Orb";
import { useVoiceCapture } from "@/lib/speech";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
};

export default function VoiceField({ value, onChange, placeholder, rows = 3 }: Props) {
  const { state, error, level, start, stop, cancel } = useVoiceCapture(
    (text) => onChange(value.trim() ? `${value.trim()} ${text}` : text),
    3000,
  );
  const recording = state === "recording";
  const transcribing = state === "transcribing";
  const starting = state === "starting";

  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={transcribing ? "Transcribing with ElevenLabs..." : placeholder}
        className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-base text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/60"
      />
      {/* pb leaves room for the orb's absolutely positioned label. */}
      <div className="flex flex-col items-center gap-2 pt-2 pb-8">
        <Orb
          size="sm"
          mode={recording ? "listening" : transcribing ? "thinking" : "idle"}
          level={level}
          onClick={() => (recording ? stop() : transcribing || starting ? undefined : void start())}
          label={
            recording
              ? "Tap when done — or pause"
              : starting
                ? "Getting the mic ready"
                : transcribing
                  ? "Transcribing"
                  : "Tap to speak"
          }
        />
        {recording && (
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancel recording"
            className="mt-5 grid h-8 w-8 place-items-center rounded-full border border-rose-400/70 text-rose-300 transition hover:bg-rose-500/20 hover:text-rose-100"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {error && <span className="pt-6 text-xs text-rose-300/90">{error}</span>}
      </div>
    </div>
  );
}
