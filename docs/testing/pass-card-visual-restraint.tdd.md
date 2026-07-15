# Dashboard pass visual restraint — TDD evidence

**Date:** 2026-07-15

**Source:** Journey and acceptance criteria were derived from the remaining UX-audit item to retire the green `.pass` gradient.

## User journey

As a user glancing at Home, I want personal and shared budget passes to use restrained theme surfaces so the amount and budget state remain the visual focus.

## Acceptance criteria

- The base `.pass` surface uses the existing `--bg-elev` theme token.
- No default or alternate-theme `.pass` rule introduces a gradient.
- Theme-specific pass shape, border, shadow, stacking, and semantic amount colors remain unchanged.

## RED → GREEN

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `npm test -- src/passCardStyle.test.ts` | Expected failure | The new test could not find `background: var(--bg-elev)` because the base and three alternate themes still declared gradients. |
| GREEN | `npm test -- src/passCardStyle.test.ts` | 1 file and 1 test passed | The base pass uses `--bg-elev`, four pass rules are discovered, and none contains `gradient(`. |
| Coverage | `npm run test:coverage` | 60 files and 503 tests passed | 84.50% statements, 77.34% branches, 83.14% functions, and 88.09% lines. Existing enforced thresholds remain satisfied. |
| Mobile E2E | `npm run test:e2e -- --grep "first-run user\|primary screens"` | 2 tests passed | The Home journey succeeds and primary screens retain headings with no automated WCAG A/AA violations. |
| Static verification | `npm run lint` | Passed | ESLint reports no violations. |
| Production verification | `npm run build` | Passed | TypeScript and Vite production build complete successfully. |

## Test specification

| # | What is guaranteed | Test | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Dashboard passes use the theme's elevated surface rather than a hard-coded decorative surface. | `src/passCardStyle.test.ts` | Static regression | PASS |
| 2 | The base and all three alternate-theme pass rules contain no gradient. | `src/passCardStyle.test.ts` | Cross-theme regression | PASS |
| 3 | A user can complete the first-run expense journey through Home after the styling change. | `tests/e2e/journeys.spec.ts` | Browser E2E | PASS |
| 4 | Primary screens retain automated WCAG A/AA compliance. | `tests/e2e/accessibility.spec.ts` | Browser accessibility | PASS |

## Known gaps

The regression verifies the CSS contract and the browser checks cover functionality and accessibility; it does not perform pixel-diff testing because this is an intentional visual change without a committed screenshot baseline.

## Merge evidence

- RED checkpoint: `375b01b test: add regression for flat dashboard passes`
- GREEN checkpoint: `fe23527 fix: flatten dashboard pass surfaces across themes`
