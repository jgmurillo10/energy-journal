/**
 * Turns spoken onboarding answers into the short values the UI reads back.
 * People answer in full sentences ("My name is Juan Murillo"), so the lead-in has to go
 * before the value is stored, otherwise the dashboard greets "Hey My".
 */
import type { ProfileField } from "./types";

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

const DECLINE =
  /^(?:(?:no|nah|nope)[,.!]?\s*)?(?:skip|pass|next|i(?:'d| would)? rather not|i(?:'d| would)? prefer not|prefer not to say|i don'?t want to (?:say|share|answer)|no thanks|none|nothing|prefiero no|paso|siguiente)\b/i;

/** "I'd rather not say" or "skip" means the person is declining the question. */
export function isDecline(raw: string): boolean {
  const text = stripEdges(raw);
  return !text || DECLINE.test(text);
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

/** A model that rambles or invents is worse than the rules, so only short, grounded answers pass. */
export function plausible(field: ProfileField, answer: string, transcript: string): boolean {
  if (!answer || answer.length > (field === "enjoys" ? 120 : 40)) return false;
  if (/\n/.test(answer)) return false;
  const words = answer.toLowerCase().split(/\s+/);
  const haystack = transcript.toLowerCase();
  return words.every((word) => haystack.includes(word.replace(/[^\p{L}\p{N}]/gu, "")));
}
