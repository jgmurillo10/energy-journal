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
import { addEntry, onboardingTurn, saveProfile, type OnboardingStep, type OnboardingTurn, type Profile } from './api';
import { speak, stopSpeaking, useVoiceCapture } from './voice';

type StepKey = OnboardingStep;

const STEPS: { key: StepKey; question: (name: string) => string }[] = [
  { key: 'name', question: () => "Hi, I'm your energy journal. What should I call you?" },
  { key: 'enjoys', question: (name) => (name ? `So ${name}, what do you truly enjoy doing?` : 'What do you truly enjoy doing?') },
  { key: 'firstDay', question: () => 'And how was your day today?' },
];

const SKIP_REPLY = 'No problem, we can skip that.';

/** Asks the model to react to the answer and pull out the value; falls back to a plain acknowledgement. */
async function converse(step: StepKey, answer: string, name: string, nextQuestion: string): Promise<OnboardingTurn> {
  if (!answer.trim()) return { reply: SKIP_REPLY, value: '', method: 'rules', skipped: true };
  try {
    return await onboardingTurn({ step, answer, name, nextQuestion });
  } catch {
    return { reply: name ? `Thanks, ${name}.` : 'Thanks.', value: '', method: 'rules', skipped: false };
  }
}

type Phase = 'intro' | 'speaking' | 'listening' | 'thinking' | 'saving';

export default function OnboardingScreen({ onDone }: { onDone: (profile: Profile) => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [heard, setHeard] = useState('');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lead, setLead] = useState('');
  const firstNameRef = useRef('');
  const answersRef = useRef<Record<StepKey, string>>({ name: '', enjoys: '', firstDay: '' });
  const processedRef = useRef<Partial<Record<'name' | 'enjoys', string>>>({});
  const methodsRef = useRef<Partial<Record<'name' | 'enjoys', OnboardingTurn['method']>>>({});
  /** Bumped whenever an answer is committed so an interrupted question does not reopen the mic. */
  const turnRef = useRef(0);

  const save = useCallback(
    async (answers: Record<StepKey, string>) => {
      setPhase('saving');
      try {
        const { profile } = await saveProfile({ ...answers, processed: processedRef.current, methods: methodsRef.current });
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

  const ask = useCallback(async (index: number, reply = '') => {
    const turn = turnRef.current;
    setStepIndex(index);
    setHeard('');
    setDraft('');
    setLead(reply);
    setPhase('speaking');
    try {
      const question = STEPS[index].question(firstNameRef.current);
      await speak(reply ? `${reply} ${question}` : question);
    } catch {
      setError('Voice playback is unavailable — the question is written below.');
    }
    if (turn !== turnRef.current) return;
    setPhase('listening');
    await startRef.current();
  }, []);

  const commit = useCallback(
    (index: number, value: string) => {
      const key = STEPS[index].key;
      turnRef.current += 1;
      answersRef.current = { ...answersRef.current, [key]: value };
      setHeard(value);
      setTyping(false);
      setPhase('thinking');
      void (async () => {
        const last = index === STEPS.length - 1;
        const nextQuestion = last ? '' : STEPS[index + 1].question(firstNameRef.current);
        const turn = await converse(key, value, firstNameRef.current, nextQuestion);
        if (key !== 'firstDay') {
          processedRef.current[key] = turn.value;
          methodsRef.current[key] = turn.method;
        }
        if (key === 'name') {
          const first = turn.value.split(' ')[0] ?? '';
          firstNameRef.current = first;
          setFirstName(first);
        }
        if (last) {
          setLead(turn.reply);
          setPhase('speaking');
          try {
            await speak(`${turn.reply} Let's get you set up.`);
          } catch {
            // Saving is what matters; the reply is a nicety.
          }
          void save(answersRef.current);
          return;
        }
        void ask(index + 1, turn.reply);
      })();
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
        : micState === 'transcribing' || phase === 'saving' || phase === 'thinking'
          ? 'thinking'
          : 'idle';

  const caption =
    phase === 'intro'
      ? 'Tap to begin'
      : phase === 'saving'
        ? 'Saving your details...'
        : micState === 'transcribing' || phase === 'thinking'
          ? 'Thinking...'
          : micState === 'recording'
            ? 'Listening — tap again when you are done'
            : phase === 'speaking'
              ? 'Speaking...'
              : 'Tap to answer';

  const busy = phase === 'thinking' || phase === 'saving';

  function skip() {
    stopSpeaking();
    cancel();
    Keyboard.dismiss();
    setDraft('');
    commit(stepIndex, '');
  }

  function handleOrbPress() {
    setError(null);
    setMicError(null);
    if (busy) return;
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
      {!!lead && phase !== 'intro' && <Text style={styles.lead}>{lead}</Text>}
      <Text style={styles.question}>
        {phase === 'intro' ? "Let's set up your journal." : phase === 'saving' ? 'Setting things up.' : STEPS[stepIndex].question(firstName)}
      </Text>

      <Orb mode={mode} level={level} onPress={handleOrbPress} disabled={busy} />

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

      {phase !== 'intro' && !busy && (
        <Pressable onPress={skip} style={styles.skip} hitSlop={10}>
          <Text style={styles.link}>Skip this question</Text>
        </Pressable>
      )}

      {phase !== 'intro' && !busy && (
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
  lead: { color: 'rgba(255,255,255,0.5)', fontSize: 17, textAlign: 'center', marginTop: 14, lineHeight: 24 },
  question: { color: '#fff', fontSize: 24, textAlign: 'center', marginTop: 14, marginBottom: 36, lineHeight: 32 },
  skip: { marginTop: 22 },
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
