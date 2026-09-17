import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Orb, { type OrbMode } from './Orb';
import { addEntry, deleteEntry, getEntries, type Entry, type Insights, type Profile } from './api';
import { useVoiceCapture } from './voice';

const MOOD_EMOJI: Record<string, string> = { good: '🙂', neutral: '😐', bad: '🙁' };

/** Journal answers run longer than onboarding ones, so give them a slower pause. */
const SILENCE_MS = 3000;

export default function DashboardScreen({ profile, onOpenSettings }: { profile: Profile; onOpenSettings: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { entries: list, insights: stats } = await getEntries();
      setEntries(list);
      setInsights(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your journal');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (text: string, source: 'voice' | 'text') => {
      if (!text.trim()) return;
      setSaving(true);
      setError(null);
      try {
        await addEntry(text.trim(), source);
        setDraft('');
        setTyping(false);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that note');
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const submitRef = useRef(submit);
  submitRef.current = submit;

  const { state: micState, error: micError, level, start, stop, cancel, setError: setMicError } = useVoiceCapture(
    (text) => void submitRef.current(text, 'voice'),
    SILENCE_MS,
  );

  const mode: OrbMode =
    micState === 'recording' ? 'listening' : micState === 'transcribing' || saving ? 'thinking' : 'idle';

  async function remove(id: number) {
    await deleteEntry(id);
    await load();
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#34d399" />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Energy journal</Text>
          <Text style={styles.hello}>Hey {profile.name.split(' ')[0]}</Text>
        </View>
        <Pressable onPress={onOpenSettings} hitSlop={14} style={styles.cog}>
          <Text style={styles.cogText}>⚙</Text>
        </Pressable>
      </View>

      <View style={styles.composer}>
        <Orb
          mode={mode}
          level={level}
          disabled={saving}
          onPress={() => {
            setMicError(null);
            if (micState === 'recording') stop();
            else if (micState === 'idle') void start();
          }}
        />
        {micState === 'recording' ? (
          <Pressable onPress={cancel} style={styles.cancel} hitSlop={12}>
            <Text style={styles.cancelText}>✕</Text>
          </Pressable>
        ) : (
          <View style={{ height: 60 }} />
        )}
        <Text style={styles.caption}>
          {saving
            ? 'Reading your entry...'
            : micState === 'recording'
              ? 'Listening — tap again when you are done'
              : micState === 'transcribing'
                ? 'Thinking...'
                : 'Tap the orb to add a note'}
        </Text>

        {typing ? (
          <View style={styles.typeArea}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="How is your energy right now?"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.input}
              multiline
            />
            <Pressable onPress={() => void submit(draft, 'text')} style={styles.submit}>
              <Text style={styles.submitText}>{saving ? 'Saving...' : 'Save to journal'}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setTyping(true)}>
            <Text style={styles.link}>Type instead</Text>
          </Pressable>
        )}
        {(error ?? micError) && <Text style={styles.error}>{error ?? micError}</Text>}
      </View>

      {insights && entries.length > 0 && <Battery insights={insights} entries={entries} />}

      <Text style={styles.section}>Your notes</Text>
      {loading && entries.length === 0 ? (
        <ActivityIndicator color="#34d399" />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>Nothing yet — tap the orb and say how your day is going.</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.mood}>{MOOD_EMOJI[entry.mood] ?? '😐'}</Text>
              <Text style={styles.when}>{new Date(entry.created_at).toLocaleString()}</Text>
              {entry.analyzed_by && <Text style={styles.meta}>· {entry.analyzed_by}</Text>}
            </View>
            <View style={styles.cardTop}>
              <Text style={styles.battery}>🔋 {entry.battery}%</Text>
              <Pressable onPress={() => void remove(entry.id)} hitSlop={10}>
                <Text style={styles.delete}>Delete</Text>
              </Pressable>
            </View>
            <Text style={styles.entryText}>{entry.text}</Text>
            <View style={styles.tags}>
              {entry.triggers.map((trigger, index) => (
                <View
                  key={`${entry.id}-${index}`}
                  style={[styles.tag, trigger.polarity === 'negative' ? styles.tagBad : styles.tagGood]}
                >
                  <Text style={styles.tagText}>
                    {trigger.polarity === 'negative' ? '↓' : '↑'} {trigger.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

/** A sparkline needs at least two points; with one note we just show where the battery sits. */
function Battery({ insights, entries }: { insights: Insights; entries: Entry[] }) {
  const series = [...entries].reverse().map((entry) => entry.battery);
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Battery over time</Text>
      {series.length < 2 ? (
        <>
          <Text style={styles.bigNumber}>{series[0]}%</Text>
          <Text style={styles.empty}>One entry so far — add a few more and the movement shows up here.</Text>
        </>
      ) : (
        <View style={styles.bars}>
          {series.slice(-14).map((value, index) => (
            <View key={index} style={styles.barSlot}>
              <View style={[styles.bar, { height: `${Math.max(6, value)}%` }]} />
            </View>
          ))}
        </View>
      )}
      <View style={styles.stats}>
        <Stat label="average battery" value={`${insights.averageBattery}%`} />
        <Stat label="entries" value={`${insights.entryCount}`} />
        <Stat label="day streak" value={`${insights.streakDays}`} />
      </View>
      {(insights.boosters.length > 0 || insights.drainers.length > 0) && (
        <View style={styles.lists}>
          <Text style={styles.listTitle}>Charges you</Text>
          <Text style={styles.listBody}>
            {insights.boosters.map((item) => item.label).join(', ') || 'Not enough notes yet'}
          </Text>
          <Text style={[styles.listTitle, { marginTop: 12 }]}>Drains you</Text>
          <Text style={styles.listBody}>
            {insights.drainers.map((item) => item.label).join(', ') || 'Not enough notes yet'}
          </Text>
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 64 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: 'rgba(52,211,153,0.8)', letterSpacing: 3, textTransform: 'uppercase', fontSize: 10 },
  hello: { color: '#fff', fontSize: 26, fontWeight: '600', marginTop: 4 },
  cog: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cogText: { color: 'rgba(255,255,255,0.6)', fontSize: 18 },
  composer: { alignItems: 'center', marginTop: 24, marginBottom: 36 },
  cancel: {
    marginTop: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: '#fb7185', fontSize: 16 },
  caption: { color: 'rgba(255,255,255,0.45)', marginBottom: 14 },
  typeArea: { width: '100%', alignItems: 'center' },
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
  link: { color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2, fontSize: 11 },
  error: { color: '#fb7185', marginTop: 12, textAlign: 'center' },
  panel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 18,
    marginBottom: 28,
  },
  panelTitle: { color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', fontSize: 10 },
  bigNumber: { color: '#6ee7b7', fontSize: 40, fontWeight: '700', marginTop: 10 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 120, marginTop: 14, gap: 6 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: 'rgba(52,211,153,0.65)', borderRadius: 6 },
  stats: { flexDirection: 'row', marginTop: 18, gap: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '600' },
  statLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  lists: { marginTop: 18 },
  listTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 },
  listBody: { color: '#fff', marginTop: 4 },
  section: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 12 },
  empty: { color: 'rgba(255,255,255,0.4)', marginTop: 6 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 16,
    marginBottom: 14,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  mood: { fontSize: 18 },
  when: { color: 'rgba(255,255,255,0.6)' },
  meta: { color: 'rgba(255,255,255,0.25)', fontSize: 12 },
  battery: { color: '#6ee7b7' },
  delete: { color: 'rgba(255,255,255,0.35)' },
  entryText: { color: '#fff', fontSize: 16, lineHeight: 22, marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tagGood: { backgroundColor: 'rgba(52,211,153,0.16)' },
  tagBad: { backgroundColor: 'rgba(244,63,94,0.16)' },
  tagText: { color: '#fff', fontSize: 12 },
});
