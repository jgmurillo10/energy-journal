"use client";

import { useEffect, useState } from "react";
import VoiceField from "./VoiceField";
import { speak, stopSpeaking } from "@/lib/speech";
import type { Profile } from "@/lib/types";

type StepKey = "name" | "gender" | "enjoys" | "firstDay";

const STEPS: { key: StepKey; question: string; placeholder: string; rows: number }[] = [
  { key: "name", question: "Hi! I'm your energy journal. What's your name?", placeholder: "My name is...", rows: 2 },
  { key: "gender", question: "Nice to meet you. What gender do you identify with?", placeholder: "Woman, man, non-binary, prefer not to say...", rows: 2 },
  { key: "enjoys", question: "What do you truly enjoy doing?", placeholder: "Things that light me up...", rows: 3 },
  { key: "firstDay", question: "Last one: how was your day today?", placeholder: "Today I...", rows: 5 },
];

export default function Onboarding({ onDone }: { onDone: (profile: Profile) => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<StepKey, string>>({ name: "", gender: "", enjoys: "", firstDay: "" });
  const [voiceMode, setVoiceMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  useEffect(() => {
    if (!voiceMode) return;
    speak(step.question).catch(() => setError("Voice playback is unavailable — the questions are written below."));
    return () => stopSpeaking();
  }, [step.question, voiceMode]);

  async function finish(final: Record<StepKey, string>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(final),
      });
      if (!res.ok) throw new Error("Could not save your profile");
      const { profile } = (await res.json()) as { profile: Profile };
      if (final.firstDay.trim()) {
        await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: final.firstDay, source: voiceMode ? "voice" : "text" }),
        });
      }
      stopSpeaking();
      onDone(profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  }

  function next() {
    if (step.key === "name" && !answers.name.trim()) {
      setError("I need a name to call you by.");
      return;
    }
    setError(null);
    if (stepIndex === STEPS.length - 1) void finish(answers);
    else setStepIndex((i) => i + 1);
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`h-1 flex-1 rounded-full transition ${i <= stepIndex ? "bg-emerald-400" : "bg-white/10"}`}
          />
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">{step.question}</h2>
        <div className="mt-6">
          <VoiceField
            key={step.key}
            value={answers[step.key]}
            onChange={(value) => setAnswers((a) => ({ ...a, [step.key]: value }))}
            placeholder={step.placeholder}
            rows={step.rows}
          />
        </div>

        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              setVoiceMode((v) => !v);
            }}
            className="text-xs text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
          >
            {voiceMode ? "Mute the voice guide" : "Unmute the voice guide"}
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 hover:text-white"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={saving}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-200 disabled:opacity-50"
            >
              {saving ? "Saving..." : stepIndex === STEPS.length - 1 ? "Start my journal" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
