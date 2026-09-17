import { NextResponse, type NextRequest } from "next/server";
import {
  createJournalToken,
  DEVICE_COOKIE,
  DEVICE_HEADER,
  journalIdFromToken,
} from "@/lib/journalSession";

/**
 * Anonymous onboarding needs somewhere to put the journal before there is an account, so every
 * browser gets a signed device id. Signing it means a guessed cookie value cannot reach someone
 * else's journal. Once the person signs in, the journal moves under their account id instead.
 */
export async function middleware(request: NextRequest) {
  const cookieToken = request.cookies.get(DEVICE_COOKIE)?.value;
  const existing = await journalIdFromToken(cookieToken);
  const token = existing && cookieToken ? cookieToken : await createJournalToken();
  const id = existing ?? (await journalIdFromToken(token));
  if (!id) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.set(DEVICE_HEADER, id);
  const response = NextResponse.next({ request: { headers } });
  if (!existing) {
    response.cookies.set(DEVICE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 5,
    });
  }
  return response;
}

export const config = { matcher: ["/", "/api/:path*"] };
