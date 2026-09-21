---
name: energy-journal-expo-web-testing
description: Run the Expo mobile client's typed flows in a browser against its configured API and distinguish web evidence from native coverage.
---

# Expo web testing

- Read `mobile/AGENTS.md`; use the versioned Expo documentation matching the SDK.
- From `mobile/`, source `~/.nvm/nvm.sh` and run `npx expo start --web --port 8082` if no web server is running. Preserve any separate native Metro/tunnel server.
- Check `mobile/src/api.ts` for API_BASE. The web client uses a localStorage journal token; native uses SecureStore. No account login is required for a fresh anonymous journal.
- Browser requests need API CORS support, including OPTIONS, `x-journal-token`, and PATCH for profile edits. If the UI says Failed to fetch, inspect Chrome console before blaming the form.
- Fresh journal: tap onboarding orb, then Type instead for each of four questions. Enter and Send should advance; Cancel clears the draft without advancing.
- Check the one-entry chart immediately after onboarding: the first-day answer automatically creates a journal entry. A composer save produces the second entry.
- Onboarding normalizes gender (e.g. Woman to Female); settings edits are stored directly.
- Settings cog opens editable details. Show my code reveals a credential granting journal access; avoid publishing that code in screenshots or recordings.
- Headless microphones may be blocked. Use typing without claiming native recorder/upload or iOS software-keyboard coverage. Speaking UI alone does not establish audible TTS quality.
- If mood/battery emoji appear as missing glyphs, check available emoji fonts in the test machine before attributing the issue to app data.

## Devin Secrets Needed

- No local secret is required to exercise typed flows against the production API.
- `ELEVENLABS_API_KEY` is needed by a locally run backend for real TTS/STT; never store the value in test artifacts.
