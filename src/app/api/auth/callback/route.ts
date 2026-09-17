import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { copyJournal, isEmpty } from "@/lib/db";
import { exchangeCode, googleConfigured, OAUTH_STATE_COOKIE } from "@/lib/google";
import { createSessionToken, SESSION_COOKIE } from "@/lib/journalSession";
import { deviceKey } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = (await cookies()).get(OAUTH_STATE_COOKIE)?.value;

  if (!googleConfigured() || !code || !state || state !== expected) {
    return NextResponse.redirect(new URL("/?signin=failed", url.origin));
  }

  const claims = await exchangeCode(request, code);
  if (!claims?.sub) return NextResponse.redirect(new URL("/?signin=failed", url.origin));

  const account = { sub: claims.sub, email: claims.email ?? "", name: claims.name ?? "" };
  const accountKey = `u/${account.sub}`;
  const device = await deviceKey();

  // The onboarding happened anonymously, so the first sign-in carries that journal into the
  // account. An account that already has a journal keeps it; the device copy is left untouched.
  if (await isEmpty(accountKey)) await copyJournal(device, accountKey);

  const response = NextResponse.redirect(new URL("/?signin=ok", url.origin));
  response.cookies.set(SESSION_COOKIE, await createSessionToken(account), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
