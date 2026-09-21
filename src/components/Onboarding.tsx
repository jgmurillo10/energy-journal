"use client";

import { useCallback, useRef, useState } from "react";
import Orb, { type OrbMode } from "./Orb";
import { speak, stopSpeaking, unlockAudio, useVoiceCapture } from "@/lib/speech";
import type { ExtractionMethod, Profile, ProfileField } from "@/lib/types";

type StepKey = ProfileField | "firstDay";

const STEPS: { key: StepKey; question: (name: string) => string }[] = [
  { key: "name", question: () => "Hi, I'm your energy journal. What should I call you?" },
  { key: "enjoys", question: (name) => (name ? `So ${name}, what do you truly enjoy doing?` : "What do you truly enjoy doing?") },
  { key: "firstDay", question: () => "And how was your day today?" },
];

type Turn = { reply: string; value: string; method: ExtractionMethod; skipped: boolean };

const SKIP_REPLY = "No problem, we can skip that.";

/** Asks the model to react to the answer and pull out the value; falls back to a plain acknowledgement. */
async function converse(step: StepKey, answer: string, name: string, nextQuestion: string): Promise<Turn> {
  if (!answer.trim()) return { reply: SKIP_REPLY, value: "", method: "rules", skipped: true };
  try {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, answer, name, nextQuestion }),
    });
    if (res.ok) return (await res.json()) as Turn;
  } catch {
    // Fall through to the plain acknowledgement.
  }
  return { reply: name ? `Thanks, ${name}.` : "Thanks.", value: "", method: "rules", skipped: false };
}

type Phase = "intro" | "permission" | "speaking" | "listening" | "thinking" | "saving";

/** Quiet time after speech that auto-submits the answer. */
const SILENCE_MS = 2500;

