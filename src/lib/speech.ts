"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "transcribing";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Records microphone audio and transcribes it with ElevenLabs Scribe via /api/stt. */
export function useVoiceCapture(onTranscript: (text: string) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const cleanup = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

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
      setLevel(Math.min(1, Math.sqrt(sum / data.length) / 40));
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
        if (blob.size > 0) void transcribe(blob);
        else setState("idle");
      };
      recorderRef.current = recorder;
      recorder.start();
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
  }, [cleanup, monitorLevel, transcribe]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  return { state, error, level, start, stop, setError };
}

let currentAudio: HTMLAudioElement | null = null;
let playbackContext: AudioContext | null = null;
let playbackFrame: number | null = null;

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
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  audio.crossOrigin = "anonymous";
  currentAudio = audio;

  if (onLevel) {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const context = new AudioCtx();
      playbackContext = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
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
  }

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
  void playbackContext?.close().catch(() => {});
  playbackContext = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}
