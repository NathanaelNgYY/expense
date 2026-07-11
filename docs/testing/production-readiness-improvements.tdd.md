# Production readiness improvements — TDD evidence

## Source

Journeys were derived from the July 2026 project improvement report.

## User journeys

- As a user, I can record two equal purchases from one merchant without one silently disappearing.
- As an operator, I can reject a production build that points at an unidentified Supabase project.
- As a spreadsheet user, I can export notes without allowing them to execute as formulas.
- As a keyboard user, I can enter an amount without using the on-screen numpad.
- As an assistive-technology user, I can navigate to the active application content through a main landmark.

## Guarantees

| Guarantee | Test | RED evidence | GREEN evidence |
|---|---|---|---|
| Equal purchases at different timestamps persist; an exact retry remains idempotent | `supabase/functions/ingest/handler.test.ts` | Second purchase returned `duplicate` | Targeted suite and full suite pass |
| Ingest dedupe keys include canonical exact occurrence time | `src/shared/entry.test.ts` | Expected timestamp-bearing keys differed | Targeted suite and full suite pass |
| Formula-leading CSV notes are neutralized | `src/csvEntries.test.ts` | Four formula-prefix cases exported unchanged | All four cases pass |
| Production requires an expected Supabase project ref | `src/lib/supabaseClient.test.ts` | Missing expected ref did not throw | Validation test passes |
| App exposes a `main` landmark | `src/App.test.tsx` | No accessible `main` role found | App tests pass |
| Add Entry accepts physical numeric keys | `src/screens/AddEntry.test.tsx` | Keyboard input left amount at zero | Add Entry tests pass |

## Verification

- `npm test`: 45 files, 369 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; initial JS reduced from 150.30 KB to 133.88 KB gzip and History, Settings, Poker, and Shared are emitted as lazy chunks.

## Known gaps

Live Supabase RLS/migration rehearsal, browser E2E, durable IndexedDB outbox, identity linking, complete recovery, and the safe-to-spend model require separately scoped product/data work and production-like infrastructure. The main bundle remains above the report's recommended 90 KB gzip target.
