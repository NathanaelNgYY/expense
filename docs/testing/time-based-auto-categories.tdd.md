# Time-based automatic categories — TDD evidence

## Source and journeys

No source plan was provided. The acceptance criteria were derived from the user request and current Supabase ingestion architecture.

> As a user with separate Lunch and Dinner categories, I want recognized food purchases to use Singapore-time windows so an evening Apple Pay capture does not land in Lunch.

> As a user with custom categories, I want a meal window to target any existing category and corrected merchants to keep teaching the automatic capture system.

## Acceptance criteria

- AC-001: Recognized food merchants use the category selected for the matching SGT time window.
- AC-002: Windows may cross midnight and may target built-in or custom category ids.
- AC-003: A correction for the same merchant in the same window overrides the configured default; non-food learned categories keep their existing behavior.
- AC-004: Transport and unknown merchants are not affected by food-time rules.
- AC-005: Preferences are stored per Supabase user with owner-only RLS and service-role access for the token-authenticated ingest function.
- AC-006: Missing, malformed, offline, or unavailable preferences never prevent a transaction capture.
- AC-007: The iPhone settings UI exposes 44px controls, prevents overlapping windows, reports load/save failure, and stays within the viewport.

## RED and GREEN evidence

- RED command: `npm test -- src/shared/automaticCategoryRules.test.ts src/screens/settings/MealTimeRulesSettings.test.tsx src/api.test.ts supabase/functions/ingest/handler.test.ts`
- RED result: the shared resolver and settings component were missing, the API methods were undefined, and a configured evening Koufu capture returned `lunch` instead of `cat_dinner`.
- RED checkpoint: `4bdadde test: reproduce time-based custom category gaps`
- GREEN command: `npm test -- src/shared/automaticCategoryRules.test.ts src/screens/settings/MealTimeRulesSettings.test.tsx src/screens/settings/AutomaticCaptureSettings.test.tsx src/api.test.ts supabase/functions/ingest/handler.test.ts`
- GREEN result: 56 tests passed across 5 files.
- GREEN checkpoint: `77acf55 feat: add time-based custom auto-categories`
- Refactor checkpoint: `1307bb1 perf: lazy-load meal timing styles`; the initial CSS budget returned from 12.4 KiB to 12.0 KiB gzip.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Noon and evening food captures resolve to different built-in/custom category ids in SGT | `src/shared/automaticCategoryRules.test.ts` | Unit | PASS |
| 2 | Same-window merchant corrections override the configured category | `src/shared/automaticCategoryRules.test.ts` | Unit | PASS |
| 3 | Cross-midnight windows work | `src/shared/automaticCategoryRules.test.ts` | Unit | PASS |
| 4 | Transport and ambiguous merchants ignore food windows | `src/shared/automaticCategoryRules.test.ts` | Unit | PASS |
| 5 | Other custom categories continue learning from exact merchant history | `src/shared/automaticCategoryRules.test.ts` | Unit | PASS |
| 6 | Preferences fetch and save through one user-owned upsert | `src/api.test.ts` | Unit/integration | PASS |
| 7 | The ingest handler assigns a custom Dinner id and degrades safely when preferences fail | `supabase/functions/ingest/handler.test.ts` | Integration | PASS |
| 8 | The settings UI can target Dinner or another custom category and recover from load failure | `src/screens/settings/MealTimeRulesSettings.test.tsx` | Component | PASS |
| 9 | The offline preference state has a 44px retry target and no horizontal overflow at 390×844 | `tests/e2e/journeys.spec.ts` | Browser E2E | PASS |
| 10 | Owners are isolated and anonymous/forged access is denied | `supabase/tests/rls/automaticCategoryPreferences.rls.test.ts` | Live RLS | NOT RUN LOCALLY |

## Full verification

- `npm run test:coverage`: 59 files and 502 tests passed; 84.50% statements, 77.34% branches, 83.14% functions, 88.09% lines.
- `npm run test:e2e`: 10 mobile Chromium tests passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run size`: 137.0 KiB initial JavaScript and 12.0 KiB initial CSS, both within budget.
- `npm run typecheck:functions`: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.

## Known gap and deployment order

The local Supabase RLS suite could not run because Docker Desktop/the local Supabase stack was unavailable. The migration and live isolation tests are committed, but their result is deliberately recorded as not run. Do not deploy the client first: apply the migration, verify RLS, deploy the ingest Edge Function, then deploy the PWA and test a Lunch/Dinner pair on a physical iPhone.
