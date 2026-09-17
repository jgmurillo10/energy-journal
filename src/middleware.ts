import { NextResponse, type NextRequest } from "next/server";
import {
  createJournalToken,
  DEVICE_COOKIE,
  DEVICE_HEADER,
  TOKEN_HEADER,
  journalIdFromToken,
} from "@/lib/journalSession";

/**
 * Anonymous onboarding needs somewhere to put the journal before there is an account, so every
 * browser gets a signed device id. Signing it means a guessed cookie value cannot reach someone
 * else's journal. Once the person signs in, the journal moves under their account id instead.
 */
/**
 * The native and web-preview builds of the Expo client call this API from another origin, and they
 * authenticate with a signed token header rather than the cookie, so opening CORS without
 * credentials exposes nothing a caller could not already reach with its own token.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": `Content-Type, ${TOKEN_HEADER}`,
  "Access-Control-Max-Age": "86400",
};

export async function middleware(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  if (isApi && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  const response = await route(request);
  if (isApi) for (const [key, value] of Object.entries(CORS)) response.headers.set(key, value);
  return response;
}

async function route(request: NextRequest) {
  // The mobile app has no cookie jar, so it carries the same signed token in a header.
  const bearer = request.headers.get(TOKEN_HEADER) ?? undefined;
  const bearerId = await journalIdFromToken(bearer);
  if (bearerId) {
    const headers = new Headers(request.headers);
    headers.set(DEVICE_HEADER, bearerId);
    return NextResponse.next({ request: { headers } });
  }

  const cookieToken = request.cookies.get(DEVICE_COOKIE)?.value;
  const existing = await journalIdFromToken(cookieToken);
  const token = existing && cookieToken ? cookieToken : await createJournalToken();
  const id = existing ?? (await journalIdFromToken(token));
  if (!id) {
    // Never let a caller name its own journal.
    const headers = new Headers(request.headers);
    headers.delete(DEVICE_HEADER);
    return NextResponse.next({ request: { headers } });
  }

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
