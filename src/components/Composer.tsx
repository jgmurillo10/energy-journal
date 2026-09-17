"use client";

import { useState } from "react";
import VoiceField from "./VoiceField";
import type { Entry, Mood } from "@/lib/types";

const MOODS: { key: Mood | "auto"; label: string; emoji: string }[] = [
  { key: "auto", label: "Let AI decide", emoji: "✨" },
  { key: "good", label: "Good", emoji: "🙂" },
  { key: "neutral", label: "Okay", emoji: "😐" },
  { key: "bad", label: "Bad", emoji: "🙁" },
];

export default function Composer({ onSaved }: { onSaved: (entry: Entry, summary: string) => void }) {
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | "auto">("auto");
  const [energy, setEnergy] = useState(60);
  const [useReportedEnergy, setUseReportedEnergy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!text.trim()) {
      setError("Write or say something first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          mood: mood === "auto" ? undefined : mood,
          energy: useReportedEnergy ? energy : undefined,
        }),
      });
      if (!res.ok) throw new Error("Could not save the entry");
      const { entry, summary } = (await res.json()) as { entry: Entry; summary: string };
      setText("");
      setMood("auto");
      setUseReportedEnergy(false);
      onSaved(entry, summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
      <h2 className="text-lg font-semibold text-white">How is your energy right now?</h2>
      <p className="mt-1 text-sm text-white/50">Speak it or type it. I&apos;ll look for what lifted or drained you.</p>

      <div className="mt-5">
        <VoiceField value={text} onChange={setText} placeholder="Today I felt..." rows={5} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMood(m.key)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              mood === m.key
                ? "border-emerald-300/70 bg-emerald-400/15 text-white"
                : "border-white/10 text-white/60 hover:text-white"
            }`}
          >
            <span className="mr-1">{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={useReportedEnergy}
            onChange={(e) => setUseReportedEnergy(e.target.checked)}
            className="h-4 w-4 accent-emerald-400"
          />
          Set my battery level myself
        </label>
        {useReportedEnergy && (
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={energy}
              onChange={(e) => setEnergy(Number(e.target.value))}
              className="w-full accent-emerald-400"
            />
            <span className="w-12 text-right text-sm font-semibold text-emerald-300">{energy}%</span>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-5 w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save to journal"}
      </button>
    </section>
  );
}
