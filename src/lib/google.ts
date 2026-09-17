export const OAUTH_STATE_COOKIE = "ej_oauth_state";

/** Google OAuth is optional: without credentials the app stays anonymous and hides sign-in. */
export const googleConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function redirectUri(request: Request): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.origin}/api/auth/callback`;
}

export function authorizeUrl(request: Request, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

type IdTokenClaims = { sub?: string; email?: string; name?: string };

function decodeIdToken(idToken: string): IdTokenClaims {
  const [, payload] = idToken.split(".");
  const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as IdTokenClaims;
}

/**
 * The id token is read straight from Google's token endpoint over TLS using the client secret,
 * so the claims are trustworthy without a separate signature check.
 */
export async function exchangeCode(request: Request, code: string): Promise<IdTokenClaims | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) return null;
  try {
    return decodeIdToken(idToken);
  } catch {
    return null;
  }
}
