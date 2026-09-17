import { NextResponse } from "next/server";
import { createJournalToken } from "@/lib/journalSession";

export const dynamic = "force-dynamic";

/**
 * Mints a fresh anonymous journal for a client that cannot hold cookies. The mobile app calls
 * this once on first launch and keeps the token in secure storage from then on.
 */
export async function POST() {
  return NextResponse.json({ token: await createJournalToken() });
}
