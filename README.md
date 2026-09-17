# Energy Journal

A voice-first journal for tracking your energy battery and the things that charge or drain it.

- **Audio onboarding** — the app asks for your name, gender, what you enjoy and how your day went. Questions are spoken with ElevenLabs TTS; answers are recorded in the browser and transcribed with ElevenLabs Scribe (`scribe_v1`).
- **Journaling** — speak or type an entry, optionally tag the mood and your battery level.
- **Trigger detection** — each entry is analysed for what lifted or drained you. Uses an LLM when `OPENAI_API_KEY` is set, otherwise a local lexicon/category heuristic.
- **Timeline & insights** — entries over time, an energy curve, mood mix, streak, and the recurring boosters/drainers.

## Getting started

```bash
cp .env.example .env.local   # add your ELEVENLABS_API_KEY
npm install
npm run dev
```

Open http://localhost:3000. Microphone access requires `localhost` or HTTPS.

Data is stored in a local SQLite file at `data/journal.db` (override with `DATA_DIR`).

## API

| Route | Description |
| --- | --- |
| `GET/POST /api/profile` | Read or create the onboarding profile |
| `GET/POST /api/entries` | List entries + insights, or add an analysed entry |
| `DELETE /api/entries/:id` | Delete an entry |
| `POST /api/tts` | Text → ElevenLabs speech (audio/mpeg) |
| `POST /api/stt` | Recorded audio → transcript |
