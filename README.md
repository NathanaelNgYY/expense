# Budget Tracker

Personal iPhone-friendly budget tracker built as a React 19 + Vite PWA, hosted on Vercel with Supabase for per-user storage and background ingestion. The PWA keeps a user-scoped `localStorage` cache for offline use. It tracks a configurable monthly budget (default S$1,200) and supports a shortcut URL that opens straight to the add-entry screen.

## Features

- **Dashboard** — per-category spend vs. budget, a computed buffer that absorbs overages, and a this-week strip.
- **Add Entry** — fast custom numpad, category chips, optional note. Deep-linkable via `?add=true`.
- **History** — weekly bars, lunch pace, monthly category breakdown, and spending insights.
- **Settings** — edit monthly income + per-category budgets, follow the guided Automatic Tracking setup, check which account receives Shortcut transactions and when the last capture arrived, export/import CSV, and reset the month with Undo.
- **Poker tracker** — log sessions and see P&L, hourly rate, win rate, streaks, and a bankroll trend (stored locally only).
- **Background ingestion** — Apple Pay and DBS-email transactions captured automatically via iOS Shortcuts.

## Running Locally

```bash
npm install
npm run dev
```

The dev server normally opens at `http://localhost:5173`. Copy `.env.example` to `.env.local` and provide the Supabase URL and anon key to use the configured backend; the user-scoped local cache still supports offline work.

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

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Deploy with `npx vercel --prod`.
3. Keep the Supabase and Sentry environment variables in Vercel.

Production: `https://budget-tracker-sooty-ten.vercel.app`

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
https://budget-tracker-sooty-ten.vercel.app?add=true
```

4. Rename the shortcut to `Log Expense`.
5. Add it to the home screen.

### Quick-add presets (deep link)

The Add screen can be prefilled from the URL, so an iOS Shortcuts home-screen widget
can carry a one-tap preset:

`https://<app-url>/?add=true&category=<id-or-name>&amount=<number>`

- `category` matches a category by its name (case-insensitive), e.g. `lunch` or `Groceries`.
  An unknown name just leaves the category empty.
- `amount` is in your active wallet currency, up to 2 decimals.
- The entry is **prefilled, not auto-saved** — you review it and tap Save.

Example — a "Kopi" preset: `…/?add=true&category=lunch&amount=2.20`

## Background Transaction Ingestion

Transactions are captured automatically by two iOS Shortcuts that POST to the app's API in the background — no need to open the app. Apple Pay fires instantly via the Wallet trigger; PayNow and card spending are captured indirectly from the DBS transaction-alert email (iOS has no PayNow trigger). The server parses, categorises, and de-duplicates each transaction.

Open **Settings → Automatic Tracking** for the guided Apple Pay installer, the smaller Wallet
automation handoff, the receiving account, the most recent capture time, and the source. The app
generates a show-once setup value containing the complete `Bearer <token>` header value, then opens
the configured Apple-hosted Shortcut template. The public installer URL never contains that private
value. Set `VITE_APPLE_PAY_SHORTCUT_URL` to the template's iCloud link; see
[`docs/APPLE_PAY_SHORTCUT_TEMPLATE.md`](docs/APPLE_PAY_SHORTCUT_TEMPLATE.md) for publishing and
physical-device validation.

### Rotating the ingest token

The capture card has a **Rotate token** button (**Generate token** if the account has none). In the
guided installer these controls read **Reconnect Apple Pay** and **Set up Apple Pay**. Rotation
mints a fresh token, shows the complete `Bearer <token>` setup value **once**, and keeps the old token
working for **24 hours** so you can update your Shortcut without dropping captures. Once the grace
window passes, the old token stops authenticating (`401`). The raw token is generated server-side,
returned to the signed-in session once, and never stored (only its hash is). Rotation requires a
real signed-in account.

### Server setup (one-time)

You can skip this and just tap **Generate token** in the app. The manual script below remains for scripted or bulk minting:

1. Find the target account id in Supabase Dashboard → Authentication → Users.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally, then run `node scripts/mint-ingest-token.mjs <user-id> ios-shortcut`.
3. Save the raw token printed once by the script. The ingest endpoint is `https://<project>.supabase.co/functions/v1/ingest`.

