"use client";

import { useEffect, useState } from "react";
import type { AuditEvent, ExtractionMethod, Profile, ProfileField } from "@/lib/types";

const FIELDS: { key: ProfileField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "enjoys", label: "Enjoys" },
];

const SHOW_METHOD = process.env.NODE_ENV === "development";

const METHOD_LABEL: Record<ExtractionMethod, string> = {
  "local-llm": "on-device model",
  "cloud-llm": "cloud model",
  rules: "rules",
  user: "edited by you",
};

/** People only need to know whether they typed it themselves or it came from what they said. */
function sourceLabel(method: ExtractionMethod | undefined): string {
  if (SHOW_METHOD) return METHOD_LABEL[method ?? "rules"];
  return method === "user" ? "edited by you" : "from what you said";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ProfilePanel({
  profile,
  onSaved,
  onClose,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<ProfileField, string>>({
    name: profile.name,
    enjoys: profile.enjoys,
  });
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/audit");
      const data = (await res.json()) as { audit: AuditEvent[] };
      setAudit(data.audit);
    })();
  }, [profile]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("Could not save your details");
      const { profile: updated } = (await res.json()) as { profile: Profile };
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Your details</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs uppercase tracking-[0.2em] text-white/30 transition hover:text-white/70"
        >
          Close
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="block text-sm">
            <span className="text-white/50">{label}</span>
            <input
              value={draft[key]}
              placeholder={key === "name" ? "Skipped — add one if you like" : "Skipped"}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400/60"
            />
            <span className="mt-1 block text-xs text-white/30">
              {profile.raw?.[key] || profile.methods?.[key] === "user"
                ? `${sourceLabel(profile.methods?.[key])}${profile.raw?.[key] ? ` · you said “${profile.raw[key]}”` : ""}`
                : "Not provided"}
            </span>
          </label>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-200 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save details"}
      </button>

      <h3 className="mt-8 text-sm uppercase tracking-[0.2em] text-white/40">Change history</h3>
      {audit.length === 0 ? (
        <p className="mt-2 text-sm text-white/30">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {audit.map((event) => (
            <li key={event.id} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-white/80 capitalize">{event.field}</span>
                <span className="text-white/30">{formatTime(event.at)}</span>
                <span className="text-white/30">· {sourceLabel(event.method)}</span>
              </div>
              <p className="mt-1 text-white/60">
                {event.before ? <span className="line-through text-white/30">{event.before}</span> : "—"}{" "}
                → <span className="text-emerald-200/80">{event.after || "—"}</span>
              </p>
              {event.transcript && <p className="mt-1 text-xs text-white/30">Transcript: “{event.transcript}”</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
