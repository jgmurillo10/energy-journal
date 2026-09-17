import { NextResponse } from "next/server";
import { exportJournal, insertEntry, recordAudit, saveProfile, type AuditEvent, type Entry, type Profile } from "@/lib/db";
import { currentOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

type Backup = { profile?: Profile | null; entries?: Entry[]; audit?: AuditEvent[] };

/** Portable backup: everything the journal holds, in the shape the import below accepts. */
export async function GET() {
  const { key } = await currentOwner();
  return NextResponse.json({ version: 1, exported_at: new Date().toISOString(), ...(await exportJournal(key)) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Backup;
  const { key } = await currentOwner();

  if (body.profile?.name) await saveProfile(key, body.profile);
  for (const entry of body.entries ?? []) await insertEntry(key, entry);
  for (const event of body.audit ?? []) {
    await recordAudit(key, {
      field: event.field,
      before: event.before,
      after: event.after,
      method: event.method,
      transcript: event.transcript,
    });
  }

  return NextResponse.json({ ok: true, ...(await exportJournal(key)) });
}
