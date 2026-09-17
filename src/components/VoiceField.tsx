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
      <div className="flex flex-col items-center gap-2 pt-2">
        <Orb
          size="sm"
          mode={recording ? "listening" : transcribing ? "thinking" : "idle"}
          level={level}
          onClick={() => (recording ? stop() : transcribing ? undefined : void start())}
          label={recording ? "Tap to finish" : transcribing ? "Transcribing" : "Tap to speak"}
        />
        {error && <span className="pt-6 text-xs text-rose-300/90">{error}</span>}
      </div>
    </div>
  );
}
