"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Composer from "@/components/Composer";
import EnergyChart from "@/components/EnergyChart";
import InsightsPanel from "@/components/InsightsPanel";
import Onboarding from "@/components/Onboarding";
import Timeline from "@/components/Timeline";
import type { Insights } from "@/lib/insights";
import { REDO_FLAG } from "@/lib/redo";
import type { Entry, Profile } from "@/lib/types";

const EMPTY_INSIGHTS: Insights = {
  entryCount: 0,
  averageBattery: 0,
  streakDays: 0,
  moodCounts: { good: 0, neutral: 0, bad: 0 },
  boosters: [],
  drainers: [],
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [insights, setInsights] = useState<Insights>(EMPTY_INSIGHTS);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/entries");
    const data = (await res.json()) as { entries: Entry[]; insights: Insights };
    setEntries(data.entries);
    setInsights(data.insights);
  }, []);

  useEffect(() => {
    (async () => {
      const redo = sessionStorage.getItem(REDO_FLAG) === "1";
      sessionStorage.removeItem(REDO_FLAG);
      const res = await fetch("/api/profile");
      const { profile: loaded } = (await res.json()) as { profile: Profile | null };
      setProfile(redo ? null : loaded);
      if (loaded) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  async function handleDelete(id: number) {
    await fetch(`/api/entries/${id}`, { method: "DELETE" });
    await refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white/40">
        <p className="animate-pulse">Warming up your journal...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-12">
        <Onboarding
          onDone={async (created) => {
            setProfile(created);
            await refresh();
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-300/70">Energy journal</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            {profile.name ? `Hey ${profile.name.split(" ")[0]}, how's your battery?` : "How's your battery today?"}
          </h1>
          {profile.enjoys && (
            <p className="mt-1 line-clamp-2 max-w-xl text-sm text-white/40">You told me you enjoy {profile.enjoys}</p>
          )}
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/40 transition hover:border-white/30 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </header>

      {flash && (
        <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {flash}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Composer
            onSaved={async (_entry, summary) => {
              setFlash(summary);
              await refresh();
            }}
          />
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Energy over time</h2>
            <EnergyChart entries={entries} />
          </section>
          <section>
            <h2 className="mb-4 text-lg font-semibold text-white">Your notes</h2>
            <Timeline entries={entries} onDelete={handleDelete} />
          </section>
        </div>
        <div className="lg:sticky lg:top-10 lg:self-start">
          <InsightsPanel insights={insights} />
        </div>
      </div>
    </main>
  );
}
