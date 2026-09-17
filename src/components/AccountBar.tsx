"use client";

import { useEffect, useRef, useState } from "react";

type Account = { sub: string; email: string; name: string };

type Session = { account: Account | null; googleEnabled: boolean; magicLinkEnabled: boolean };

export default function AccountBar({ onImported }: { onImported: () => Promise<void> }) {
  const [session, setSession] = useState<Session>({
    account: null,
    googleEnabled: false,
    magicLinkEnabled: false,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/session");
      setSession((await res.json()) as Session);
    })();
  }, []);

  async function sendLink() {
    setStatus("Sending your link...");
    const res = await fetch("/api/auth/magic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setStatus(res.ok ? `Link sent to ${email}` : "Could not send that link");
  }

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.reload();
  }

  async function exportJournal() {
    const res = await fetch("/api/journal");
    const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `energy-journal-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importJournal(file: File) {
    setStatus("Importing...");
    const res = await fetch("/api/journal", { method: "POST", body: await file.text() });
    setStatus(res.ok ? "Journal imported" : "That file could not be imported");
    if (res.ok) await onImported();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
      {session.account ? (
        <>
          <span className="text-white/60">
            Private to {session.account.email || session.account.name}
          </span>
          <button type="button" onClick={signOut} className="text-white/30 transition hover:text-white/70">
            Sign out
          </button>
        </>
      ) : (
        <>
          <span className="text-white/40">
            This journal lives on this device only. Sign in to keep it private and reach it anywhere.
          </span>
          {session.googleEnabled && (
            <a
              href="/api/auth/login"
              className="rounded-full bg-white px-4 py-1.5 font-medium text-black transition hover:bg-white/80"
            >
              Continue with Google
            </a>
          )}
          {session.magicLinkEnabled && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendLink();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email.com"
                className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-white placeholder:text-white/25 focus:border-emerald-300/50 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-white/20 px-4 py-1.5 text-white/70 transition hover:text-white"
              >
                Email me a link
              </button>
            </form>
          )}
        </>
      )}
      <div className="ml-auto flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/30">
        <button type="button" onClick={exportJournal} className="transition hover:text-white/70">
          Export
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className="transition hover:text-white/70">
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importJournal(file);
            event.target.value = "";
          }}
        />
      </div>
      {status && <p className="w-full text-xs text-white/40">{status}</p>}
    </div>
  );
}
