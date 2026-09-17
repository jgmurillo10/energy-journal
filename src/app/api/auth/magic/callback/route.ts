import { NextResponse } from "next/server";
import { copyJournal, isEmpty } from "@/lib/db";
import { accountFromToken, createSessionToken, SESSION_COOKIE } from "@/lib/journalSession";
import { deviceKey } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const account = await accountFromToken(url.searchParams.get("token") ?? undefined);
  if (!account) return NextResponse.redirect(new URL("/?signin=expired", url.origin));

  const accountKey = `u/${account.sub}`;
  if (await isEmpty(accountKey)) await copyJournal(await deviceKey(), accountKey);

  const response = NextResponse.redirect(new URL("/?signin=ok", url.origin));
  response.cookies.set(SESSION_COOKIE, await createSessionToken(account), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
