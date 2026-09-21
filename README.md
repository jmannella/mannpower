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

Open the app URL in Chrome, tap the three dots, tap "Add to Home screen". Then open Settings inside the app and paste the GitHub token and tap Sync now.

## Food tracking

The Food tab logs meals three ways: Describe (type, dictate or photograph a meal and Claude estimates it), Saved (one tap for meals you repeat) and Quick add (calories and protein typed in).

Describe needs an Anthropic API key. Create one at console.anthropic.com, add a few dollars of credit, paste it into Settings under AI meal estimates and tap Test key. The key stays on the phone and is never synced. Each estimated meal costs a few cents; Saved and Quick add are free and work offline.

Enter height and sex in Settings (birth year and body weight are already there). The app starts from a formula estimate of maintenance calories and switches to a number measured from your own food and weight logs once 14 full days are logged inside 28. The daily targets update once a week, on Monday. Overrides in Settings replace them.

Design spec: `docs/superpowers/specs/2026-09-08-mannpower-design.md`.
