/**
 * The API cleans every spoken answer server-side, but the next question has to greet the person
 * by name before anything is saved, so the name rule is mirrored here.
 */

const LEAD_IN = /\b(?:my name(?:'s| is)?|i am|i'm|this is|they call me|you can call me|call me|it's|its)\s+/i;
const NAME_WORD = /^[\p{L}][\p{L}'’.-]*$/u;
const NOT_A_NAME = new Set(['and', 'the', 'a', 'an', 'so', 'well', 'uh', 'um', 'yeah', 'ok', 'okay']);

function stripEdges(text: string): string {
  return text.replace(/^[\s,.;:—-]+/, '').replace(/[\s,.;:!?—-]+$/, '');
}

function titleCase(text: string): string {
  return text.replace(/\p{L}[\p{L}'’-]*/gu, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

export function firstNameFrom(raw: string): string {
  const text = stripEdges(raw);
  if (!text) return '';
  const lead = text.match(LEAD_IN);
  const rest = stripEdges(lead ? text.slice((lead.index ?? 0) + lead[0].length) : text);
  const first = stripEdges(rest.split(/\s+/)[0] ?? '');
  if (!NAME_WORD.test(first) || NOT_A_NAME.has(first.toLowerCase())) return '';
  return titleCase(first);
}
