/**
 * Turns spoken onboarding answers into the short values the UI reads back.
 * People answer in full sentences ("My name is Juan Murillo"), so the lead-in has to go
 * before the value is stored, otherwise the dashboard greets "Hey My".
 */

const NAME_LEAD_IN =
  /\b(?:my name(?:'s| is)?|i am|i'm|this is|they call me|you can call me|call me|it's|its)\s+/i;
const NAME_WORD = /^[\p{L}][\p{L}'’.-]*$/u;
const NOT_A_NAME = new Set(["and", "the", "a", "an", "so", "well", "uh", "um", "yeah", "ok", "okay"]);

function stripEdges(text: string): string {
  return text.replace(/^[\s,.;:—-]+/, "").replace(/[\s,.;:!?—-]+$/, "");
}

function titleCase(text: string): string {
  return text.replace(/\p{L}[\p{L}'’-]*/gu, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

/** Keeps up to three name-like words, e.g. "My name is Juan Murillo, nice to meet you" -> "Juan Murillo". */
export function extractName(raw: string): string {
  const text = stripEdges(raw);
  if (!text) return "";
  const lead = text.match(NAME_LEAD_IN);
  const rest = lead ? text.slice((lead.index ?? 0) + lead[0].length) : text;
  const words: string[] = [];
  for (const word of stripEdges(rest).split(/\s+/)) {
    const clean = stripEdges(word);
    if (!NAME_WORD.test(clean) || NOT_A_NAME.has(clean.toLowerCase())) break;
    words.push(clean);
    // A comma or full stop ends the name: "Juan Murillo, nice to meet you".
    if (words.length === 3 || /[,.;:!?]$/.test(word)) break;
  }
  return titleCase(words.join(" ")) || titleCase(stripEdges(text).split(/\s+/)[0] ?? "");
}

const GENDERS: { label: string; pattern: RegExp }[] = [
  { label: "Non-binary", pattern: /\bnon[- ]?binary|no\s?binario|enby|genderqueer\b/i },
  { label: "Male", pattern: /\b(?:male|man|boy|guy|he|him|masculine|hombre|masculino|chico)\b/i },
  { label: "Female", pattern: /\b(?:female|woman|girl|she|her|feminine|mujer|femenino|chica)\b/i },
  { label: "Prefer not to say", pattern: /\b(?:rather not|prefer not|skip|none of|no comment|prefiero no)\b/i },
];

export function extractGender(raw: string): string {
  const text = stripEdges(raw);
  if (!text) return "";
  const hit = GENDERS.find(({ pattern }) => pattern.test(text));
  return hit ? hit.label : titleCase(text.split(/\s+/).slice(0, 3).join(" "));
}

const ENJOYS_LEAD_IN =
  /^(?:(?:well|so|uh+|um+|yeah|ok|okay)[,.]?\s+|i(?:'?m)?\s+(?:really\s+|truly\s+|absolutely\s+)?(?:enjoy|like|love|am into|into|really like)[,.]?\s+(?:to\s+|doing\s+)?|i\s+)/i;

/** "I really enjoy playing football and also coding." -> "playing football and also coding" */
export function extractEnjoys(raw: string): string {
  let text = stripEdges(raw);
  let previous = "";
  while (text && text !== previous) {
    previous = text;
    text = stripEdges(text.replace(ENJOYS_LEAD_IN, ""));
  }
  return text;
}
