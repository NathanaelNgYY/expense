# Budget Tracker

Personal iPhone-friendly budget tracker built as a React 19 + Vite PWA. Transactions live on a small Netlify Functions backend (Netlify Blobs store) so they can be captured automatically in the background; the PWA reads/writes through that API and keeps a `localStorage` cache for offline viewing. It tracks a configurable monthly budget (default S$1,200) and supports a shortcut URL that opens straight to the add-entry screen.

## Features

- **Dashboard** — per-category spend vs. budget, a computed buffer that absorbs overages, and a this-week strip.
- **Add Entry** — fast custom numpad, category chips, optional note. Deep-linkable via `?add=true`.
- **History** — weekly bars, lunch pace, monthly category breakdown, and spending insights.
- **Settings** — edit monthly income + per-category budgets, paste the API token, export/import CSV, reset the month.
- **Poker tracker** — log sessions and see P&L, hourly rate, win rate, streaks, and a bankroll trend (stored locally only).
- **Background ingestion** — Apple Pay and DBS-email transactions captured automatically via iOS Shortcuts.

## Running Locally

```bash
npm install
npm run dev
```

The dev server normally opens at `http://localhost:5173`. This serves the UI only — the `/api/*` functions are not running, so the app falls back to its `localStorage` cache.

To run the app together with the backend functions and a local Blobs store, use the Netlify CLI:

```bash
npx netlify dev
```

Set `INGEST_TOKEN` first (e.g. `$env:INGEST_TOKEN = "devtoken"` in PowerShell, or `export INGEST_TOKEN=devtoken`). The combined dev server normally serves at `http://localhost:8888` with `/api/ingest` and `/api/entries` available.

## Running Tests

```bash
npm test
```

## Production Build

```bash
npm run build
npm run preview
```

The preview server normally opens at `http://localhost:4173`.

## Deploying

1. Run `npm run build`.
2. Drag the generated `dist/` folder into Netlify's deploy drop zone, or connect the repo to Netlify/GitHub Pages.
3. Use the deployed HTTPS URL as the app URL.

## iOS Install

1. Open the deployed app URL in Safari on iPhone.
2. Tap Share.
3. Tap Add to Home Screen.
4. Name it `Budget`.
5. Launch it from the home screen to use the standalone PWA.

## iOS Shortcut

1. Open the Shortcuts app.
2. Create a new shortcut with the Open URLs action.
3. Use your deployed URL with `?add=true`, for example:

```text
https://your-site.netlify.app?add=true
```

4. Rename the shortcut to `Log Expense`.
5. Add it to the home screen.

## Background Transaction Ingestion

Transactions are captured automatically by two iOS Shortcuts that POST to the app's API in the background — no need to open the app. Apple Pay fires instantly via the Wallet trigger; PayNow and card spending are captured indirectly from the DBS transaction-alert email (iOS has no PayNow trigger). The server parses, categorises, and de-duplicates each transaction.

### Server setup (one-time)

1. In Netlify, go to Site settings → Environment variables and add `INGEST_TOKEN` set to a long random string.
2. Deploy. The endpoints are `POST /api/ingest` and `GET/POST/PUT/DELETE /api/entries`.
3. In the app, open Settings and paste the same `INGEST_TOKEN` into the **API token** field, then Save.

### Shortcut 1 — Apple Pay

- Automation trigger: **Transaction** → "When I tap" → select your card(s).
- Action: **Get Contents of URL**
  - URL: `https://your-site.netlify.app/api/ingest`
  - Method: `POST`
  - Headers: `Authorization: Bearer <INGEST_TOKEN>`, `Content-Type: application/json`
  - Request Body (JSON):
    - `sourceKind`: `apple_pay`
    - `amount`: the Shortcut "Amount" variable
    - `merchant`: the Shortcut "Merchant" variable
    - `occurredAt`: Current Date, formatted ISO 8601 (include time)
    - `currency`: `SGD`

### Shortcut 2 — DBS email alerts

- Automation trigger: **Email** → from `ibanking.alert@dbs.com`, subject contains `Alerts`.
- Action: **Get Contents of URL**
  - URL: `https://your-site.netlify.app/api/ingest`
  - Method: `POST`
  - Headers: same as above
  - Request Body (JSON):
    - `sourceKind`: `dbs_email`
    - `rawBody`: the email's body text
    - `occurredAt`: Current Date, ISO 8601

The server extracts the amount and merchant from `rawBody`, so parsing can be improved in code without editing the Shortcut. Each transaction gets a deterministic `dedupeKey`, so a re-fired automation will not create duplicate entries.

## Budget Defaults

Monthly income and every bucket are editable in Settings. Defaults (sum to the S$1,200 income):

| Bucket | Monthly |
| --- | ---: |
| Lunch | S$264 |
| Transport | S$50 |
| Savings | S$400 |
| Investments | S$250 |
| Buffer | S$236 |

The **Buffer** isn't a spending category — it absorbs per-category overages, computed as the buffer
budget minus the sum of all category overages. Uncategorised entries (`others`) count toward weekly/monthly
totals but not the per-category rows.

## Data Notes

Transactions are stored server-side in Netlify Blobs (the source of truth) and cached in browser `localStorage` for offline viewing; on first load after deploy, any pre-existing local entries are migrated up to the server. Each entry has a deterministic `dedupeKey`, so re-fired automations and re-imported CSVs won't create duplicates. Budget settings and poker sessions live only in `localStorage`. The Settings screen can export and import entries as CSV and reset the current month's entries.
