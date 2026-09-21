"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";

const INITIAL_VISIBLE = 3;
/** Which analyser produced a note is a debugging aid, not something to show people yet. */
const SHOW_ANALYZER = process.env.NODE_ENV === "development";

const MOOD_STYLE: Record<Entry["mood"], { dot: string; label: string; emoji: string }> = {
  good: { dot: "bg-emerald-400", label: "Good day", emoji: "🙂" },
  neutral: { dot: "bg-slate-300", label: "Okay", emoji: "😐" },
  bad: { dot: "bg-rose-400", label: "Hard moment", emoji: "🙁" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Timeline({ entries, onDelete }: { entries: Entry[]; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, INITIAL_VISIBLE);
  const hidden = entries.length - visible.length;

  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/40">
        Nothing here yet. Your notes will build a timeline as you go.
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-6">
      {visible.map((entry) => {
        const style = MOOD_STYLE[entry.mood];
        return (
          <li key={entry.id} className="relative">
            <span className={`absolute -left-[31px] top-5 h-3 w-3 rounded-full ring-4 ring-slate-950 ${style.dot}`} />
            <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/20">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-white/50">
                  <span>{style.emoji}</span>
                  <span>{formatDate(entry.created_at)}</span>
                  {entry.source === "voice" && <span className="text-xs text-emerald-300/70">· voice</span>}
                  {SHOW_ANALYZER && entry.analyzed_by && <span className="text-xs text-white/25">· {entry.analyzed_by}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-medium text-emerald-300">
                    🔋 {entry.battery}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    aria-label="Delete entry"
                    className="text-xs text-white/30 transition hover:text-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </header>

              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{entry.text}</p>

              {entry.triggers.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {entry.triggers.map((trigger, i) => (
                    <span
                      key={`${entry.id}-${trigger.category}-${i}`}
                      title={trigger.evidence}
                      className={`rounded-full px-3 py-1 text-xs ${
                        trigger.polarity === "positive"
                          ? "bg-emerald-400/10 text-emerald-200"
                          : "bg-rose-400/10 text-rose-200"
                      }`}
                    >
                      {trigger.polarity === "positive" ? "↑" : "↓"} {trigger.label}
                    </span>
                  ))}
                </div>
              )}
            </article>
          </li>
        );
      })}
      {hidden > 0 && (
        <li className="relative pt-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs uppercase tracking-[0.2em] text-white/40 transition hover:text-white/80"
          >
            Show {hidden} older {hidden === 1 ? "note" : "notes"}
          </button>
        </li>
      )}
      {expanded && entries.length > INITIAL_VISIBLE && (
        <li className="relative pt-2">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs uppercase tracking-[0.2em] text-white/40 transition hover:text-white/80"
          >
            Show fewer
          </button>
        </li>
      )}
    </ol>
  );
}
