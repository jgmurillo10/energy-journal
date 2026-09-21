import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { getLocales } from 'expo-localization';
import { fetch } from 'expo/fetch';
import { API_BASE, journalToken } from './api';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'transcribing';

/** Quiet time after speech that auto-submits the answer. */
export const SILENCE_MS = 2500;
/** Hard stop so a noisy room can never record forever. */
const MAX_RECORDING_MS = 90_000;
/** Metering is in dBFS; anything under this counts as silence. */
const SILENCE_DB = -40;

let current: ReturnType<typeof createAudioPlayer> | null = null;

/** Plays an ElevenLabs question. The API streams it, so the player takes the URL directly. */
export async function speak(text: string): Promise<void> {
  stopSpeaking();
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  const player = createAudioPlayer({ uri: `${API_BASE}/api/tts?text=${encodeURIComponent(text)}` });
  current = player;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    player.play();
    // Playback can fail silently on a flaky network; never hang the flow on it.
    setTimeout(finish, 30_000);
  });
  if (current === player) stopSpeaking();
}

export function stopSpeaking(): void {
  if (!current) return;
  const player = current;
  current = null;
  try {
    player.pause();
    player.remove();
  } catch {
    // already released
  }
}

/** Records with the phone mic and transcribes through ElevenLabs Scribe on the API. */
export function useVoiceCapture(onTranscript: (text: string) => void, silenceMs = SILENCE_MS) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const status = useAudioRecorderState(recorder, 100);
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const spokeRef = useRef(false);
  const quietSinceRef = useRef<number | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;
  /** The hook releases the native recorder on unmount; calls after that throw NotFoundException. */
  const mountedRef = useRef(true);
  const finishingRef = useRef(false);

  const level = status.metering == null ? 0 : Math.max(0, Math.min(1, (status.metering + 60) / 60));

  const transcribe = useCallback(async (uri: string) => {
    setState('transcribing');
    try {
      const form = new FormData();
      // expo/fetch serialises an expo-file-system File; a plain {uri} object is rejected.
      form.append('audio', new File(uri) as unknown as Blob);
      form.append('language', getLocales()[0].languageCode ?? 'en');
      const res = await fetch(`${API_BASE}/api/stt`, {
        method: 'POST',
        headers: { 'x-journal-token': await journalToken() },
        body: form,
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Transcription failed');
      if (data.text?.trim()) callbackRef.current(data.text.trim());
      else setError("I couldn't hear anything. Try again a bit closer to the mic.");
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setState('idle');
    }
  }, []);

  const finish = useCallback(async () => {
    if (finishingRef.current || !mountedRef.current) return;
    finishingRef.current = true;
    if (maxTimer.current) clearTimeout(maxTimer.current);
    maxTimer.current = null;
    let uri: string | null = null;
    try {
      if (recorder.isRecording) await recorder.stop();
      uri = recorder.uri;
    } catch {
      // The recorder was never started or has already been released.
    }
    finishingRef.current = false;
    if (!mountedRef.current) return;
    if (cancelledRef.current || !uri) {
      setState('idle');
      return;
    }
    await transcribe(uri);
  }, [recorder, transcribe]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  const start = useCallback(async () => {
    setError(null);
    setState('starting');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone access was blocked. Allow it, or type your answer instead.');
        setState('idle');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      cancelledRef.current = false;
      spokeRef.current = false;
      quietSinceRef.current = null;
      await recorder.prepareToRecordAsync();
      if (!mountedRef.current) return;
      recorder.record();
      setState('recording');
      maxTimer.current = setTimeout(() => void finishRef.current(), MAX_RECORDING_MS);
    } catch {
      setState('idle');
      setError('No microphone available. You can type instead.');
    }
  }, [recorder]);

  const stop = useCallback(() => {
    void finishRef.current();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    void finishRef.current();
  }, []);

  // Auto-submit once they have spoken and then gone quiet.
  useEffect(() => {
    if (state !== 'recording' || status.metering == null) return;
    if (status.metering > SILENCE_DB) {
      spokeRef.current = true;
      quietSinceRef.current = null;
      return;
    }
    if (!spokeRef.current) return;
    quietSinceRef.current ??= Date.now();
    if (Date.now() - quietSinceRef.current > silenceMs) void finishRef.current();
  }, [state, status.metering, silenceMs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (maxTimer.current) clearTimeout(maxTimer.current);
    };
  }, []);

  return { state, error, level, start, stop, cancel, setError };
}
