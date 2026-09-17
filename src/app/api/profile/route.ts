import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ profile: await getProfile() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Record<"name" | "gender" | "enjoys" | "firstDay", string>>;
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const profile = await saveProfile({
    name,
    gender: body.gender?.trim() ?? "",
    enjoys: body.enjoys?.trim() ?? "",
    first_day: body.firstDay?.trim() ?? "",
  });
  return NextResponse.json({ profile });
}
