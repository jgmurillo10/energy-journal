---
name: energy-journal-runtime-testing
description: Production browser testing for anonymous Energy Journal onboarding, profile persistence, and note pagination.
---

# Browser runtime testing

- Production is https://energy-journal-rosy.vercel.app; anonymous journals need no login.
- Close all incognito windows before starting a second isolated journal; a second incognito window alone shares cookies.
- Maximize each new window with `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`.
- Onboarding has Name, Enjoys, and Day steps. Tap to begin; blocked microphone may open typing automatically. Use Continue to submit.
- Capture acknowledgements during Listen and after Type instead: rendering may differ between those phases.
- A nonempty day answer creates an entry; skip-all creates an empty journal. Account for this in pagination counts.
- At three notes there is no older-notes control; at four it is singular; at five it is plural. Expand and collapse with actual clicks, not just reload.
- Production hides analyser labels in both timeline and settings. Do not require cloud model labels in production evidence.
- Empty Name is valid. Save a real Enjoys change while leaving Name empty, then reload to distinguish persisted success from a no-op click.
- Use stable screenshots after navigation before clicking: scroll restoration and generated summary banners can move controls.
- Journal codes are access credentials; keep them out of recordings.
- Headless microphone failures and missing emoji glyphs are VM limitations. Web cannot prove native upload, audible speech quality, or iOS keyboard behavior.

## Devin Secrets Needed

None for deployed typed UI tests; cloud/TTS credentials are managed by the deployment.
