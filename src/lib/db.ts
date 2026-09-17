import Database from "better-sqlite3";
import type { Entry, Mood, Profile, Trigger } from "./types";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

declare global {
  var __energyJournalDb: Database.Database | undefined;
}

function init(): Database.Database {
  const database = new Database(path.join(dataDir, "journal.db"));
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      enjoys TEXT NOT NULL DEFAULT '',
      first_day TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'text',
      mood TEXT NOT NULL,
      sentiment REAL NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 50,
      battery INTEGER NOT NULL DEFAULT 50,
      triggers TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries (created_at);
  `);
  return database;
}

export type { Entry, Mood, Profile, Trigger };

export const db = globalThis.__energyJournalDb ?? init();
if (process.env.NODE_ENV !== "production") globalThis.__energyJournalDb = db;

export type EntryRow = Omit<Entry, "triggers"> & { triggers: string };

export function rowToEntry(row: EntryRow): Entry {
  return { ...row, triggers: JSON.parse(row.triggers) as Trigger[] };
}

export function getProfile(): Profile | null {
  const row = db.prepare("SELECT name, gender, enjoys, first_day, created_at FROM profile WHERE id = 1").get() as
    | Profile
    | undefined;
  return row ?? null;
}

export function saveProfile(p: Omit<Profile, "created_at">): Profile {
  const created_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO profile (id, name, gender, enjoys, first_day, created_at)
     VALUES (1, @name, @gender, @enjoys, @first_day, @created_at)
     ON CONFLICT(id) DO UPDATE SET name = @name, gender = @gender, enjoys = @enjoys, first_day = @first_day`,
  ).run({ ...p, created_at });
  return getProfile()!;
}

export function listEntries(limit = 200): Entry[] {
  const rows = db
    .prepare("SELECT * FROM entries ORDER BY datetime(created_at) DESC LIMIT ?")
    .all(limit) as EntryRow[];
  return rows.map(rowToEntry);
}

export function insertEntry(entry: Omit<Entry, "id" | "created_at"> & { created_at?: string }): Entry {
  const created_at = entry.created_at ?? new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO entries (created_at, text, source, mood, sentiment, energy, battery, triggers)
       VALUES (@created_at, @text, @source, @mood, @sentiment, @energy, @battery, @triggers)`,
    )
    .run({
      created_at,
      text: entry.text,
      source: entry.source,
      mood: entry.mood,
      sentiment: entry.sentiment,
      energy: entry.energy,
      battery: entry.battery,
      triggers: JSON.stringify(entry.triggers),
    });
  const row = db.prepare("SELECT * FROM entries WHERE id = ?").get(info.lastInsertRowid) as EntryRow;
  return rowToEntry(row);
}

export function deleteEntry(id: number): void {
  db.prepare("DELETE FROM entries WHERE id = ?").run(id);
}
