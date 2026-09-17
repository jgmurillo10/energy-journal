"use client";

import { extractEnjoys, extractGender, extractName } from "./extract";
import type { ExtractionMethod, ProfileField } from "./types";

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
