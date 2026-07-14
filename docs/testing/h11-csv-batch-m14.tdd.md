# H11 batch CSV imports and M14 reassessment — TDD evidence

**Date:** 2026-07-14  
**Branch:** `main`

## Source and user journeys

Journeys were derived during this TDD run; no implementation plan file was supplied.

- As a user importing many CSV transactions, I want the entire file validated and deduplicated before persistence so a bad or repeated row cannot cause a partial or duplicate import.
- As a user importing a valid CSV, I want one bulk database operation and one local refresh so import cost does not grow into repeated synchronization work per row.
- As a maintainer, I want the initial-bundle gate to count eager module preloads so M14 decisions use the payload a first-time visitor actually downloads.

## Task report

### H11 — validate, deduplicate, batch, refresh once

- RED: `npm test -- src/csvEntries.test.ts src/EntriesContext.test.tsx` executed 26 tests; two intended failures showed that repeated in-file ids were imported twice and `importEntries` did not exist.
- GREEN: `npm test -- src/csvEntries.test.ts src/EntriesContext.test.tsx src/screens/settings/DataSettings.test.tsx` passed 33/33 tests.
- Result: `DataSettings` parses the complete file, `mergeImportedEntries` removes existing and in-file duplicate ids, and `EntriesContext.importEntries` makes one `bulkUpsertEntries` call followed by one `refresh` call.

### M14 — count the actual eager payload

- RED: `npm test -- scripts/bundle-size.test.ts` failed at import because no HTML-based initial-asset discovery existed.
- GREEN: the same command passed 2/2 tests after adding `initialAssetNames` and wiring the size checker to built `index.html`.
- Measurement: `npm run size` passed at 164.2 KiB gzip initial JavaScript and 11.2 KiB gzip CSS. Initial JavaScript consists of the entry file plus eager date-format and Supabase module preloads; lazy route chunks are excluded.
- Decision: M14 remains open for reduction. Supabase stays eager because identity resolution and entry synchronization start at launch; future work should first target optional dependencies on the entry path.

## Test specification

| # | What is guaranteed | Test file or command | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Existing ids and repeated ids within one CSV are skipped before persistence | `src/csvEntries.test.ts` | Unit | PASS |
| 2 | A validated CSV batch invokes one bulk upsert and one context refresh | `src/EntriesContext.test.tsx` | Integration | PASS |
| 3 | Settings imports only new rows and reports the imported count in place | `src/screens/settings/DataSettings.test.tsx` | Component integration | PASS |
| 4 | Entry scripts and eager module preloads are all counted, while lazy chunks are excluded | `scripts/bundle-size.test.ts` | Unit | PASS |
| 5 | The current production bundle stays within the corrected eager-payload budgets | `npm run build && npm run size` | Build integration | PASS |

## Full verification and coverage

- `npm run test:coverage`: 53 files and 457 tests passed; 84.61% statements, 77.03% branches, 83.21% functions, and 88.23% lines.
- `npm run lint`: passed with no reported errors.
- `npm run build`: passed; Vite generated the PWA and lazy route chunks.
- `npm run typecheck:functions`: passed for all three Deno ingest files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Secret-pattern scan across `src`, `scripts`, and `supabase`: no matches.

No browser E2E was added: batching and call cardinality are observable at the context/API boundary, while the existing component integration covers the user-visible CSV import result without contacting Supabase.

## Merge evidence

- RED checkpoint: `ccd1c26 test: add H11 batch CSV import reproducer`
- GREEN checkpoint: `f6a8bf4 perf: batch CSV entry imports`
- RED checkpoint: `e4fb317 test: cover eager bundle preload accounting`
- GREEN checkpoint: `c30e2b4 build: measure eager module preloads in bundle budget`
