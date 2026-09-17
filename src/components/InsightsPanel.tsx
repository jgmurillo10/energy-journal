"use client";

import type { Insights } from "@/lib/insights";

function Battery({ level }: { level: number }) {
  const color = level >= 66 ? "bg-emerald-400" : level >= 33 ? "bg-amber-300" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-7 w-14 rounded-md border-2 border-white/40 p-[3px]">
        <div className={`h-full rounded-sm transition-all ${color}`} style={{ width: `${level}%` }} />
      </div>
      <span className="h-3 w-1 rounded-r bg-white/40" />
      <span className="ml-1 text-xl font-semibold text-white">{level}%</span>
    </div>
  );
}

export default function InsightsPanel({ insights }: { insights: Insights }) {
  const { moodCounts } = insights;
  const total = Math.max(1, insights.entryCount);

  return (
    <section className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Average battery</p>
        <div className="mt-2">
          <Battery level={insights.averageBattery} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-black/25 p-3">
          <p className="text-2xl font-semibold text-white">{insights.entryCount}</p>
          <p className="text-xs text-white/40">entries</p>
        </div>
        <div className="rounded-2xl bg-black/25 p-3">
          <p className="text-2xl font-semibold text-white">{insights.streakDays}</p>
          <p className="text-xs text-white/40">day streak</p>
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Mood mix</p>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="bg-emerald-400" style={{ width: `${(moodCounts.good / total) * 100}%` }} />
          <div className="bg-slate-300" style={{ width: `${(moodCounts.neutral / total) * 100}%` }} />
          <div className="bg-rose-400" style={{ width: `${(moodCounts.bad / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-white/40">
          <span>{moodCounts.good} good</span>
          <span>{moodCounts.neutral} okay</span>
          <span>{moodCounts.bad} bad</span>
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">What charges you</p>
        <ul className="mt-2 space-y-1.5">
          {insights.boosters.length === 0 && <li className="text-sm text-white/30">Not enough signal yet.</li>}
          {insights.boosters.map((b) => (
            <li key={`up-${b.category}`} className="flex items-center justify-between text-sm text-white/80" title={b.lastEvidence}>
              <span>↑ {b.label}</span>
              <span className="text-white/40">{b.count}×</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-rose-300/70">What drains you</p>
        <ul className="mt-2 space-y-1.5">
          {insights.drainers.length === 0 && <li className="text-sm text-white/30">Not enough signal yet.</li>}
          {insights.drainers.map((d) => (
            <li key={`down-${d.category}`} className="flex items-center justify-between text-sm text-white/80" title={d.lastEvidence}>
              <span>↓ {d.label}</span>
              <span className="text-white/40">{d.count}×</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
