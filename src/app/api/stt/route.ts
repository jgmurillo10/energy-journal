import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MODEL = "scribe_v1";

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 503 });

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "audio file is required" }, { status: 400 });

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, audio.name || "recording.webm");
  upstreamForm.append("model_id", MODEL);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: upstreamForm,
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `ElevenLabs STT failed (${res.status})`, detail }, { status: 502 });
  }

  const data = (await res.json()) as { text?: string; language_code?: string };
  return NextResponse.json({ text: data.text ?? "", language: data.language_code ?? null });
}
