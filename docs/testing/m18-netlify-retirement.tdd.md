# M18 backend retirement — TDD evidence

**Date:** 2026-07-14  
**Branch:** `cleanup/m18-netlify`

## Contract

M18 retires the inactive serverless backend without changing the live product contract:

- Vercel remains the PWA host.
- Supabase remains the only entries, shared-budget, and ingestion backend.
- iOS Shortcuts continue posting to `/functions/v1/ingest` with an app-issued bearer token.
- The browser cache and durable offline mutation queue remain user-scoped.

Historical migration specs remain unchanged as point-in-time records.

## RED

`src/m18NetlifyCleanup.test.ts` was added and run before implementation. All three tests failed for the intended reasons:

1. the retired runtime directory still existed;
2. `supabase/config.toml` did not preserve the ingest function's custom-token authentication setting;
3. current guidance still described an inactive fallback and development command.

Checkpoint commit: `9d47529 test: require retirement of Netlify fallback`.

## GREEN

| Gate | Command | Result |
| --- | --- | --- |
| Retirement contract | `npm test -- src/m18NetlifyCleanup.test.ts src/EntriesContext.test.tsx` | 2 files, 19 tests passed |
| Ingest contract | `npm run test:ingest` | 16 tests passed |
| Full coverage | `npm run test:coverage` | 52 files, 453 tests passed; 84.51% statements, 77.08% branches, 83.13% functions, 88.12% lines |
| Static checks | `npm run lint`; `npm run typecheck:functions` | Passed |
| Production artifact | `npm run build`; `npm run size` | Passed; 106.5 KiB gzip entry JS and 11.2 KiB gzip CSS |
| Browser/accessibility | `npm run test:e2e` | 7 mobile Chromium checks passed |
| Dependency security | `npm audit` | 0 vulnerabilities |
| Clean install | `npm ci` | 571 packages installed from lockfile; audit clean |

The PowerShell parser also accepts `scripts/test-ingest.ps1`. Its URL validation permits only a Supabase project URL or the full `/functions/v1/ingest` endpoint.

## Implementation notes

- Deleted the retired runtime, configuration, duplicated handlers, tests, and both `@netlify/*` packages (49 packages removed).
- Removed tombstone and pending-create state that existed only to reconcile eventually consistent object-store listings. The optimistic UI and durable mutation queue are unchanged; a successful refresh now commits the authoritative Postgres result.
- Added `[functions.ingest] verify_jwt = false` to `supabase/config.toml`. The Edge Function performs its own bearer-token hashing and `ingest_tokens` lookup, so platform JWT verification must not intercept Shortcut requests.
- Updated current guidance and the live ingest script to describe and exercise only the active Vercel/Supabase architecture.

## PR CI follow-up

The first PR run passed all 442 tests but failed the Linux coverage gate at 83.71% statements and 81.39% functions. The thresholds were not lowered. Deterministic tests now exercise all five TabBar destinations, both storage append helpers, and corrupt-cache recovery paths; the expanded local suite passes with the coverage shown above.
