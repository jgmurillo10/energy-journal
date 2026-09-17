import type { Mood, Trigger } from "./types";

const POSITIVE_WORDS = [
  "amazing", "awesome", "beautiful", "calm", "confident", "delighted", "energized", "excited", "fun",
  "glad", "good", "grateful", "great", "happy", "hopeful", "joy", "kind", "love", "lucky", "peaceful",
  "productive", "proud", "relaxed", "relieved", "rested", "strong", "success", "supported", "thrilled", "wonderful",
];

const NEGATIVE_WORDS = [
  "angry", "annoyed", "anxious", "ashamed", "awful", "bad", "burned", "burnout", "conflict", "depressed",
  "disappointed", "drained", "exhausted", "fear", "frustrated", "guilty", "hate", "hurt", "lonely", "overwhelmed",
  "pain", "panic", "sad", "scared", "sick", "stress", "stressed", "terrible", "tired", "upset", "worried", "worst",
];

const NEGATORS = ["not", "no", "never", "without", "barely", "hardly", "didn't", "don't", "wasn't", "isn't", "can't"];

type CategoryDef = { category: string; keywords: string[] };

const CATEGORIES: CategoryDef[] = [
  { category: "work", keywords: ["work", "job", "boss", "meeting", "deadline", "project", "office", "client", "interview", "standup", "email"] },
  { category: "sleep", keywords: ["sleep", "slept", "nap", "insomnia", "rest", "bed", "woke", "awake"] },
  { category: "exercise", keywords: ["run", "ran", "gym", "workout", "yoga", "walk", "walked", "bike", "swim", "training", "hike"] },
  { category: "social", keywords: ["friend", "friends", "party", "dinner", "call", "date", "people", "hangout", "conversation", "colleague"] },
  { category: "family", keywords: ["family", "mom", "mother", "dad", "father", "sister", "brother", "kids", "son", "daughter", "partner", "wife", "husband"] },
  { category: "food", keywords: ["ate", "eat", "food", "lunch", "breakfast", "dinner", "coffee", "sugar", "alcohol", "drink", "snack"] },
  { category: "health", keywords: ["sick", "headache", "pain", "doctor", "therapy", "medication", "flu", "cold", "injury"] },
  { category: "money", keywords: ["money", "bills", "rent", "budget", "salary", "debt", "expensive", "paid"] },
  { category: "creative", keywords: ["music", "guitar", "paint", "draw", "write", "writing", "reading", "book", "game", "gaming", "photography", "cooking"] },
  { category: "screen", keywords: ["phone", "scroll", "social media", "instagram", "twitter", "tiktok", "news", "youtube"] },
  { category: "nature", keywords: ["sun", "sunny", "outside", "park", "beach", "rain", "weather", "garden", "nature"] },
  { category: "commute", keywords: ["traffic", "commute", "train", "bus", "drive", "driving", "late"] },
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

export function scoreSentiment(text: string): number {
  const tokens = words(text);
  let score = 0;
  tokens.forEach((token, i) => {
    const stem = token.replace(/(ing|ed|s)$/, "");
    const isPositive = POSITIVE_WORDS.includes(token) || POSITIVE_WORDS.includes(stem);
    const isNegative = NEGATIVE_WORDS.includes(token) || NEGATIVE_WORDS.includes(stem);
    if (!isPositive && !isNegative) return;
    const negated = tokens.slice(Math.max(0, i - 3), i).some((w) => NEGATORS.includes(w));
    const value = isPositive ? 1 : -1;
    score += negated ? -value : value;
  });
  if (score === 0) return 0;
  // squash into [-1, 1]
  return Math.max(-1, Math.min(1, score / 3));
}

export function moodFromSentiment(sentiment: number): Mood {
  if (sentiment > 0.15) return "good";
  if (sentiment < -0.15) return "bad";
  return "neutral";
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function extractTriggers(text: string): Trigger[] {
  const sentences = splitSentences(text);
  const found = new Map<string, Trigger>();

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const sentiment = scoreSentiment(sentence);
    if (sentiment === 0) continue;
    for (const { category, keywords } of CATEGORIES) {
      const hit = keywords.find((k) => new RegExp(`\\b${k}\\b`).test(lower));
      if (!hit) continue;
      const key = `${category}:${sentiment > 0 ? "positive" : "negative"}`;
      if (found.has(key)) continue;
      found.set(key, {
        label: titleCase(category),
        category,
        polarity: sentiment > 0 ? "positive" : "negative",
        evidence: sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence,
      });
    }
  }
  return [...found.values()];
}

export type Analysis = {
  sentiment: number;
  mood: Mood;
  energy: number;
  battery: number;
  triggers: Trigger[];
  summary: string;
};

export function analyzeLocally(text: string, reportedMood?: Mood, reportedEnergy?: number): Analysis {
  const sentiment = scoreSentiment(text);
  const mood = reportedMood ?? moodFromSentiment(sentiment);
  const moodBias = mood === "good" ? 1 : mood === "bad" ? -1 : 0;
  const energy = reportedEnergy ?? Math.round(50 + ((sentiment + moodBias) / 2) * 45);
  const triggers = extractTriggers(text);
  const positives = triggers.filter((t) => t.polarity === "positive").map((t) => t.label.toLowerCase());
  const negatives = triggers.filter((t) => t.polarity === "negative").map((t) => t.label.toLowerCase());
  const parts: string[] = [];
  if (positives.length) parts.push(`lifted by ${positives.join(", ")}`);
  if (negatives.length) parts.push(`drained by ${negatives.join(", ")}`);
  const summary = parts.length ? `You seem ${parts.join(" and ")}.` : "No clear trigger stood out in this entry.";
  return {
    sentiment,
    mood,
    energy: Math.max(0, Math.min(100, energy)),
    battery: Math.max(0, Math.min(100, energy)),
    triggers,
    summary,
  };
}

type LlmResult = { sentiment: number; mood: Mood; energy: number; summary: string; triggers: Trigger[] };

async function analyzeWithOpenAi(text: string): Promise<LlmResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const prompt = `You analyze a personal journal entry. Return JSON with keys:
sentiment (number -1..1), mood ("good"|"neutral"|"bad"), energy (integer 0..100 describing the person's energy battery),
summary (one short sentence addressed to the person), triggers (array of {label, category, polarity:"positive"|"negative", evidence}).
Triggers are the concrete things that caused the good or bad feelings. Entry:
"""${text}"""`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Partial<LlmResult>;
    if (typeof parsed.sentiment !== "number" || !Array.isArray(parsed.triggers)) return null;
    return {
      sentiment: parsed.sentiment,
      mood: parsed.mood ?? moodFromSentiment(parsed.sentiment),
      energy: typeof parsed.energy === "number" ? parsed.energy : 50,
      summary: parsed.summary ?? "",
      triggers: parsed.triggers,
    };
  } catch {
    return null;
  }
}

export async function analyze(text: string, reportedMood?: Mood, reportedEnergy?: number): Promise<Analysis> {
  const local = analyzeLocally(text, reportedMood, reportedEnergy);
  const llm = await analyzeWithOpenAi(text);
  if (!llm) return local;
  const energy = reportedEnergy ?? Math.max(0, Math.min(100, Math.round(llm.energy)));
  return {
    sentiment: Math.max(-1, Math.min(1, llm.sentiment)),
    mood: reportedMood ?? llm.mood,
    energy,
    battery: energy,
    triggers: llm.triggers.length ? llm.triggers : local.triggers,
    summary: llm.summary || local.summary,
  };
}
