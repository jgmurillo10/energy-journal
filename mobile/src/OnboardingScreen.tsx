import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Orb, { type OrbMode } from './Orb';
import { addEntry, saveProfile, type Profile } from './api';
import { firstNameFrom } from './extractName';
import { speak, stopSpeaking, useVoiceCapture } from './voice';

type StepKey = 'name' | 'gender' | 'enjoys' | 'firstDay';

const STEPS: { key: StepKey; question: (name: string) => string }[] = [
  { key: 'name', question: () => "Hi. I'm your energy journal. What's your name?" },
  {
    key: 'gender',
    question: (name) =>
      name ? `Nice to meet you, ${name}. What gender do you identify with?` : 'Nice to meet you. What gender do you identify with?',
  },
  { key: 'enjoys', question: (name) => (name ? `What do you truly enjoy doing, ${name}?` : 'What do you truly enjoy doing?') },
  { key: 'firstDay', question: (name) => (name ? `Last one, ${name}. How was your day today?` : 'Last one. How was your day today?') },
];

type Phase = 'intro' | 'speaking' | 'listening' | 'saving';

export default function OnboardingScreen({ onDone }: { onDone: (profile: Profile) => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [heard, setHeard] = useState('');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const firstNameRef = useRef('');
  const answersRef = useRef<Record<StepKey, string>>({ name: '', gender: '', enjoys: '', firstDay: '' });

  const save = useCallback(
    async (answers: Record<StepKey, string>) => {
      setPhase('saving');
      try {
        const { profile } = await saveProfile({ ...answers, firstDay: answers.firstDay });
        if (answers.firstDay.trim()) await addEntry(answers.firstDay, 'voice');
        onDone(profile);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your profile');
        setPhase('listening');
      }
    },
    [onDone],
  );

  const startRef = useRef<() => Promise<void>>(async () => {});

  const ask = useCallback(async (index: number) => {
    setStepIndex(index);
    setHeard('');
    setDraft('');
    setPhase('speaking');
    try {
      await speak(STEPS[index].question(firstNameRef.current));
    } catch {
      setError('Voice playback is unavailable — the question is written below.');
    }
    setPhase('listening');
    await startRef.current();
  }, []);

  const commit = useCallback(
    (index: number, value: string) => {
      const key = STEPS[index].key;
      answersRef.current = { ...answersRef.current, [key]: value };
      setHeard(value);
      if (index === STEPS.length - 1) {
        void save(answersRef.current);
        return;
      }
      if (key === 'name') {
        const first = firstNameFrom(value);
        firstNameRef.current = first;
        setFirstName(first);
      }
      setTimeout(() => void ask(index + 1), 700);
    },
    [ask, save],
  );

  const stepRef = useRef(0);
  stepRef.current = stepIndex;

  const { state: micState, error: micError, level, start, stop, cancel, setError: setMicError } = useVoiceCapture(
    (text) => commit(stepRef.current, text),
  );
  startRef.current = start;

  const mode: OrbMode =
    phase === 'speaking'
      ? 'speaking'
      : micState === 'recording'
        ? 'listening'
        : micState === 'transcribing' || phase === 'saving'
          ? 'thinking'
          : 'idle';

  const caption =
    phase === 'intro'
      ? 'Tap the orb to begin'
      : phase === 'saving'
        ? 'Saving your details...'
        : micState === 'transcribing'
          ? 'Thinking...'
          : micState === 'recording'
            ? 'Listening — tap again when you are done'
            : phase === 'speaking'
              ? 'Speaking...'
              : 'Tap the orb to answer';

  function handleOrbPress() {
    setError(null);
    setMicError(null);
    if (phase === 'intro') {
      void ask(0);
      return;
    }
    if (phase === 'speaking') {
      stopSpeaking();
      setPhase('listening');
      void start();
      return;
    }
    if (micState === 'recording') stop();
    else if (micState === 'idle') void start();
  }

  function sendTyped() {
    const text = draft.trim();
    if (!text) return;
    Keyboard.dismiss();
    setTyping(false);
    setDraft('');
    commit(stepIndex, text);
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.kicker}>{firstName ? `Hey ${firstName}` : 'Energy journal'}</Text>
      <Text style={styles.question}>{phase === 'intro' ? "Let's set up your journal." : STEPS[stepIndex].question(firstName)}</Text>

      <Orb mode={mode} level={level} onPress={handleOrbPress} disabled={phase === 'saving'} />

      {micState === 'recording' ? (
        <Pressable onPress={cancel} style={styles.cancel} hitSlop={12}>
          <Text style={styles.cancelText}>✕</Text>
        </Pressable>
      ) : (
        <View style={styles.cancelSpacer} />
      )}

      <Text style={styles.caption}>{caption}</Text>
      {phase === 'saving' && <ActivityIndicator color="#34d399" style={{ marginTop: 12 }} />}
      {!!heard && <Text style={styles.heard}>“{heard}”</Text>}
      {(error ?? micError) && <Text style={styles.error}>{error ?? micError}</Text>}

      {phase !== 'intro' && phase !== 'saving' && (
        <View style={styles.typeArea}>
          {typing ? (
            <>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type your answer"
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={styles.input}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={sendTyped}
              />
              <Pressable onPress={sendTyped} style={styles.submit}>
                <Text style={styles.submitText}>Send</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setTyping(false);
                  setDraft('');
                }}
              >
                <Text style={styles.link}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setTyping(true)}>
              <Text style={styles.link}>Type instead</Text>
            </Pressable>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: 'rgba(52,211,153,0.8)', letterSpacing: 3, textTransform: 'uppercase', fontSize: 11 },
  question: { color: '#fff', fontSize: 24, textAlign: 'center', marginTop: 14, marginBottom: 36, lineHeight: 32 },
  cancel: {
    marginTop: 22,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSpacer: { height: 60 },
  cancelText: { color: '#fb7185', fontSize: 16 },
  caption: { color: 'rgba(255,255,255,0.45)', marginTop: 18, fontSize: 14 },
  heard: { color: 'rgba(255,255,255,0.8)', marginTop: 14, fontSize: 16, textAlign: 'center' },
  error: { color: '#fb7185', marginTop: 12, textAlign: 'center' },
  typeArea: { marginTop: 26, width: '100%', alignItems: 'center' },
  link: { color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2, fontSize: 11 },
  input: {
    width: '100%',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    padding: 14,
    fontSize: 16,
  },
  submit: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(52,211,153,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.5)',
  },
  submitText: { color: '#6ee7b7', letterSpacing: 1 },
});
