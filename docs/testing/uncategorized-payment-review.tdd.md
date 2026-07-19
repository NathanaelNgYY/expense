# Uncategorized automatic-payment review — TDD evidence

## Source and user journeys

No source plan was provided. The journeys were derived from the requested PWA behavior:

- As an Apple Pay user, I see an obvious review popup when an automatic payment has no category.
- As a user, I can categorize the payment in that popup and teach future captures from the same normalized merchant/brand.
- As a Singapore user, common local F&B Wallet labels are recognized without manual correction.

## RED and GREEN evidence

- RED command: `npm test -- src/components/UncategorizedReviewDialog.test.tsx src/shared/category.test.ts src/api.test.ts supabase/functions/ingest/handler.test.ts`
- RED result: four intended failures — missing popup component, no merchant-preference write, ingest ignoring explicit preferences, and missing Singapore F&B aliases.
- RED checkpoint: `c39f776 test: reproduce automatic payment categorization gaps`
- Focused GREEN command: `npm test -- src/App.test.tsx src/components/UncategorizedReviewDialog.test.tsx src/shared/category.test.ts src/api.test.ts supabase/functions/ingest/handler.test.ts`
- Focused GREEN result: 5 files and 77 tests passed.
- Full GREEN command: `npm test -- --maxWorkers=4`
- Full GREEN result: 71 files and 572 tests passed.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|--------------------|-------------|------|--------|
| 1 | Opening the PWA with an uncategorized automatic capture shows a review dialog | `src/App.test.tsx` | integration | PASS |
| 2 | Choosing a category updates the transaction immediately and removes it from review | `src/App.test.tsx`, `src/components/UncategorizedReviewDialog.test.tsx` | integration/component | PASS |
| 3 | Manual uncategorized entries do not trigger the automatic-payment popup | `src/components/UncategorizedReviewDialog.test.tsx` | component | PASS |
| 4 | Categorizing a merchant persists a normalized per-user merchant rule | `src/api.test.ts` | integration | PASS |
| 5 | Explicit merchant rules override history, food-time defaults, and generic guesses | `supabase/functions/ingest/handler.test.ts` | integration | PASS |
| 6 | Broader Singapore F&B merchant and outlet labels classify as Lunch | `src/shared/category.test.ts` | unit | PASS |

## Other verification

- `npm run build` — PASS (`tsc -b && vite build`).
- `npm run lint` — PASS.
- `npm run test:coverage -- --maxWorkers=4` — PASS: 85.54% statements, 78.21% branches, 84.95% functions, 89.04% lines.
- The repository's existing global branch coverage remains below 80%. The new popup, preference persistence, ingest precedence, and merchant-pack behaviors all have direct tests.
- Local RLS tests were added for `merchant_category_preferences`; they require the local Supabase stack with the new migration applied and are not part of the default Vitest configuration.

## Design note

The official Singapore establishment directory is not used as a client-side lookup table because it includes legal licensees, manufacturers, supermarkets, and other names that often differ from Apple Wallet labels. The implementation combines a curated high-confidence Wallet-label pack with user-owned learned rules, avoiding a large stale bundle and unsafe false positives.
