import { NextResponse } from "next/server";
import { magicLinkConfigured, magicLinkUrl, sendMagicLink } from "@/lib/magicLink";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!magicLinkConfigured()) {
    return NextResponse.json({ error: "magic links are not configured" }, { status: 501 });
  }
  const { email } = (await request.json()) as { email?: string };
  if (!email || !EMAIL.test(email)) return NextResponse.json({ error: "valid email required" }, { status: 400 });

  const origin = new URL(request.url).origin;
  const sent = await sendMagicLink(email, await magicLinkUrl(origin, email));
  if (!sent) return NextResponse.json({ error: "could not send the email" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
