import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createJournalToken, DEVICE_COOKIE, DEVICE_HEADER } from "@/lib/journalSession";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The recovery code is the journal's own id: 122 random bits, so knowing it is what grants
 * access, and no provider credentials or server-side pairing table are needed. Another device
 * types it in and gets the matching signed cookie.
 */
export async function GET() {
  const device = (await headers()).get(DEVICE_HEADER);
  if (!device) return NextResponse.json({ error: "no journal on this device" }, { status: 404 });
  return NextResponse.json({ code: device.toUpperCase() });
}

export async function POST(request: Request) {
  const { code } = (await request.json()) as { code?: string };
  const trimmed = code?.trim().toLowerCase() ?? "";
  if (!UUID.test(trimmed)) return NextResponse.json({ error: "that code is not valid" }, { status: 400 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEVICE_COOKIE, await createJournalToken(trimmed), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
  return response;
}
