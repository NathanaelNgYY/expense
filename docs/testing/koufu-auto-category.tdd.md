# Smart Apple Pay categorization — TDD evidence

## Source and journey

No source plan was provided. The journey was derived from a physical iPhone Apple Pay capture:

> As a user, I want Koufu Apple Pay purchases to be categorized as Lunch automatically, so that I do not need to correct each capture in History.

> As a user, I want common Singapore Wallet merchants to categorize themselves without maintaining mappings manually, while ambiguous names remain available for safe review.

The same physical-Wallet review confirmed two existing classifier guarantees: `FairPrice` maps to Others and `Transit Link` maps to Transport.

## Task report

The shared merchant classifier now checks a high-confidence Singapore merchant pack before its broad keyword fallback. Because the Supabase ingest function builds entries with this shared classifier, legal suffixes, case differences, and numbered outlet variants are covered. User correction history remains the first choice supplied to the entry builder.

- RED: `npm test -- src/shared/category.test.ts` ran the new test and failed because `guessCategory('Koufu Pte Ltd')` returned `null` instead of `lunch`.
- GREEN: `npm test -- src/shared/category.test.ts src/shared/entry.test.ts supabase/functions/ingest/handler.test.ts` passed 36 of 36 tests across 3 files.
- RED (merchant pack): the focused category run failed because `YoChi Asia Pte Ltd` returned `null` and `GrabFood` returned `transport`.
- GREEN (merchant pack): the same category, entry-builder, and ingest targets passed 38 of 38 tests across 3 files.
- Full verification: `npm run test:coverage`, `npm run lint`, `npm run build`, `npm run size`, and `npm run typecheck:functions` passed.

## Test specification

| # | What is guaranteed | Test target | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | `Koufu Pte Ltd` is classified as Lunch | `src/shared/category.test.ts: classifies Koufu merchant variants as lunch` | Unit | PASS | Focused GREEN run |
| 2 | Case and numbered outlet variants such as `KOUFU #234` are classified as Lunch | `src/shared/category.test.ts: classifies Koufu merchant variants as lunch` | Unit | PASS | Focused GREEN run |
| 3 | The shared entry builder and Supabase ingest path retain their existing behavior | `src/shared/entry.test.ts`, `supabase/functions/ingest/handler.test.ts` | Unit/integration | PASS | 36 tests passed |
| 4 | The exact Wallet merchant string `FairPrice` is classified as Others | `src/shared/category.test.ts: classifies grocery as others` | Unit | PASS | Focused category run |
| 5 | The exact Wallet merchant string `Transit Link` is classified as Transport | `src/shared/category.test.ts: classifies transport merchants` | Unit | PASS | Focused category run |
| 6 | Wallet labels for YoChi, Guzman y Gomez, Tangled Fresh Pasta, and Kopitiam are classified as Lunch | `src/shared/category.test.ts: classifies common Singapore food merchants from Wallet labels` | Unit | PASS | Focused GREEN run |
| 7 | `GrabFood` is classified as Lunch while `Grab Ride` remains Transport | `src/shared/category.test.ts: distinguishes GrabFood from Grab transport captures` | Unit | PASS | Focused GREEN run |
| 8 | An ambiguous legal name such as `Cray Ventures Private Limited` is not guessed silently | `src/shared/category.test.ts: returns null for unknown merchants` | Unit | PASS | Focused GREEN run |

## Coverage and known gaps

`npm run test:coverage` passed 489 tests in 57 files. Coverage was 85.06% statements, 77.27% branches, 83.58% functions, and 88.52% lines. The repository's pre-existing branch coverage remains below 80%; the merchant-pack behaviors added here have direct regression coverage.

The already-captured S$3.20 entry is not retroactively changed; it can be assigned to Lunch in History. New Koufu captures will use the rule after the Supabase ingest function is deployed.

## Merge evidence

- RED checkpoint: `85c343b test: reproduce missing Koufu auto-category`
- GREEN checkpoint: `38f1101 fix: categorize Koufu captures as lunch`
- Merchant-pack RED checkpoint: `8233242 test: reproduce Singapore merchant categorization gaps`
- Merchant-pack GREEN checkpoint: `fc23211 feat: add Singapore merchant category pack`
