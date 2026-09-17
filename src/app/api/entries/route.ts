import { NextResponse } from "next/server";
import { analyze } from "@/lib/analyze";
import { insertEntry, listEntries, type Mood } from "@/lib/db";
import type { Trigger } from "@/lib/types";
import { buildInsights } from "@/lib/insights";
import { currentOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

const MOODS: Mood[] = ["good", "neutral", "bad"];

export async function GET() {
  const { key } = await currentOwner();
  const entries = await listEntries(key);
  return NextResponse.json({ entries, insights: buildInsights(entries) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    mood?: string;
    energy?: number;
    source?: string;
    analysis?: {
      mood?: string;
      energy?: number;
      summary?: string;
      triggers?: Trigger[];
    };
  };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const reportedMood = MOODS.includes(body.mood as Mood) ? (body.mood as Mood) : undefined;
  const reportedEnergy = typeof body.energy === "number" ? Math.max(0, Math.min(100, body.energy)) : undefined;
  // The browser's built-in model, when it has one, analyses the entry before sending it here.
  const onDevice = body.analysis;
  const analysis =
    onDevice && MOODS.includes(onDevice.mood as Mood) && typeof onDevice.energy === "number"
      ? {
          mood: reportedMood ?? (onDevice.mood as Mood),
          sentiment: onDevice.mood === "good" ? 0.6 : onDevice.mood === "bad" ? -0.6 : 0,
          energy: reportedEnergy ?? Math.max(0, Math.min(100, Math.round(onDevice.energy))),
          battery: reportedEnergy ?? Math.max(0, Math.min(100, Math.round(onDevice.energy))),
          triggers: Array.isArray(onDevice.triggers) ? onDevice.triggers.slice(0, 6) : [],
          summary: onDevice.summary ?? "",
          analyzed_by: "on-device model" as const,
        }
      : { ...(await analyze(text, reportedMood, reportedEnergy)), analyzed_by: undefined };

  const { key } = await currentOwner();
  const entry = await insertEntry(key, {
    text,
    source: body.source === "voice" ? "voice" : "text",
    mood: analysis.mood,
    sentiment: analysis.sentiment,
    energy: analysis.energy,
    battery: analysis.battery,
    triggers: analysis.triggers,
    analyzed_by: analysis.analyzed_by ?? (process.env.OPENAI_API_KEY ? "cloud model" : "keyword rules"),
  });

  return NextResponse.json({ entry, summary: analysis.summary });
}
