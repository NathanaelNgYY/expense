# Capture-health watchdog — TDD evidence

**Source:** Journey and criteria were derived during this TDD run from the F4 capture-health
watchdog requirement in the user-owned July 19 product audit. That pre-existing untracked audit
was deliberately not added to these task commits.

## User journey

As a user who normally captures transactions through iOS Shortcuts, I want Home to tell me when
automatic entries have gone unexpectedly quiet, so I can repair the automation before my budget
silently under-counts spending.

## Scope and assumptions

- Three distinct automatic-capture days within the 14 days ending at the latest capture establish
  a regular cadence.
- More than seven SGT calendar days without another automatic capture triggers the warning.
- Manual entries do not establish or reset the automatic-capture cadence.
- Push notifications, snoozing/dismissal, token rotation, and server-side health checks are outside
  this client-only task.

## RED → GREEN report

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `npx vitest run src/captureHealth.test.ts --reporter=verbose` | Expected failure | Vite could not resolve the missing `./captureHealth` implementation; no production code existed. |
| GREEN | `npx vitest run src/captureHealth.test.ts src/App.test.tsx --reporter=verbose` | PASS | 2 files / 16 tests passed, including Home → Automatic Tracking navigation. |
| Coverage | `npm run test:coverage` | PASS | 72 files / 577 tests; 85.74% statements, 78.56% branches, 85.04% functions, 89.13% lines. |
| Targeted coverage | `npx vitest run src/captureHealth.test.ts --coverage --coverage.include=src/captureHealth.ts --reporter=dot` | PASS | 95% statements, 92% branches, 100% functions, 96.87% lines. |
| Quality | `npm run lint` | PASS | ESLint completed with no findings. |
| Production build | `npm run build` | PASS | TypeScript and Vite production build completed. |
| Bundle gate | `npm run size` | PASS | Initial JS 139.7 KB gzip / 143 KB; CSS 12.7 KB gzip / 13 KB. |

## Test specification

| # | What is guaranteed | Test target | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | A cadence of three automatic-capture days warns after eight quiet SGT calendar days. | `captureHealth.test.ts` | Unit | PASS |
| 2 | Exactly seven quiet days do not warn. | `captureHealth.test.ts` | Boundary | PASS |
| 3 | Sparse, manual-only, malformed, and future-dated histories do not warn. | `captureHealth.test.ts` | Unit / error path | PASS |
| 4 | Home names the last capture date and exposes a clearly named warning status. | `App.test.tsx` | Integration / accessibility | PASS |
| 5 | The warning action opens Settings → Automatic Tracking directly and keeps Settings selected. | `App.test.tsx` | Integration | PASS |

## Known gaps

The whole-project branch figure remains below the aspirational 80% target because of existing code;
the new pure capture-health module is above 92% branch coverage. Physical iPhone verification of a
real stopped Shortcut remains an operational follow-up, not an automated test.

## Merge evidence

- RED checkpoint: `c54b37c test: reproduce silent automatic capture lapse`
- GREEN checkpoint: `db8571f feat: warn when automatic captures go quiet`
