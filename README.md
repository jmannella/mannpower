# Mannpower

Workout, body weight, steps, cardio and pain tracker for Android, installed from the browser.

- App: https://jmannella.github.io/mannpower/
- Data: private repo `jmannella/mannpower-data`, file `data.json`, written by the app.
- Weekly digest: `npm run report` (needs `.env` with `MANNPOWER_TOKEN`).

## Develop

```bash
npm install
npm test
npm run dev
```

## Install on the phone

Open the app URL in Chrome, tap the three dots, tap "Add to Home screen". Then open Settings inside the app and paste the GitHub token.

Design spec: `docs/superpowers/specs/2026-09-08-mannpower-design.md`.
