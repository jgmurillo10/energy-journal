import { NextResponse } from "next/server";
import { chatJson } from "@/lib/analyze";
import { extractEnjoys, extractName, isDecline, plausible } from "@/lib/extract";
import type { ExtractionMethod, ProfileField } from "@/lib/types";

export const dynamic = "force-dynamic";

export type OnboardingStep = ProfileField | "firstDay";

type Body = {
  step?: OnboardingStep;
  answer?: string;
  /** First name gathered so far, if any, so the reply can use it. */
  name?: string;
  /** The question that comes next; the reply is written to lead into it. */
  nextQuestion?: string;
};

type Turn = {
  /** What the journal says back before asking the next question. */
  reply: string;
  /** Cleaned value pulled from the answer (empty when skipped or not a profile field). */
  value: string;
  method: ExtractionMethod;
  skipped: boolean;
};

const STEPS: OnboardingStep[] = ["name", "enjoys", "firstDay"];

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function fallbackTurn(step: OnboardingStep, answer: string, name: string): Turn {
  const who = firstName(name);
  if (isDecline(answer)) {
    return { reply: "No problem, we can skip that.", value: "", method: "rules", skipped: true };
  }
  if (step === "name") {
    const value = extractName(answer);
    return { reply: value ? `Nice to meet you, ${firstName(value)}.` : "Nice to meet you.", value, method: "rules", skipped: false };
  }
  if (step === "enjoys") {
    const value = extractEnjoys(answer);
    return { reply: value ? `${value.charAt(0).toUpperCase()}${value.slice(1)} — that sounds great.` : "Good to know.", value, method: "rules", skipped: false };
  }
  return { reply: who ? `Thanks for sharing that, ${who}.` : "Thanks for sharing that.", value: "", method: "rules", skipped: false };
}

async function modelTurn(step: OnboardingStep, answer: string, name: string, nextQuestion: string): Promise<Turn | null> {
  const goal =
    step === "name"
      ? 'Extract the person\'s name into "value" (only the name, as they said it).'
      : step === "enjoys"
        ? 'Extract what they enjoy doing into "value" as a short phrase in their own words, without a lead-in like "I enjoy".'
        : 'Set "value" to an empty string; this answer is a journal entry about their day.';
  const prompt = `You are a warm, brief voice companion in an energy and mood journal, mid-way through onboarding.
The person just answered the question about their ${step === "firstDay" ? "day" : step}.${name ? ` Their name is ${firstName(name)}.` : ""}
Their answer: """${answer}"""
${nextQuestion ? `The next question you will ask right after is: "${nextQuestion}".` : "This was the last question."}

Return JSON with keys: reply, value, skipped.
reply: one or two short spoken sentences that react naturally and specifically to what they said, like a friend would. Do not ask a question. Do not repeat the next question. No emojis.
${goal}
skipped: true only if they declined to answer (e.g. "skip", "I'd rather not say"); then value must be "" and the reply should accept that kindly.`;
  const parsed = await chatJson<{ reply?: unknown; value?: unknown; skipped?: unknown }>(prompt);
  if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
  const skipped = parsed.skipped === true || isDecline(answer);
  let value = typeof parsed.value === "string" ? parsed.value.trim().replace(/[.]$/, "") : "";
  if (skipped || step === "firstDay") value = "";
  else if (!plausible(step, value, answer)) value = fallbackTurn(step, answer, name).value;
  return { reply: parsed.reply.trim().slice(0, 240), value, method: "cloud-llm", skipped };
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const step = body.step;
  if (!step || !STEPS.includes(step)) return NextResponse.json({ error: "unknown step" }, { status: 400 });
  const answer = body.answer?.trim() ?? "";
  const name = body.name?.trim() ?? "";

  if (isDecline(answer)) return NextResponse.json(fallbackTurn(step, "", name));
  const turn = (await modelTurn(step, answer, name, body.nextQuestion?.trim() ?? "")) ?? fallbackTurn(step, answer, name);
  return NextResponse.json(turn);
}
