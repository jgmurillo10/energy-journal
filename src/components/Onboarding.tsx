"use client";

import { useCallback, useRef, useState } from "react";
import Orb, { type OrbMode } from "./Orb";
import { speak, stopSpeaking, useVoiceCapture } from "@/lib/speech";
import type { Profile } from "@/lib/types";

type StepKey = "name" | "gender" | "enjoys" | "firstDay";

const STEPS: { key: StepKey; question: string }[] = [
  { key: "name", question: "Hi. I'm your energy journal. What's your name?" },
  { key: "gender", question: "Nice to meet you. What gender do you identify with?" },
  { key: "enjoys", question: "What do you truly enjoy doing?" },
  { key: "firstDay", question: "Last one. How was your day today?" },
];

type Phase = "intro" | "speaking" | "listening" | "thinking" | "saving";

export default function Onboarding({ onDone }: { onDone: (profile: Profile) => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const answersRef = useRef<Record<StepKey, string>>({ name: "", gender: "", enjoys: "", firstDay: "" });

  const save = useCallback(
    async (answers: Record<StepKey, string>) => {
      setPhase("saving");
      try {
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(answers),
        });
        if (!res.ok) throw new Error("Could not save your profile");
        const { profile } = (await res.json()) as { profile: Profile };
        if (answers.firstDay.trim()) {
          await fetch("/api/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: answers.firstDay, source: "voice" }),
          });
        }
        onDone(profile);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setPhase("listening");
      }
    },
    [onDone],
  );

  const startRef = useRef<() => Promise<void>>(async () => {});

  const ask = useCallback(
    async (index: number) => {
      setStepIndex(index);
      setHeard("");
      setDraft("");
      setPhase("speaking");
      try {
        await speak(STEPS[index].question, setSpeechLevel);
      } catch {
        setError("Voice playback is unavailable — the question is written below.");
      }
      setSpeechLevel(0);
      setPhase("listening");
      await startRef.current();
    },
    [],
  );

  const commit = useCallback(
    (index: number, value: string) => {
      const key = STEPS[index].key;
      answersRef.current = { ...answersRef.current, [key]: value };
      setHeard(value);
      if (index === STEPS.length - 1) void save(answersRef.current);
      else setTimeout(() => void ask(index + 1), 700);
    },
    [ask, save],
  );

  const stepIndexRef = useRef(0);
  stepIndexRef.current = stepIndex;

  const { state: micState, error: micError, level: micLevel, start, stop } = useVoiceCapture((text) => {
    commit(stepIndexRef.current, text);
  });
  startRef.current = start;

  const mode: OrbMode =
    phase === "speaking" ? "speaking" : micState === "recording" ? "listening" : phase === "thinking" || micState === "transcribing" || phase === "saving" ? "thinking" : "idle";
  const level = phase === "speaking" ? speechLevel : micState === "recording" ? micLevel : 0;

  const hint =
    phase === "intro"
      ? "Tap the orb to begin"
      : phase === "speaking"
        ? "Listen"
        : micState === "recording"
          ? "Tap to finish"
          : micState === "transcribing"
            ? "Transcribing"
            : phase === "saving"
              ? "Setting things up"
              : "Tap to answer";

  function handleOrbClick() {
    setError(null);
    if (phase === "intro") {
      void ask(0);
      return;
    }
    if (phase === "speaking") {
      stopSpeaking();
      setSpeechLevel(0);
      setPhase("listening");
      return;
    }
    if (micState === "recording") {
      stop();
    } else if (micState === "idle" && phase === "listening") {
      setTyping(false);
      void start();
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(40rem_30rem_at_50%_35%,rgba(56,189,248,0.12),transparent_70%)]" />

      <div className="relative flex w-full max-w-2xl flex-col items-center gap-14">
        <p
          key={stepIndex}
          className="min-h-[4.5rem] animate-[fadeIn_600ms_ease-out] text-center text-2xl font-light leading-snug text-white/90 sm:text-3xl"
        >
          {phase === "intro" ? "Let's set up your energy journal." : STEPS[stepIndex].question}
        </p>

        <Orb mode={mode} level={level} onClick={handleOrbClick} label={hint} />

        <div className="mt-6 min-h-[5rem] w-full max-w-lg text-center">
          {heard && !typing && <p className="text-base text-emerald-200/80">“{heard}”</p>}

          {typing && (
            <div className="space-y-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Type your answer..."
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-base text-white outline-none placeholder:text-white/25 focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={() => {
                  if (!draft.trim()) return;
                  commit(stepIndex, draft.trim());
                }}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-200"
              >
                Continue
              </button>
            </div>
          )}

          {(error ?? micError) && <p className="mt-3 text-sm text-rose-300">{error ?? micError}</p>}

          {phase !== "intro" && phase !== "saving" && !typing && (
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setTyping(true);
              }}
              className="mt-6 text-xs uppercase tracking-[0.2em] text-white/30 transition hover:text-white/70"
            >
              Type instead
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === stepIndex && phase !== "intro" ? "w-8 bg-emerald-300" : i < stepIndex ? "w-4 bg-emerald-300/40" : "w-4 bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
