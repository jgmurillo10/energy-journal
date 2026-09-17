import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/db";
import { extractEnjoys, extractGender, extractName } from "@/lib/extract";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ profile: await getProfile() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Record<"name" | "gender" | "enjoys" | "firstDay", string>>;
  const name = extractName(body.name ?? "");
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const profile = await saveProfile({
    name,
    gender: extractGender(body.gender ?? ""),
    enjoys: extractEnjoys(body.enjoys ?? ""),
    first_day: body.firstDay?.trim() ?? "",
  });
  return NextResponse.json({ profile });
}
