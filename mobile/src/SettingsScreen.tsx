import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { journalCode, openJournalWithCode, updateProfile, type Profile } from './api';

export default function SettingsScreen({
  profile,
  onProfile,
  onClose,
  onRedo,
  onSwitchedJournal,
}: {
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onClose: () => void;
  onRedo: () => void;
  onSwitchedJournal: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [enjoys, setEnjoys] = useState(profile.enjoys);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [pairing, setPairing] = useState('');

  async function save() {
    setError(null);
    try {
      const { profile: saved } = await updateProfile({ name, enjoys });
      onProfile(saved);
      setStatus('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Settings</Text>
          <Text style={styles.title}>Your journal</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={14}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>

      <Field label="Name" value={name} onChange={setName} />
      <Field label="Enjoys" value={enjoys} onChange={setEnjoys} />
      <Pressable onPress={() => void save()} style={styles.button}>
        <Text style={styles.buttonText}>Save details</Text>
      </Pressable>
      {status && <Text style={styles.ok}>{status}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>This journal on another device</Text>
      <Text style={styles.body}>
        The code below opens this same journal in the web app or on another phone. Anyone with it can read your
        notes, so share it carefully.
      </Text>
      <Pressable
        onPress={async () => {
          const { code: value } = await journalCode();
          setCode(value);
        }}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Show my code</Text>
      </Pressable>
      {code && <Text style={styles.code}>{code}</Text>}

      <Text style={styles.section}>Open a journal with a code</Text>
      <TextInput
        value={pairing}
        onChangeText={setPairing}
        autoCapitalize="characters"
        placeholder="Paste a journal code"
        placeholderTextColor="rgba(255,255,255,0.3)"
        style={styles.input}
      />
      <Pressable
        onPress={async () => {
          setError(null);
          try {
            await openJournalWithCode(pairing.trim());
            onSwitchedJournal();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'That code is not valid');
          }
        }}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Open it here</Text>
      </Pressable>

      <Pressable onPress={onRedo} style={{ marginTop: 32 }}>
        <Text style={styles.danger}>Redo setup</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} style={styles.input} placeholderTextColor="rgba(255,255,255,0.3)" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 64 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kicker: { color: 'rgba(52,211,153,0.8)', letterSpacing: 3, textTransform: 'uppercase', fontSize: 10 },
  title: { color: '#fff', fontSize: 26, fontWeight: '600', marginTop: 4 },
  link: { color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2, fontSize: 11 },
  label: { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    padding: 12,
    fontSize: 16,
    marginTop: 8,
  },
  button: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.5)',
    backgroundColor: 'rgba(52,211,153,0.14)',
  },
  buttonText: { color: '#6ee7b7', letterSpacing: 1 },
  section: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 34 },
  body: { color: 'rgba(255,255,255,0.45)', marginTop: 8, lineHeight: 20 },
  code: { color: '#6ee7b7', marginTop: 12, fontSize: 15, letterSpacing: 1 },
  ok: { color: '#6ee7b7', marginTop: 10 },
  error: { color: '#fb7185', marginTop: 10 },
  danger: { color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2, fontSize: 11 },
});
