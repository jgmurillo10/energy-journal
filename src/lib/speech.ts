"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "starting" | "recording" | "transcribing";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

const SILENCE_LEVEL = 0.06;
/** Sampling period of the loudness meter; an interval keeps running when the screen dims. */
const TICK_MS = 50;
/** Hard stop so a noisy room can never record forever. */
const MAX_RECORDING_MS = 90_000;

/**
 * Records microphone audio and transcribes it with ElevenLabs Scribe via /api/stt.
 * When `silenceMs` is set, the recording stops itself after that much quiet following speech.
 */
export function useVoiceCapture(onTranscript: (text: string) => void, silenceMs?: number) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;
  const cancelledRef = useRef(false);
  const spokeRef = useRef(false);
  const quietSinceRef = useRef<number | null>(null);
  const silenceRef = useRef(silenceMs);
  silenceRef.current = silenceMs;

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = null;
    if (maxTimerRef.current !== null) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stopRecorder = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const monitorLevel = useCallback((stream: MediaStream) => {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    audioContextRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) sum += (value - 128) ** 2;
      const next = Math.min(1, Math.sqrt(sum / data.length) / 40);
      setLevel(next);
      if (silenceRef.current) {
        if (next > SILENCE_LEVEL) {
          spokeRef.current = true;
          quietSinceRef.current = null;
        } else if (spokeRef.current) {
          quietSinceRef.current ??= performance.now();
          if (performance.now() - quietSinceRef.current > silenceRef.current) stopRecorder();
        }
      }
    };
    timerRef.current = setInterval(tick, TICK_MS);
  }, [stopRecorder]);

  const transcribe = useCallback(async (blob: Blob) => {
    setState("transcribing");
    try {
      const form = new FormData();
      const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      form.append("audio", blob, `entry.${extension}`);
      const res = await fetch("/api/stt", { method: "POST", body: form });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Transcription failed");
      if (data.text?.trim()) callbackRef.current(data.text.trim());
      else setError("I couldn't hear anything. Try again a bit closer to the mic.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setState("idle");
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      spokeRef.current = false;
      quietSinceRef.current = null;
      monitorLevel(stream);
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        if (cancelledRef.current || blob.size === 0) setState("idle");
        else void transcribe(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      maxTimerRef.current = setTimeout(stopRecorder, MAX_RECORDING_MS);
      setState("recording");
    } catch (e) {
      cleanup();
      setState("idle");
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it, or type your answer instead."
          : "No microphone available. You can type instead.",
      );
    }
  }, [cleanup, monitorLevel, stopRecorder, transcribe]);

  /** Triggers the browser permission prompt up front so recording never starts before access. */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      setError("Microphone access was blocked. Allow it, or type your answer instead.");
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    stopRecorder();
  }, [stopRecorder]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopRecorder();
  }, [stopRecorder]);

  return { state, error, level, start, stop, cancel, setError, requestPermission };
}

let currentAudio: HTMLAudioElement | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let playbackContext: AudioContext | null = null;
let playbackFrame: number | null = null;

function audioContextClass(): typeof AudioContext | undefined {
  return (
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * iOS starts every audio context suspended and only resumes it inside a real tap, so the first
 * tap has to open it — otherwise the questions fetch fine and play into silence. Web Audio also
 * keeps playing when the ringer switch is off, which an <audio> element does not.
 */
export async function unlockAudio(): Promise<void> {
  const AudioCtx = audioContextClass();
  if (!AudioCtx) return;
  if (!playbackContext || playbackContext.state === "closed") playbackContext = new AudioCtx();
  try {
    await playbackContext.resume();
    const source = playbackContext.createBufferSource();
    source.buffer = playbackContext.createBuffer(1, 1, 22050);
    source.connect(playbackContext.destination);
    source.start(0);
  } catch {
    // playback falls back to an <audio> element
  }
}

function meter(context: AudioContext, analyser: AnalyserNode, onLevel: (level: number) => void) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) sum += (value - 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / data.length) / 45));
    playbackFrame = requestAnimationFrame(tick);
  };
  tick();
}

/**
 * Speaks text with the ElevenLabs voice via /api/tts. Resolves when playback ends.
 * `onLevel` receives the playback loudness (0..1) so the UI can animate with the voice.
 */
export async function speak(text: string, onLevel?: (level: number) => void): Promise<void> {
  stopSpeaking();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Voice playback unavailable");
  const bytes = await res.arrayBuffer();

  const context = playbackContext;
  if (context && context.state !== "closed") {
    try {
      await context.resume();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      const source = context.createBufferSource();
      source.buffer = buffer;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(context.destination);
      currentSource = source;
      if (onLevel) meter(context, analyser, onLevel);
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start(0);
      });
      onLevel?.(0);
      if (currentSource === source) stopSpeaking();
      return;
    } catch {
      // fall back to an audio element below
    }
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  const audio = new Audio(url);
  currentAudio = audio;
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
  URL.revokeObjectURL(url);
  onLevel?.(0);
  if (currentAudio === audio) stopSpeaking();
}

export function stopSpeaking() {
  if (playbackFrame !== null) cancelAnimationFrame(playbackFrame);
  playbackFrame = null;
  if (currentSource) {
    try {
      currentSource.onended = null;
      currentSource.stop();
    } catch {
      // already finished
    }
    currentSource = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}
