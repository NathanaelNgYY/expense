# Budget Tracker

Personal iPhone-friendly budget tracker built as a React 19 + Vite PWA, hosted on Vercel with Supabase for per-user storage and background ingestion. The PWA keeps a user-scoped `localStorage` cache for offline use. It tracks a configurable monthly budget (default S$1,200) and supports a shortcut URL that opens straight to the add-entry screen.

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

1. Find the target account id in Supabase Dashboard → Authentication → Users.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally, then run `node scripts/mint-ingest-token.mjs <user-id> ios-shortcut`.
3. Save the raw token printed once by the script. The ingest endpoint is `https://<project>.supabase.co/functions/v1/ingest`.

### Shortcut 1 — Apple Pay

- Automation trigger: **Transaction** → "When I tap" → select your card(s).
- Before the request, add **Get Text from Input**. Use **Shortcut Input**, tap it, and select its **Transaction** field. Keep that output as `Transaction Key`.
- Action: **Get Contents of URL**
  - URL: `https://<project>.supabase.co/functions/v1/ingest`
  - Method: `POST`
  - Headers: `Authorization: Bearer <INGEST_TOKEN>`, `Content-Type: application/json`
  - Request Body (JSON):
    - `sourceKind`: `apple_pay`
    - `amount`: the Shortcut "Amount" variable
    - `merchant`: the Shortcut "Merchant" variable
    - `occurredAt`: Current Date, formatted ISO 8601 (include time)
    - `currency`: `SGD`
    - `idempotencyKey`: the `Transaction Key` output above

### Shortcut 2 — DBS email alerts

- Automation trigger: **Email** → from `ibanking.alert@dbs.com`, subject contains `Alerts`.
- Action: **Get Contents of URL**
  - URL: `https://<project>.supabase.co/functions/v1/ingest`
  - Method: `POST`
  - Headers: same as above
  - Request Body (JSON):
    - `sourceKind`: `dbs_email`
    - `rawBody`: the email's body text
    - `occurredAt`: Current Date, ISO 8601

The server extracts the amount and merchant from `rawBody` and fingerprints that unchanged email body, so a re-fired email automation remains idempotent without another Shortcut field. Apple Pay uses `idempotencyKey` to distinguish real same-merchant purchases while collapsing retries of the same transaction. Older Apple Pay shortcuts without that field use a one-minute fallback and should be upgraded.

### Testing & troubleshooting ingestion (no Apple Pay needed)

The iOS Shortcut is just an HTTP POST, so you can exercise the whole pipeline without a real
purchase:

```bash
npm run test:ingest         # the ingestHandler unit/integration tests (no network)
# fire a real POST (the default still supports the frozen local Netlify fallback):
npm run test:ingest:live
npm run test:ingest:live -- -Url https://<project>.supabase.co -Token <INGEST_TOKEN>
# repeat with the same -IdempotencyKey => duplicate; change it => a distinct transaction
```

`scripts/test-ingest.ps1` prints the request and the response (`saved` / `duplicate` / an HTTP
error). Firing the same body twice returns `duplicate`, proving dedupe. A `401` means the token
doesn't match; a "no HTTP response" means the server isn't reachable.

Common Shortcut errors:

- **`{"error":"unauthorized"}` (401)** — the `Authorization` header must be `Bearer <INGEST_TOKEN>`
  (the literal word `Bearer`, a space, then the token). A bare token fails the server's
  `^Bearer\s+(.+)$` check. Paste the value rather than typing it (iOS autocapitalize/autocorrect
  mangles long tokens). `Bearer` is case-sensitive.
- **`kCFErrorDomainCFNetwork error -1005` ("network connection was lost")** — this is iOS's
  networking layer, not the server. If `npm run test:ingest:live` against prod returns `saved`,
  the backend is fine and the drop is on the device (Wallet automations fire mid-radio-handoff;
  iCloud Private Relay / a flaky network can also cause it). Note Shortcuts has **no try/catch**,
  so wrapping the request in *Repeat* does **not** retry on this error — the action aborts the
  whole shortcut. The dedupe key makes a re-fired automation safe regardless.

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

Transactions are stored per user in Supabase and cached in a user-scoped browser `localStorage` namespace for offline viewing. Ingest requests use stable event fingerprints for idempotency; manual entries preserve their own ids across queue retries and imports.

## Shared Budgets (Supabase)

Shared budgets let friends or family spend from a common pot with live updates.
Personal and shared budget data both use Supabase with separate RLS-protected tables.

One-time setup:

1. Create a free project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/001_shared_budgets.sql`.
3. In Auth > Email Templates > Magic Link, make sure the body contains
   `{{ .Token }}` so sign-in emails include the 6-digit code the app asks for.
4. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key
   from Settings > API. Add the same two vars in Netlify > Site > Environment
   variables, then redeploy.

Sign in on the Shared tab with your email and the emailed code. Create a budget,
then share its invite code; anyone who signs in and enters the code joins.
