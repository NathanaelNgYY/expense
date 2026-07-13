# Ingest idempotency TDD evidence

**Date:** 2026-07-13
**Source:** C3 in the 2026-07-13 project improvement report; no separate plan file.

## User journeys

- As an Apple Pay user, I want a re-fired automation to save one transaction even when its run timestamp changes.
- As a user making two real equal purchases in one minute, I want both transactions preserved.
- As a DBS user, I want repeated processing of the same email to be idempotent without extra Shortcut setup.

## RED

- Checkpoint: `d8c1c67 test: reproduce ingest re-fire duplicates`
- Command: `npm test -- supabase/functions/ingest/handler.test.ts netlify/functions/lib/ingestHandler.test.ts`
- Result: 6 intended failures and 19 passes.
- Reproduced: timestamp-sensitive retries, no stable event key, no DBS body fingerprint, no legacy minute fallback, and no key-size validation.

## GREEN

- Checkpoint: `52a3df6 fix: make ingest retries idempotent`
- Command: `npm test -- supabase/functions/ingest/handler.test.ts netlify/functions/lib/ingestHandler.test.ts src/shared/entry.test.ts src/shared/dedupe.test.ts`
- Result before coverage-path additions: 4 files passed, 36 tests passed.

## Coverage

- Command: `npm exec vitest -- run supabase/functions/ingest/handler.test.ts netlify/functions/lib/ingestHandler.test.ts src/shared/entry.test.ts src/shared/dedupe.test.ts --coverage` with the four changed modules included.
- Result: 4 files and 39 tests passed; 98.43% statements, 92.4% branches, 100% functions, and 98.36% lines.

## Full verification

- `npm test`: 51 files and 436 tests passed.
- `npm run lint`: passed with no errors.
- `npm run build`: TypeScript and the Vite production build passed.

## Guarantees

| Guarantee | Test target | Type | Result |
|---|---|---|---|
| Stable Apple Pay event key ignores changing run timestamps | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Distinct event keys preserve equal same-minute purchases | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Legacy Apple Pay payloads dedupe within one minute | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Repeated DBS raw email bodies dedupe across timestamps | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Oversized external keys are rejected before storage | `supabase/functions/ingest/handler.test.ts` | boundary | PASS |
| Frozen Netlify fallback follows the same contract | `netlify/functions/lib/ingestHandler.test.ts` | integration | PASS |

## Known gaps and rollout

- The Apple Pay Shortcut must be updated to send its transaction-derived `idempotencyKey`; until then, the one-minute fallback can merge two identical legacy events in the same minute.
- The Supabase Edge Function must be deployed before the new request field changes production behavior.
- Live deployment verification requires the user's ingest bearer token and is intentionally not performed by unit tests.

## Merge evidence

- RED checkpoint: `d8c1c67`
- GREEN checkpoint: `52a3df6`
- Preserve these commands and outcomes in any squash commit or PR description.
