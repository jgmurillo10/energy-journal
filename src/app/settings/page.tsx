"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AccountBar from "@/components/AccountBar";
import ProfilePanel from "@/components/ProfilePanel";
import { REDO_FLAG } from "@/lib/redo";
import type { Profile } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/profile");
      const { profile: loaded } = (await res.json()) as { profile: Profile | null };
      setProfile(loaded);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-300/70">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Your journal</h1>
        </div>
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.2em] text-white/30 transition hover:text-white/70"
        >
          Done
        </Link>
      </header>

      <AccountBar onImported={async () => router.push("/")} />

      {loading ? (
        <p className="animate-pulse text-white/40">Loading your details...</p>
      ) : profile ? (
        <ProfilePanel profile={profile} onSaved={setProfile} onClose={() => router.push("/")} />
      ) : (
        <p className="text-white/40">No profile yet — finish onboarding first.</p>
      )}

      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(REDO_FLAG, "1");
          router.push("/");
        }}
        className="mt-6 text-xs uppercase tracking-[0.2em] text-white/30 transition hover:text-rose-300"
      >
        Redo setup
      </button>
    </main>
  );
}
