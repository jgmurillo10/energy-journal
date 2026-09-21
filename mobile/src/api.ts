import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_BASE = 'https://energy-journal-rosy.vercel.app';

const TOKEN_KEY = 'ej_token';

export type Mood = 'good' | 'neutral' | 'bad';

export type Trigger = {
  label: string;
  category: string;
  polarity: 'positive' | 'negative';
  evidence: string;
};

export type Profile = {
  name: string;
  enjoys: string;
  first_day: string;
  created_at: string;
};

export type Entry = {
  id: number;
  created_at: string;
  text: string;
  source: string;
  mood: Mood;
  energy: number;
  battery: number;
  triggers: Trigger[];
  analyzed_by?: string;
};

export type TriggerStat = { label: string; category: string; count: number; lastEvidence: string };

export type Insights = {
  entryCount: number;
  averageBattery: number;
  streakDays: number;
  moodCounts: { good: number; neutral: number; bad: number };
  boosters: TriggerStat[];
  drainers: TriggerStat[];
};

let token: string | null = null;

/** SecureStore is keychain-only; the web build of the same app falls back to localStorage. */
const store = {
  get: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
      : SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
};

/**
 * The phone has no cookie jar, so it holds the same signed journal token the web app keeps in a
 * cookie and sends it on every request. Minted once on first launch and kept in the keychain.
 */
export async function journalToken(): Promise<string> {
  if (token) return token;
  const stored = await store.get(TOKEN_KEY);
  if (stored) {
    token = stored;
    return stored;
  }
  const res = await fetch(`${API_BASE}/api/journal/token`, { method: 'POST' });
  const { token: minted } = (await res.json()) as { token: string };
  await store.set(TOKEN_KEY, minted);
  token = minted;
  return minted;
}

export async function setJournalToken(value: string): Promise<void> {
  await store.set(TOKEN_KEY, value);
  token = value;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-journal-token', await journalToken());
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function getProfile() {
  return request<{ profile: Profile | null }>('/api/profile');
}

export function saveProfile(body: Record<string, unknown>) {
  return request<{ profile: Profile }>('/api/profile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type OnboardingStep = 'name' | 'enjoys' | 'firstDay';
export type OnboardingTurn = {
  reply: string;
  value: string;
  method: 'local-llm' | 'cloud-llm' | 'rules' | 'user';
  skipped: boolean;
};

/** The model reacts to an onboarding answer and pulls the value out of it. */
export function onboardingTurn(body: { step: OnboardingStep; answer: string; name: string; nextQuestion: string }) {
  return request<OnboardingTurn>('/api/onboarding', { method: 'POST', body: JSON.stringify(body) });
}

export function updateProfile(fields: Partial<Pick<Profile, 'name' | 'enjoys'>>) {
  return request<{ profile: Profile }>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export function getEntries() {
  return request<{ entries: Entry[]; insights: Insights }>('/api/entries');
}

export function addEntry(text: string, source: 'voice' | 'text') {
  return request<{ entry: Entry; summary: string }>('/api/entries', {
    method: 'POST',
    body: JSON.stringify({ text, source }),
  });
}

export function deleteEntry(id: number) {
  return request<{ ok: boolean }>(`/api/entries/${id}`, { method: 'DELETE' });
}

export function journalCode() {
  return request<{ code: string }>('/api/journal/code');
}

export async function openJournalWithCode(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/journal/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !data.token) throw new Error(data.error ?? 'That code is not valid');
  await setJournalToken(data.token);
}
