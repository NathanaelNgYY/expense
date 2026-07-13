# Ingest idempotency TDD evidence

**Date:** 2026-07-13
**Source:** C3 in the 2026-07-13 project improvement report; no separate plan file.

## User journeys

- As an Apple Pay user, I want my original four-field Shortcut to suppress quick duplicate firings without inventing an unstable transaction ID.
- As an Apple Pay user, I do not want a merchant-derived Shortcut value to suppress later real purchases at that merchant.
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

## Shortcut Input correction

- Invalidated assumption: iOS Wallet automations do not expose a documented stable transaction identifier; converting the whole `Transaction` input to text can produce the merchant name.
- RED checkpoint: `29cedc7 test: reproduce merchant-name idempotency collision`.
- RED result: 2 intended failures and 27 passes; a later purchase at the same merchant was incorrectly reported as `duplicate`.
- GREEN checkpoint: `f751b16 fix: ignore merchant-derived Apple Pay keys`.
- GREEN result: 4 focused files and 41 tests passed.
- User-facing contract: the standard Apple Pay Shortcut keeps its original `sourceKind`, `currency`, `merchant`, and `amount` fields and omits `idempotencyKey`.

## Coverage

- Command: `npm exec vitest -- run supabase/functions/ingest/handler.test.ts netlify/functions/lib/ingestHandler.test.ts src/shared/entry.test.ts src/shared/dedupe.test.ts --coverage` with the four changed modules included.
- Result after the Shortcut correction: 4 files and 41 tests passed; 98.64% statements, 93.1% branches, 100% functions, and 98.55% lines.

## Full verification

- `npm test`: 51 files and 438 tests passed after the Shortcut correction.
- `npm run lint`: passed with no errors.
- `npm run build`: TypeScript and the Vite production build passed.

## Guarantees

| Guarantee | Test target | Type | Result |
|---|---|---|---|
| Optional stable event keys ignore changing run timestamps | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Distinct trusted event keys preserve equal same-minute purchases | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Standard four-field Apple Pay payloads dedupe within one minute | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Merchant-derived Shortcut values cannot suppress later purchases | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Repeated DBS raw email bodies dedupe across timestamps | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| Oversized external keys are rejected before storage | `supabase/functions/ingest/handler.test.ts` | boundary | PASS |
| Frozen Netlify fallback follows the same contract | `netlify/functions/lib/ingestHandler.test.ts` | integration | PASS |

## Known gaps and rollout

- Apple Wallet automations expose no documented stable transaction identifier. The one-minute fallback can merge two identical real purchases in the same minute, and a retry crossing a minute boundary can be saved twice.
- `idempotencyKey` is reserved for non-Shortcuts callers that possess a genuinely stable, unique external event identifier.
- The Supabase Edge Function must be deployed before the corrected dedupe behavior reaches production.
- Live deployment verification requires the user's ingest bearer token and is intentionally not performed by unit tests.

## Merge evidence

- RED checkpoint: `d8c1c67`
- GREEN checkpoint: `52a3df6`
- Correction RED checkpoint: `29cedc7`
- Correction GREEN checkpoint: `f751b16`
- Preserve these commands and outcomes in any squash commit or PR description.
