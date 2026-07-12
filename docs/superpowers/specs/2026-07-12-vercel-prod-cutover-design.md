# Netlify → Vercel hosting move + prod Supabase cutover — design spec

**Date:** 2026-07-12
**Status:** approved design; supersedes the *rollout* section of
`2026-07-11-supabase-migration.md` (whose code-level design remains authoritative and is already
implemented in the working tree). Constraint **C1 (frozen URL) is consciously retired** by this
spec — see "User handoff" for how data safety is preserved without it.

## Goal

1. Host the PWA on **Vercel** (default `*.vercel.app` domain) instead of Netlify.
2. Point the app at the **production** Supabase project (**Budget**, `igsjhpfymspbyzqzpzme`)
   instead of staging (`rjwzzsocxykbfellsihr`), which is deleted once cutover is verified.
3. Merge the Supabase-migration working-tree changes to `main`.

## Why the URL can change now

The original C1 existed because non-owner users' data lives only in origin-scoped localStorage.
The user base is three personally-known people (owner + 2). Instead of freezing the origin, each
user performs a **one-time manual export/import** (below). The old Netlify site **keeps running
untouched** as a fallback, so nobody's data is at risk during the transition — the export *copies*
data; nothing is ever cleared (C2 survives).

## Target architecture

- **Vercel = static host only.** After the Supabase transport swap, the client talks to Supabase
  directly (supabase-js) and ingest is a Supabase Edge Function at `*.supabase.co` — no serverless
  functions on the host. Vercel builds `npm run build` → serves `dist/`.
- **Backend = prod Supabase** (`igsjhpfymspbyzqzpzme`): `entries`, `poker_sessions`,
  `ingest_tokens` tables with RLS (existing migration files in `supabase/migrations/`),
  anonymous-first auth, `ingest` Edge Function deployed `--no-verify-jwt`.
- **Netlify site stays as-is** (fallback; it is not git-linked, so merges to `main` cannot
  affect it). `netlify/functions/` stays in the repo untouched for now.
- **Anonymous identity is origin-scoped** — each user gets a *new* anonymous account on the
  Vercel origin; their data reaches it via import, not via cross-origin session reuse.

## New app feature: Export / Import (Settings)

The only new application code in this migration.

### Export
- Button in Settings → downloads `budget-export-<YYYY-MM-DD>.json`.
- Contents: `{ schemaVersion: 1, exportedAt, entries, pokerSessions, settings }` where
  `settings` carries the origin-locked localStorage keys: `budget_config`,
  `budget_custom_categories`, `budget_category_overrides`, `poker_custom_stakes`, theme.
- Entries/poker come from the localStorage cache (the authoritative local copy).

### Import
- Button in Settings → file picker → parse + validate (schema version, required fields,
  numeric amounts, `YYYY-MM-DD` dates). Invalid file ⇒ clear user-facing error, nothing written.
- Requires being online (it must reach Supabase); offline ⇒ clear error, retry later.
- Apply order:
  1. Settings keys written to localStorage: each key from the payload is applied only when the
     device has none yet (fill-only-if-empty), so a stale export can never overwrite newer local
     settings. Entries/poker sessions are still merged by id as before.
  2. Entries batch-upserted to Supabase **preserving `id` + `dedupeKey`** (`on conflict do
     nothing` semantics) and merged into the local cache (merge by id, never replace/clear — C2).
  3. Poker sessions via existing `bulkUpsertPokerSessions`.
- Idempotent: re-importing the same file is a no-op. Partial failure is safe to retry.
- Interaction with `supabase_migration_done`: none — import upserts directly through the API
  path and does not depend on or modify the migration flag.

### Tests
Unit (Vitest, colocated): export payload shape/completeness; import validation failures;
idempotent re-import; merge-not-replace of cache; settings restore. Existing suites must stay
green.

## Prod Supabase setup

1. `supabase db push` the two migration files to `igsjhpfymspbyzqzpzme`
   (`20260711120000_personal_entries.sql`, `20260711130000_text_entry_ids.sql`).
2. Enable **anonymous sign-ins** in prod Auth settings (dashboard step).
3. Deploy Edge Function: `supabase functions deploy ingest --no-verify-jwt`.
4. After the owner's import creates their prod user: seed `ingest_tokens` with the sha256 of the
   **existing** Shortcut bearer token (`scripts/mint-ingest-token.mjs`) mapped to that `user_id`.
   Shortcuts keep the same `Authorization: Bearer …` header; **only their URL changes** to
   `https://igsjhpfymspbyzqzpzme.supabase.co/functions/v1/ingest`.

## Vercel setup (CLI — no Vercel MCP registered)

- One-time interactive `npx vercel login` + `npx vercel link` (new project, e.g.
  `budget-tracker`).
- `vercel.json`: port from `netlify.toml` — CSP (`connect-src 'self' https://*.supabase.co
  wss://*.supabase.co`), security headers, and `Cache-Control: public, max-age=0,
  must-revalidate` for `/`, `/index.html`, `/sw.js`, `/registerSW.js`. No functions config.
- Production env vars via `vercel env add`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_EXPECTED_SUPABASE_PROJECT_REF` — **prod** values.
- Deploy: `npx vercel --prod`. Verify the deployment is publicly accessible (no deployment
  protection on the production URL).

## Cutover runbook (owner-driven, in order)

1. **Backup first:** export the owner's Netlify Blobs store to a local JSON file (via
   `/api/entries` with the owner token or `netlify blobs:*`). Stored **outside git** — personal
   data is never committed.
2. The old origin never gets the export button because no Netlify deploys remain. On the old URL,
   the owner runs the bookmarklet from the implementation plan (Task 9), which copies localStorage
   as an `ExportPayloadV1` JSON string to the clipboard; they then use **Paste import** on the new
   Vercel app, verify entry/poker counts match the backup, and add the new PWA to the iPhone home
   screen.
3. Seed the ingest token (see above); re-point both iOS Shortcuts (Apple Pay + DBS email) to the
   Edge Function URL; fire a test transaction through each and confirm `saved` / `duplicate`.
4. Send the new URL to the 2 other users; walk each through export → import; verify their data
   appears (they confirm counts on-screen).
5. Only after all three accounts verified: **delete the staging Supabase project**
   (`rjwzzsocxykbfellsihr`).

Rollback at any point = keep using the Netlify app; it is never modified.

## Git plan

1. Commit the current working tree on `improvement/production-readiness` in logical commits
   (transport swap + sync, Edge Function + SQL migrations, docs/scripts).
2. Implement export/import (TDD) as its own commit(s).
3. Full gate: `npm test`, `npm run build`, `npm run lint` green.
4. Merge `improvement/production-readiness` → `main`.

Scratch files in the tree (`dev-output.txt`, `dev-theme.err`, `dev-theme.out`) are not committed
(gitignored or deleted). The Blobs backup JSON is never committed.

## Out of scope

- Account linking / durable sign-in for entries (anonymous-first stays; linking remains the
  follow-up noted in the 2026-07-11 spec).
- Deleting `netlify/functions/` code, the tombstone/pending-creates reconciliation cleanup, and
  the Netlify site itself — all deferred until the Netlify fallback is retired.
- Custom domain.
