import { del, list, put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import type { AuditEvent, Entry, Mood, Profile, Trigger } from "./types";

export type { AuditEvent, Entry, Mood, Profile, Trigger };

type LocalStore = { profile: Profile | null; entries: Entry[]; audit?: AuditEvent[] };

/**
 * Journal storage. In production it lives in Vercel Blob, one immutable object per record:
 * overwriting a blob path is only eventually consistent, so every write creates a new path and
 * stale copies are deleted afterwards. Locally it falls back to a single JSON file.
 */
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Unguessable path segment so the public blob URLs cannot be discovered. */
const root = `journal/${process.env.JOURNAL_BLOB_KEY ?? "local"}`;
const profilePrefix = `${root}/profile/`;
const entryPrefix = `${root}/entries/`;
const auditPrefix = `${root}/audit/`;
const localPath = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "journal.json");

async function readLocal(): Promise<LocalStore> {
  try {
    return JSON.parse(await fs.readFile(localPath, "utf8")) as LocalStore;
  } catch {
    return { profile: null, entries: [] };
  }
}

async function writeLocal(store: LocalStore): Promise<void> {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, JSON.stringify(store));
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

export async function getProfile(): Promise<Profile | null> {
  if (!useBlob) return (await readLocal()).profile;
  const blobs = await listBlobs(profilePrefix);
  if (!blobs.length) return null;
  const newest = blobs.reduce((a, b) => (b.uploadedAt > a.uploadedAt ? b : a));
  return fetchJson<Profile>(newest.url);
}

export async function saveProfile(p: Omit<Profile, "created_at">): Promise<Profile> {
  const existing = await getProfile();
  const profile: Profile = { ...p, created_at: existing?.created_at ?? new Date().toISOString() };
  if (!useBlob) {
    const store = await readLocal();
    await writeLocal({ ...store, profile });
    return profile;
  }
  const stale = await listBlobs(profilePrefix);
  await putJson(`${profilePrefix}${Date.now()}.json`, profile);
  if (stale.length) await del(stale.map((b) => b.url));
  return profile;
}

export async function listAudit(limit = 200): Promise<AuditEvent[]> {
  const events = useBlob
    ? (await Promise.all((await listBlobs(auditPrefix)).map((b) => fetchJson<AuditEvent>(b.url)))).filter(
        (e): e is AuditEvent => e !== null,
      )
    : ((await readLocal()).audit ?? []);
  return events.sort((a, b) => b.id - a.id).slice(0, limit);
}

export async function recordAudit(event: Omit<AuditEvent, "id" | "at">): Promise<AuditEvent> {
  const created: AuditEvent = { ...event, id: newId(), at: new Date().toISOString() };
  if (!useBlob) {
    const store = await readLocal();
    await writeLocal({ ...store, audit: [...(store.audit ?? []), created] });
    return created;
  }
  await putJson(`${auditPrefix}${created.id}.json`, created);
  return created;
}

export async function listEntries(limit = 200): Promise<Entry[]> {
  const entries = useBlob
    ? (
        await Promise.all((await listBlobs(entryPrefix)).map((b) => fetchJson<Entry>(b.url)))
      ).filter((e): e is Entry => e !== null)
    : (await readLocal()).entries;
  return entries
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

/** Time-ordered id that stays unique across concurrent serverless invocations. */
function newId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export async function insertEntry(
  entry: Omit<Entry, "id" | "created_at"> & { created_at?: string },
): Promise<Entry> {
  const created: Entry = { ...entry, id: newId(), created_at: entry.created_at ?? new Date().toISOString() };
  if (!useBlob) {
    const store = await readLocal();
    await writeLocal({ ...store, entries: [...store.entries, created] });
    return created;
  }
  await putJson(`${entryPrefix}${created.id}.json`, created);
  return created;
}

export async function deleteEntry(id: number): Promise<void> {
  if (!useBlob) {
    const store = await readLocal();
    await writeLocal({ ...store, entries: store.entries.filter((e) => e.id !== id) });
    return;
  }
  const target = (await listBlobs(entryPrefix)).find((b) => b.pathname === `${entryPrefix}${id}.json`);
  if (target) await del(target.url);
}
