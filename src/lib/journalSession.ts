/**
 * Cookie signing shared by the middleware (edge runtime) and the API routes, hence Web Crypto
 * rather than node:crypto. Two cookies exist: an anonymous device id used during onboarding, and
 * an account session written after Google sign-in. Whichever is present decides which journal
 * namespace the request reads and writes.
 */

const encoder = new TextEncoder();

export const DEVICE_COOKIE = "ej_device";
export const DEVICE_HEADER = "x-journal-device";
/** Cookie-less clients (the mobile app) send their signed device token here instead. */
export const TOKEN_HEADER = "x-journal-token";
export const SESSION_COOKIE = "ej_session";

/** `expires_at` is only set on magic-link tokens, which must not outlive the email that carried them. */
export type Account = { sub: string; email: string; name: string; expires_at?: number };

function secret(): string {
  return process.env.JOURNAL_BLOB_KEY ?? "energy-journal-local-development";
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function unsign(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return null;
  return timingSafeEqual(supplied.toLowerCase(), await sign(payload)) ? payload : null;
}

export async function createJournalToken(id = crypto.randomUUID()): Promise<string> {
  return `${id}.${await sign(id)}`;
}

export async function journalIdFromToken(token: string | undefined): Promise<string | null> {
  const id = await unsign(token);
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** btoa only takes latin-1, and names carry accents, so go through UTF-8 bytes. */
function encodeBase64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, "");
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function createSessionToken(account: Account): Promise<string> {
  const payload = encodeBase64(JSON.stringify(account));
  return `${payload}.${await sign(payload)}`;
}

export async function accountFromToken(token: string | undefined): Promise<Account | null> {
  const payload = await unsign(token);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(decodeBase64(payload)) as Partial<Account>;
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    if (typeof parsed.expires_at === "number" && parsed.expires_at < Date.now()) return null;
    return { sub: parsed.sub, email: parsed.email ?? "", name: parsed.name ?? "" };
  } catch {
    return null;
  }
}