### Shortcut 1 — Apple Pay

Standard user setup:

1. Tap **Set up Apple Pay**, then **Copy & add Shortcut** in the PWA.
2. Paste the value into the template's import question and add **Budget Tracker Capture**.
3. Create **Automation → Transaction → When I Tap**, select the cards, and choose
   **Run Immediately**.
4. Add **Run Shortcut → Budget Tracker Capture** and pass the Transaction input.

The shared Shortcut owns the endpoint, POST method, Authorization header, and four-field JSON body.
The manual body remains `sourceKind: apple_pay`, Amount, Merchant, and `currency: SGD` for
troubleshooting or when no installer link is configured.

Keep this as the original four-field payload. Do **not** add `idempotencyKey`: the Wallet trigger does not expose a documented stable transaction identifier, and its whole `Transaction` value can collapse to the merchant name when converted to text.

### Shortcut 2 — DBS email alerts

- Automation trigger: **Email** → from `ibanking.alert@dbs.com`, subject contains `Alerts`.
- Action: **Get Contents of URL**
  - URL: `https://<project>.supabase.co/functions/v1/ingest`
  - Method: `POST`
  - Headers: same as above
  - Request Body (JSON):
    - `sourceKind`: `dbs_email`
    - `rawBody`: the email's body text
    - `occurredAt`: Current Date, ISO 8601 (recommended but optional)

The server extracts the amount, payee, and DBS `Date & Time` from `rawBody`, then fingerprints that unchanged email body, so a re-fired email automation remains idempotent without another Shortcut field. This means a DBS alert that arrives late is still recorded on the transaction's actual date. Business/UEN PayNow recipients use the same merchant rules and correction history as Apple Pay; first-time person-to-person recipients marked `MOBILE` start in Others, and a later category correction is reused for that recipient. Email delivery still controls when the automation can run because iOS has no native PayNow trigger.

Apple Pay uses a one-minute fallback based on merchant and amount. This catches quick re-fires, but two identical real purchases in the same minute can be merged and a retry that crosses a minute boundary can be saved twice. A non-Shortcuts client may send `idempotencyKey` only when it has a genuinely stable, unique external event identifier.

### Testing & troubleshooting ingestion (no Apple Pay needed)

The iOS Shortcut is just an HTTP POST, so you can exercise the whole pipeline without a real
purchase:

```bash
npm run test:ingest         # the ingestHandler unit/integration tests (no network)
# fire a real POST against the Supabase Edge Function:
$env:SUPABASE_URL = 'https://<project>.supabase.co'
$env:INGEST_TOKEN = '<raw-token>'
npm run test:ingest:live
npm run test:ingest:live -- -Url https://<project>.supabase.co -Token <INGEST_TOKEN>
# optional for non-Shortcuts clients with a true event id:
npm run test:ingest:live -- -IdempotencyKey <stable-external-event-id>
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
  whole shortcut. A re-fire within the same minute is normally deduplicated; a retry that crosses
  a minute boundary can still create a second Apple Pay entry and should be reviewed in History.

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

Transactions are stored per user in Supabase and cached in a user-scoped browser `localStorage` namespace for offline viewing. DBS emails use a stable body fingerprint, Apple Pay uses a one-minute merchant/amount fallback, and manual entries preserve their own ids across queue retries and imports.

## Shared Budgets (Supabase)

Shared budgets let friends or family spend from a common pot with live updates.
Personal and shared budget data both use Supabase with separate RLS-protected tables.

One-time setup for a new Supabase project:

1. Create a free project at https://supabase.com.
2. Link the Supabase CLI and run `supabase db push` to apply the complete migration history.
3. In Auth > Email Templates > Magic Link, make sure the body contains
   `{{ .Token }}` so sign-in emails include the 6-digit code the app asks for.
4. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key
   from Settings > API. Add the same public client variables in Vercel for Preview
   and Production, then redeploy.

Sign in on the Shared tab with your email and the emailed code. Create a budget,
then share its invite code; anyone who signs in and enters the code joins.
