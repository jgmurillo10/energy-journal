import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — warm, reassuring
const MODEL = "eleven_turbo_v2_5";

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 503 });

  const { text } = (await request.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2 },
    }),
  });

  if (!res.ok || !res.body) {
    return NextResponse.json({ error: `ElevenLabs TTS failed (${res.status})` }, { status: 502 });
  }

  return new Response(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