export default function Onboarding({ onDone }: { onDone: (profile: Profile) => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lead, setLead] = useState("");
  const answersRef = useRef<Record<StepKey, string>>({ name: "", enjoys: "", firstDay: "" });
  const processedRef = useRef<Partial<Record<ProfileField, string>>>({});
  const methodsRef = useRef<Partial<Record<ProfileField, ExtractionMethod>>>({});
  const firstNameRef = useRef("");

  const save = useCallback(
    async (answers: Record<StepKey, string>) => {
      setPhase("saving");
      try {
        // The server keeps the raw transcript next to these cleaned values.
        const processed = processedRef.current;
        const methods = methodsRef.current;
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...answers, processed, methods }),
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
  /** Bumped whenever an answer is committed so an interrupted question does not reopen the mic. */
  const turnRef = useRef(0);

  const ask = useCallback(
    async (index: number, reply = "") => {
      const turn = turnRef.current;
      setStepIndex(index);
      setHeard("");
      setDraft("");
      setLead(reply);
      setPhase("speaking");
      try {
        const question = STEPS[index].question(firstNameRef.current);
        await speak(reply ? `${reply} ${question}` : question, setSpeechLevel);
      } catch {
        setError("Voice playback is unavailable — the question is written below.");
      }
      if (turn !== turnRef.current) return;
      setSpeechLevel(0);
      setPhase("listening");
      await startRef.current();
    },
    [],
  );

  const commit = useCallback(
    (index: number, value: string) => {
      const key = STEPS[index].key;
      turnRef.current += 1;
      answersRef.current = { ...answersRef.current, [key]: value };
      setHeard(value);
      setTyping(false);
      setPhase("thinking");
      void (async () => {
        const last = index === STEPS.length - 1;
        const nextQuestion = last ? "" : STEPS[index + 1].question(firstNameRef.current);
        const turn = await converse(key, value, firstNameRef.current, nextQuestion);
        if (key !== "firstDay") {
          processedRef.current[key] = turn.value;
          methodsRef.current[key] = turn.method;
        }
        if (key === "name") {
          // Address the rest of the conversation to them by first name, if they gave one.
          const first = turn.value.split(" ")[0] ?? "";
          firstNameRef.current = first;
          setFirstName(first);
        }
        if (last) {
          setLead(turn.reply);
          setPhase("speaking");
          try {
            await speak(`${turn.reply} Let's get you set up.`, setSpeechLevel);
          } catch {
            // Saving is what matters; the reply is a nicety.
          }
          setSpeechLevel(0);
          void save(answersRef.current);
          return;
        }
        void ask(index + 1, turn.reply);
      })();
    },
    [ask, save],
  );

  function skip() {
    stopSpeaking();
    cancel();
    setSpeechLevel(0);
    commit(stepIndex, "");
  }

  const stepIndexRef = useRef(0);
  stepIndexRef.current = stepIndex;

  const {
    state: micState,
    error: micError,
    level: micLevel,
    start,
    stop,
    cancel,
    requestPermission,
  } = useVoiceCapture((text) => {
    commit(stepIndexRef.current, text);
  }, SILENCE_MS);
  startRef.current = start;

  const mode: OrbMode =
    phase === "speaking" ? "speaking" : micState === "recording" ? "listening" : phase === "thinking" || micState === "transcribing" || phase === "saving" ? "thinking" : "idle";
  const level = phase === "speaking" ? speechLevel : micState === "recording" ? micLevel : 0;

  const hint =
    phase === "intro"
      ? "Tap to begin"
      : phase === "permission"
        ? "Allow the microphone"
        : phase === "speaking"
          ? "Listen"
          : phase === "thinking"
            ? "Thinking"
          : micState === "starting"
            ? "Getting the mic ready"
            : micState === "recording"
              ? "Tap when you're done — or just pause"
              : micState === "transcribing"
                ? "Transcribing"
                : phase === "saving"
                  ? "Setting things up"
                  : "Tap to answer";

  const canSkip = phase === "speaking" || phase === "listening";

  function handleOrbClick() {
    setError(null);
    // Must happen inside the tap: iOS only lets audio start from a gesture.
    void unlockAudio();
    if (phase === "intro") {
      setPhase("permission");
      void requestPermission().then((granted) => {
        if (granted) {
          void ask(0);
        } else {
          setPhase("listening");
          setTyping(true);
        }
      });
      return;
    }
    if (phase === "permission" || phase === "thinking" || phase === "saving" || micState === "starting") return;
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
          {phase === "intro" || phase === "permission" ? (
            "Let's set up your energy journal."
          ) : phase === "saving" || (phase === "speaking" && stepIndex === STEPS.length - 1 && lead) ? (
            lead || "Setting things up."
          ) : (
            <>
              {lead && <span className="block text-lg text-white/50 sm:text-xl">{lead}</span>}
              {STEPS[stepIndex].question(firstName)}
            </>
          )}
        </p>

        <Orb mode={mode} level={level} onClick={handleOrbClick} label={hint} />

        {micState === "recording" && (
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancel answer"
            className="-mt-6 grid h-10 w-10 place-items-center rounded-full border border-rose-400/70 text-rose-300 transition hover:bg-rose-500/20 hover:text-rose-100"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}

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
                disabled={phase === "thinking" || phase === "saving"}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-200 disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {phase !== "intro" && phase !== "permission" && phase !== "saving" && phase !== "thinking" && (
            <button
              type="button"
              onClick={skip}
              disabled={!canSkip && !typing}
              className="mt-4 text-xs uppercase tracking-[0.2em] text-white/40 transition hover:text-white/80 disabled:opacity-30"
            >
              Skip this question
            </button>
          )}

          {(error ?? micError) && <p className="mt-3 text-sm text-rose-300">{error ?? micError}</p>}

          {phase === "speaking" && (
            <p className="mt-3 text-xs text-white/25">Can&apos;t hear me? Turn off silent mode and check the volume.</p>
          )}

          {phase !== "intro" && phase !== "permission" && phase !== "saving" && !typing && (
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setTyping(true);
              }}
              className="mt-3 text-xs uppercase tracking-[0.2em] text-white/30 transition hover:text-white/70"
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
                i === stepIndex && phase !== "intro" && phase !== "permission" ? "w-8 bg-emerald-300" : i < stepIndex ? "w-4 bg-emerald-300/40" : "w-4 bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
