import { NextResponse } from "next/server";
import { googleConfigured } from "@/lib/google";
import { magicLinkConfigured } from "@/lib/magicLink";
import { SESSION_COOKIE } from "@/lib/journalSession";
import { currentOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function GET() {
  const { account } = await currentOwner();
  return NextResponse.json({
    account,
    googleEnabled: googleConfigured(),
    magicLinkEnabled: magicLinkConfigured(),
  });
}

/** Signing out only drops the session cookie; the account's journal stays in its namespace. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
