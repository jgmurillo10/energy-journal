import { del, list, put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import type { AuditEvent, Entry, Mood, Profile, Trigger } from "./types";

export type { AuditEvent, Entry, Mood, Profile, Trigger };

type LocalStore = Record<string, { profile: Profile | null; entries: Entry[]; audit: AuditEvent[] }>;

type Journal = { profile: Profile | null; entries: Entry[]; audit: AuditEvent[] };

const EMPTY: Journal = { profile: null, entries: [], audit: [] };

/**
 * Journal storage, one namespace per owner (`u/<account>` when signed in, `d/<device>` while
 * onboarding anonymously). In production it lives in Vercel Blob, one immutable object per record:
 * overwriting a blob path is only eventually consistent, so every write creates a new path and
 * stale copies are deleted afterwards. Locally it falls back to a single JSON file.
 */
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Unguessable path segment so the public blob URLs cannot be discovered. */
const root = `journal/${process.env.JOURNAL_BLOB_KEY ?? "local"}`;
const localPath = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "journal.json");

const profilePrefix = (owner: string) => `${root}/${owner}/profile/`;
const entryPrefix = (owner: string) => `${root}/${owner}/entries/`;
const auditPrefix = (owner: string) => `${root}/${owner}/audit/`;

async function readLocal(): Promise<LocalStore> {
  try {
    return JSON.parse(await fs.readFile(localPath, "utf8")) as LocalStore;
  } catch {
    return {};
  }
}

async function readLocalJournal(owner: string): Promise<Journal> {
  return (await readLocal())[owner] ?? EMPTY;
}

/** Writes to the dev JSON file are serialized: concurrent saves otherwise interleave and corrupt it. */
let localWrites: Promise<void> = Promise.resolve();

function updateLocal(owner: string, update: (journal: Journal) => Journal): Promise<void> {
  localWrites = localWrites.then(async () => {
    const store = await readLocal();
    const next = { ...store, [owner]: update(store[owner] ?? EMPTY) };
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, JSON.stringify(next));
  });
  return localWrites;
}

type BlobRef = { pathname: string; url: string; uploadedAt: Date };

async function listBlobs(prefix: string): Promise<BlobRef[]> {
  const { blobs } = await list({ prefix, limit: 1000 });
  return blobs;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  return res.ok ? ((await res.json()) as T) : null;
}

async function putJson(pathname: string, value: unknown): Promise<void> {
  await put(pathname, JSON.stringify(value), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

/** Time-ordered id that stays unique across concurrent serverless invocations. */
function newId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export async function getProfile(owner: string): Promise<Profile | null> {
  if (!useBlob) return (await readLocalJournal(owner)).profile;
  const blobs = await listBlobs(profilePrefix(owner));
  if (!blobs.length) return null;
  const newest = blobs.reduce((a, b) => (b.uploadedAt > a.uploadedAt ? b : a));
  return fetchJson<Profile>(newest.url);
}

export async function saveProfile(owner: string, p: Omit<Profile, "created_at">): Promise<Profile> {
  const existing = await getProfile(owner);
  const profile: Profile = { ...p, created_at: existing?.created_at ?? new Date().toISOString() };
  if (!useBlob) {
    await updateLocal(owner, (journal) => ({ ...journal, profile }));
    return profile;
  }
  const stale = await listBlobs(profilePrefix(owner));
  await putJson(`${profilePrefix(owner)}${Date.now()}.json`, profile);
  if (stale.length) await del(stale.map((b) => b.url));
  return profile;
}

export async function listAudit(owner: string, limit = 200): Promise<AuditEvent[]> {
  const events = useBlob
    ? (
        await Promise.all((await listBlobs(auditPrefix(owner))).map((b) => fetchJson<AuditEvent>(b.url)))
      ).filter((e): e is AuditEvent => e !== null)
    : (await readLocalJournal(owner)).audit;
  return events.sort((a, b) => b.id - a.id).slice(0, limit);
}

export async function recordAudit(owner: string, event: Omit<AuditEvent, "id" | "at">): Promise<AuditEvent> {
  const created: AuditEvent = { ...event, id: newId(), at: new Date().toISOString() };
  if (!useBlob) {
    await updateLocal(owner, (journal) => ({ ...journal, audit: [...journal.audit, created] }));
    return created;
  }
  await putJson(`${auditPrefix(owner)}${created.id}.json`, created);
  return created;
}

export async function listEntries(owner: string, limit = 200): Promise<Entry[]> {
  const entries = useBlob
    ? (await Promise.all((await listBlobs(entryPrefix(owner))).map((b) => fetchJson<Entry>(b.url)))).filter(
        (e): e is Entry => e !== null,
      )
    : (await readLocalJournal(owner)).entries;
  return entries
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export async function insertEntry(
  owner: string,
  entry: Omit<Entry, "id" | "created_at"> & { id?: number; created_at?: string },
): Promise<Entry> {
  const created: Entry = {
    ...entry,
    id: entry.id ?? newId(),
    created_at: entry.created_at ?? new Date().toISOString(),
  };
  if (!useBlob) {
    await updateLocal(owner, (journal) => ({ ...journal, entries: [...journal.entries, created] }));
    return created;
  }
  await putJson(`${entryPrefix(owner)}${created.id}.json`, created);
  return created;
}

export async function deleteEntry(owner: string, id: number): Promise<void> {
  if (!useBlob) {
    await updateLocal(owner, (journal) => ({
      ...journal,
      entries: journal.entries.filter((e) => e.id !== id),
    }));
    return;
  }
  const target = (await listBlobs(entryPrefix(owner))).find(
    (b) => b.pathname === `${entryPrefix(owner)}${id}.json`,
  );
  if (target) await del(target.url);
}

export async function exportJournal(owner: string): Promise<Journal> {
  const [profile, entries, audit] = await Promise.all([
    getProfile(owner),
    listEntries(owner, 1000),
    listAudit(owner, 1000),
  ]);
  return { profile, entries, audit };
}

/** True when the namespace holds nothing, i.e. it is safe to move another journal into it. */
export async function isEmpty(owner: string): Promise<boolean> {
  const [profile, entries] = await Promise.all([getProfile(owner), listEntries(owner, 1)]);
  return !profile && entries.length === 0;
}

/** Copies one namespace into another; used when an anonymous journal is claimed by an account. */
export async function copyJournal(from: string, to: string): Promise<void> {
  const journal = await exportJournal(from);
  if (journal.profile) await saveProfile(to, journal.profile);
  for (const entry of journal.entries) await insertEntry(to, entry);
  for (const event of journal.audit) {
    await recordAudit(to, {
      field: event.field,
      before: event.before,
      after: event.after,
      method: event.method,
      transcript: event.transcript,
    });
  }
}
