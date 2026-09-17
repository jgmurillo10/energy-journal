import { NextResponse } from "next/server";
import { authorizeUrl, googleConfigured, OAUTH_STATE_COOKIE } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!googleConfigured()) {
    return NextResponse.json({ error: "google sign-in is not configured" }, { status: 501 });
  }
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(authorizeUrl(request, state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
