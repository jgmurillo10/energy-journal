import type { Entry } from "./types";

export type TriggerStat = {
  label: string;
  category: string;
  count: number;
  polarity: "positive" | "negative";
  lastEvidence: string;
};

export type Insights = {
  entryCount: number;
  averageBattery: number;
  streakDays: number;
  moodCounts: { good: number; neutral: number; bad: number };
  boosters: TriggerStat[];
  drainers: TriggerStat[];
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function buildInsights(entries: Entry[]): Insights {
  const moodCounts = { good: 0, neutral: 0, bad: 0 };
  const stats = new Map<string, TriggerStat>();

  for (const entry of entries) {
    moodCounts[entry.mood] += 1;
    for (const trigger of entry.triggers) {
      const key = `${trigger.category}:${trigger.polarity}`;
      const existing = stats.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        stats.set(key, {
          label: trigger.label,
          category: trigger.category,
          count: 1,
          polarity: trigger.polarity,
          lastEvidence: trigger.evidence,
        });
      }
    }
  }

  const days = new Set(entries.map((e) => dayKey(e.created_at)));
  let streakDays = 0;
  const cursor = new Date();
  // allow the streak to start today or yesterday
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const all = [...stats.values()].sort((a, b) => b.count - a.count);
  return {
    entryCount: entries.length,
    averageBattery: entries.length
      ? Math.round(entries.reduce((sum, e) => sum + e.battery, 0) / entries.length)
      : 0,
    streakDays,
    moodCounts,
    boosters: all.filter((s) => s.polarity === "positive").slice(0, 5),
    drainers: all.filter((s) => s.polarity === "negative").slice(0, 5),
  };
}
