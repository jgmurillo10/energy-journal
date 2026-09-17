import { cookies, headers } from "next/headers";
import { accountFromToken, DEVICE_HEADER, SESSION_COOKIE, type Account } from "./journalSession";

/** Storage namespace for one journal: an account when signed in, otherwise the anonymous device. */
export type Owner = { key: string; account: Account | null };

export async function currentOwner(): Promise<Owner> {
  const jar = await cookies();
  const account = await accountFromToken(jar.get(SESSION_COOKIE)?.value);
  if (account) return { key: `u/${account.sub}`, account };

  const device = (await headers()).get(DEVICE_HEADER);
  return { key: `d/${device ?? "unknown"}`, account: null };
}

export async function deviceKey(): Promise<string> {
  return `d/${(await headers()).get(DEVICE_HEADER) ?? "unknown"}`;
}
