import { createSessionToken } from "./journalSession";

/**
 * Magic links are stateless: the emailed URL carries an HMAC-signed session token that only
 * becomes a cookie when the link is opened, so no pending-token storage is needed. Sending needs
 * a Resend API key; without one the app hides the option.
 */
export const magicLinkConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY);

const FROM = () => process.env.MAGIC_LINK_FROM ?? "Energy Journal <onboarding@resend.dev>";

/** Fifteen-minute validity, encoded in the signed payload the callback re-checks. */
export const LINK_TTL_MS = 15 * 60 * 1000;

export async function magicLinkUrl(origin: string, email: string): Promise<string> {
  const token = await createSessionToken({
    sub: `email:${email.toLowerCase()}`,
    email: email.toLowerCase(),
    name: email.split("@")[0],
    expires_at: Date.now() + LINK_TTL_MS,
  });
  return `${origin}/api/auth/magic/callback?token=${encodeURIComponent(token)}`;
}

export async function sendMagicLink(email: string, url: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM(),
      to: [email],
      subject: "Your energy journal link",
      html: `<p>Tap to open your journal on this device:</p><p><a href="${url}">Open my journal</a></p><p>The link expires in 15 minutes.</p>`,
    }),
  });
  return res.ok;
}
