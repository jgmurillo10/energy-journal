# Energy Journal

A voice-first journal for tracking your energy battery and the things that charge or drain it.

- **Audio onboarding** — the app asks for your name, gender, what you enjoy and how your day went. Questions are spoken with ElevenLabs TTS; answers are recorded in the browser and transcribed with ElevenLabs Scribe (`scribe_v1`).
- **Journaling** — speak or type an entry, optionally tag the mood and your battery level.
- **Trigger detection** — each entry is analysed for what lifted or drained you. Uses an LLM when `OPENAI_API_KEY` is set, otherwise a local lexicon/category heuristic.
- **Timeline & insights** — entries over time, an energy curve, mood mix, streak, and the recurring boosters/drainers.
- **Private journals** — onboarding runs anonymously against a signed device cookie, then Google or a magic link ties that journal to an account so it follows you to other devices. Export/import moves it as JSON.

## Getting started

```bash
cp .env.example .env.local   # add your ELEVENLABS_API_KEY
npm install
npm run dev
```

Open http://localhost:3000. Microphone access requires `localhost` or HTTPS.

## Storage & identity

Each journal lives in its own namespace: `u/<account>` once signed in, `d/<device>` while onboarding
anonymously. In production that namespace is a Vercel Blob prefix holding one immutable JSON object
per record; locally it is `data/journal.json` (override the directory with `DATA_DIR`).

The device id and the account session are HMAC-signed cookies (`JOURNAL_BLOB_KEY` is the signing
secret), so a guessed cookie cannot reach someone else's journal. The first sign-in copies the
anonymous journal into the account namespace when that account has none yet.

Sign-in is optional and feature-gated: Google appears when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
are set, magic links when `RESEND_API_KEY` is set.

## API

| Route | Description |
| --- | --- |
| `GET/POST /api/profile` | Read or create the onboarding profile |
| `GET/POST /api/entries` | List entries + insights, or add an analysed entry |
| `DELETE /api/entries/:id` | Delete an entry |
| `POST /api/tts` | Text → ElevenLabs speech (audio/mpeg) |
| `POST /api/stt` | Recorded audio → transcript |
| `GET /api/audit` | Profile change history |
| `GET/POST /api/journal` | Export or import the whole journal as JSON |
| `GET/DELETE /api/auth/session` | Current account, or sign out |
| `GET /api/auth/login`, `/api/auth/callback` | Google OAuth |
| `POST /api/auth/magic`, `GET /api/auth/magic/callback` | Magic-link sign-in |
