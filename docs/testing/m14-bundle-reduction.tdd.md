# M14 initial-bundle reduction — TDD evidence

**Date:** 2026-07-14  
**Branch:** `main`

## Source and user journey

The journey was derived during this TDD run; no implementation plan file was supplied.

- As a user opening the PWA on an iPhone, I want optional monitoring code kept off the first-render path so the dashboard can load with less JavaScript while production errors are still captured.

## Profiling and decision

A source-map profiling build attributed the largest optional entry-path dependency to Sentry: approximately 305 KB of unminified Sentry source was present in the 110 KB gzip entry chunk. React, the dashboard, and Supabase were retained eagerly because they render and synchronize the initial screen.

The first dynamic-import experiment reduced eager JavaScript but produced a 155.3 KiB gzip deferred package-namespace chunk. That version was not accepted. A two-export adapter restored tree-shaking: the final deferred monitoring chunk is 28.5 KiB gzip and the PWA precache remains essentially unchanged (714.21 KiB versus 713.85 KiB before M14).

## RED/GREEN report

- RED: `npm test -- src/monitoring.test.ts` ran four tests; two failed because `initializeMonitoring` returned a synchronous boolean and loaded Sentry at module evaluation.
- GREEN: `npm test -- src/monitoring.test.ts src/components/AppErrorBoundary.test.tsx` passed 8/8 tests after the dynamic boundary was implemented.
- Production measurement: `npm run build && npm run size` passed at 137.2 KiB gzip initial JavaScript and 11.2 KiB gzip CSS, down from 164.2 KiB JavaScript. The JavaScript budget was tightened from 172 to 143 KiB.

## Test specification

| # | What is guaranteed | Test file or command | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | An empty DSN does not load or initialize Sentry | `src/monitoring.test.ts` | Unit | PASS |
| 2 | A configured DSN lazily initializes Sentry with PII and tracing disabled | `src/monitoring.test.ts` | Unit | PASS |
| 3 | A React boundary error waits for lazy initialization and preserves its component stack | `src/monitoring.test.ts`, `src/components/AppErrorBoundary.test.tsx` | Integration | PASS |
| 4 | Sentry is absent from eager HTML assets and the corrected initial payload stays below 143 KiB gzip | `npm run build && npm run size` | Build integration | PASS |

## Full verification

- `npm run test:coverage`: 53 files and 457 tests passed; 84.54% statements, 76.88% branches, 83.11% functions, and 88.18% lines.
- `npm run lint`: passed with no reported errors.
- `npm run build`: passed; the deferred monitoring chunk is 28.5 KiB gzip.
- `npm run typecheck:functions`: passed for all three Deno ingest files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Secret-pattern scan across `src`, `scripts`, and `supabase`: no matches.

No browser E2E was added because the error-boundary user experience is unchanged and covered by its existing component integration tests. Production Core Web Vitals on representative iPhones are the next evidence needed before another split.

## Merge evidence

- RED checkpoint: `ec4f7a4 test: require lazy Sentry monitoring boundary`
- GREEN checkpoint: `c2c5aa5 perf: defer Sentry from the initial bundle`
