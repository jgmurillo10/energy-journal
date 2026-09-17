import { NextResponse } from "next/server";
import { analyze } from "@/lib/analyze";
import { insertEntry, listEntries, type Mood } from "@/lib/db";
import { buildInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

const MOODS: Mood[] = ["good", "neutral", "bad"];

export async function GET() {
  const entries = listEntries();
  return NextResponse.json({ entries, insights: buildInsights(entries) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    mood?: string;
    energy?: number;
    source?: string;
  };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const reportedMood = MOODS.includes(body.mood as Mood) ? (body.mood as Mood) : undefined;
  const reportedEnergy = typeof body.energy === "number" ? Math.max(0, Math.min(100, body.energy)) : undefined;
  const analysis = await analyze(text, reportedMood, reportedEnergy);

  const entry = insertEntry({
    text,
    source: body.source === "voice" ? "voice" : "text",
    mood: analysis.mood,
    sentiment: analysis.sentiment,
    energy: analysis.energy,
    battery: analysis.battery,
    triggers: analysis.triggers,
  });

  return NextResponse.json({ entry, summary: analysis.summary });
}
