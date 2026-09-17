import { NextResponse } from "next/server";
import { getProfile, recordAudit, saveProfile } from "@/lib/db";
import { extractEnjoys, extractGender, extractName } from "@/lib/extract";
import { currentOwner } from "@/lib/owner";
import type { ExtractionMethod, Profile, ProfileField, RawAnswers } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  gender?: string;
  enjoys?: string;
  firstDay?: string;
  /** Values already extracted on the device, with the method that produced each one. */
  processed?: Partial<Record<ProfileField, string>>;
  methods?: Partial<Record<ProfileField, ExtractionMethod>>;
};

const FIELDS: ProfileField[] = ["name", "gender", "enjoys"];

function fallback(field: ProfileField, transcript: string): string {
  if (field === "name") return extractName(transcript);
  if (field === "gender") return extractGender(transcript);
  return extractEnjoys(transcript);
}

function isMethod(value: unknown): value is ExtractionMethod {
  return value === "local-llm" || value === "rules" || value === "user";
}

export async function GET() {
  const { key, account } = await currentOwner();
  return NextResponse.json({ profile: await getProfile(key), account });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const { key } = await currentOwner();
  const existing = await getProfile(key);

  const raw = {} as RawAnswers;
  const values = {} as Record<ProfileField, string>;
  const methods: Partial<Record<ProfileField, ExtractionMethod>> = {};

  for (const field of FIELDS) {
    const transcript = body[field]?.trim() ?? "";
    raw[field] = transcript;
    const device = body.processed?.[field]?.trim();
    values[field] = device || fallback(field, transcript);
    const claimed = body.methods?.[field];
    methods[field] = device && isMethod(claimed) ? claimed : "rules";
  }

  if (!values.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const profile: Profile = await saveProfile(key, {
    ...values,
    first_day: body.firstDay?.trim() ?? "",
    raw,
    methods,
  });

  await Promise.all(
    FIELDS.filter((field) => (existing?.[field] ?? "") !== profile[field]).map((field) =>
      recordAudit(key, {
        field,
        before: existing?.[field] ?? "",
        after: profile[field],
        method: methods[field] ?? "rules",
        transcript: raw[field] || undefined,
      }),
    ),
  );

  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as Partial<Record<ProfileField, string>>;
  const { key } = await currentOwner();
  const existing = await getProfile(key);
  if (!existing) return NextResponse.json({ error: "no profile yet" }, { status: 404 });

  const edits = FIELDS.filter((field) => typeof body[field] === "string").map((field) => ({
    field,
    value: (body[field] as string).trim(),
  }));
  if (edits.some(({ field, value }) => field === "name" && !value)) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  const methods = { ...existing.methods };
  const next = { ...existing };
  for (const { field, value } of edits) {
    next[field] = value;
    methods[field] = "user";
  }

  const profile = await saveProfile(key, { ...next, methods });

  await Promise.all(
    edits
      .filter(({ field, value }) => existing[field] !== value)
      .map(({ field, value }) =>
        recordAudit(key, { field, before: existing[field], after: value, method: "user" }),
      ),
  );

  return NextResponse.json({ profile });
}
