"use client";

import { extractEnjoys, extractGender, extractName } from "./extract";
import type { ExtractionMethod, Mood, ProfileField, Trigger } from "./types";

/**
 * On-device extraction of a short answer from a spoken sentence.
 *
 * Chrome ships a built-in model (Gemini Nano) behind `LanguageModel`; when it is there we ask it,
 * because it handles phrasings the rules miss. Everywhere else — Safari, Firefox, older Chrome —
 * the rules run instead. A bundled WebLLM model is deliberately not used: it is a several-hundred
 * megabyte download for a one-line extraction.
 */

type LanguageModelSession = {
  prompt(input: string): Promise<string>;
  destroy(): void;
};

type LanguageModelApi = {
  availability(): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(options?: { initialPrompts?: { role: string; content: string }[] }): Promise<LanguageModelSession>;
};

function api(): LanguageModelApi | null {
  const candidate = (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;
  return candidate && typeof candidate.create === "function" ? candidate : null;
}

export async function localLlmAvailable(): Promise<boolean> {
  const model = api();
  if (!model) return false;
  try {
    return (await model.availability()) === "available";
  } catch {
    return false;
  }
}

const INSTRUCTIONS: Record<ProfileField, string> = {
  name: "Reply with only the person's name, nothing else.",
  gender: "Reply with only one of: Male, Female, Non-binary, Prefer not to say.",
  enjoys: "Reply with only the activities they enjoy, as a short phrase without a leading verb like 'I enjoy'.",
};

function rules(field: ProfileField, transcript: string): string {
  if (field === "name") return extractName(transcript);
  if (field === "gender") return extractGender(transcript);
  return extractEnjoys(transcript);
}

/** A model that rambles or invents is worse than the rules, so only short, grounded answers pass. */
function plausible(field: ProfileField, answer: string, transcript: string): boolean {
  if (!answer || answer.length > (field === "enjoys" ? 120 : 40)) return false;
  if (/\n/.test(answer)) return false;
  if (field === "gender") return /^(male|female|non-binary|prefer not to say)$/i.test(answer);
  const words = answer.toLowerCase().split(/\s+/);
  const haystack = transcript.toLowerCase();
  return words.every((word) => haystack.includes(word.replace(/[^\p{L}\p{N}]/gu, "")));
}

export async function extractField(
  field: ProfileField,
  transcript: string,
): Promise<{ value: string; method: ExtractionMethod }> {
  const text = transcript.trim();
  if (!text) return { value: "", method: "rules" };

  const model = api();
  if (model) {
    let session: LanguageModelSession | null = null;
    try {
      if ((await model.availability()) === "available") {
        session = await model.create({
          initialPrompts: [
            {
              role: "system",
              content:
                "You pull a single field out of a spoken sentence. Answer with the value only, no punctuation, no explanation.",
            },
          ],
        });
        const answer = (await session.prompt(`${INSTRUCTIONS[field]}\n\nSentence: ${text}`))
          .trim()
          .replace(/^["']|["'.]$/g, "");
        if (plausible(field, answer, text)) return { value: answer, method: "local-llm" };
      }
    } catch {
      // fall through to the rules
    } finally {
      session?.destroy();
    }
  }

  return { value: rules(field, text), method: "rules" };
}

export type LocalEntryAnalysis = {
  mood: Mood;
  energy: number;
  summary: string;
  triggers: Trigger[];
};

const ENTRY_SYSTEM =
  "You read a personal journal entry and reply with JSON only: " +
  '{"mood":"good"|"neutral"|"bad","energy":0-100,"summary":"one short sentence addressed to the person",' +
  '"triggers":[{"label":"short label","category":"work|sleep|exercise|social|family|food|health|money|creative|screen|nature|commute|other","polarity":"positive"|"negative","evidence":"quote from the entry"}]}. ' +
  "Energy is how charged their battery sounds. Triggers are the concrete things that caused the feelings.";

function parseEntryAnalysis(raw: string): LocalEntryAnalysis | null {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<LocalEntryAnalysis>;
    const moods: Mood[] = ["good", "neutral", "bad"];
    if (!parsed.mood || !moods.includes(parsed.mood)) return null;
    if (typeof parsed.energy !== "number" || Number.isNaN(parsed.energy)) return null;
    const triggers = (Array.isArray(parsed.triggers) ? parsed.triggers : [])
      .filter(
        (t): t is Trigger =>
          !!t && typeof t.label === "string" && (t.polarity === "positive" || t.polarity === "negative"),
      )
      .slice(0, 6)
      .map((t) => ({
        label: t.label.slice(0, 40),
        category: typeof t.category === "string" ? t.category.slice(0, 24) : "other",
        polarity: t.polarity,
        evidence: typeof t.evidence === "string" ? t.evidence.slice(0, 160) : "",
      }));
    return {
      mood: parsed.mood,
      energy: Math.max(0, Math.min(100, Math.round(parsed.energy))),
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "",
      triggers,
    };
  } catch {
    return null;
  }
}

/** Mood, battery and triggers from the browser's built-in model; null when it is not there. */
export async function analyzeEntryOnDevice(text: string): Promise<LocalEntryAnalysis | null> {
  const model = api();
  if (!model || !text.trim()) return null;
  let session: LanguageModelSession | null = null;
  try {
    if ((await model.availability()) !== "available") return null;
    session = await model.create({ initialPrompts: [{ role: "system", content: ENTRY_SYSTEM }] });
    return parseEntryAnalysis(await session.prompt(`Entry: ${text.trim()}`));
  } catch {
    return null;
  } finally {
    session?.destroy();
  }
}
