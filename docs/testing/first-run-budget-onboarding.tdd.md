# First-run budget onboarding — TDD evidence

**Date:** 2026-07-15

## Source and scope

Journeys were derived from the selected mockups. The welcome screen uses the compact Option A brand bar, while budget entry and confirmation use Option D's envelope/wallet language. The flow is shown only on a genuinely fresh install; existing budgets, cached history, completed onboarding, and direct `?add=true` launches bypass it.

## User journeys

- As a first-time user, I can understand the default monthly plan without an empty decorative header.
- As a first-time user, I can accept the defaults or edit the total and four category targets.
- As a budget setter, I can see the automatic buffer and cannot save targets that exceed the monthly plan.
- As a returning user, I am not forced through onboarding after an app update.
- As a fast-entry user, a direct Add entry launch is never blocked by onboarding.

## RED → GREEN checkpoints

- RED `84c373f`: three App tests failed for the intended missing welcome, envelope editor, and ready/finish behavior.
- GREEN `67225fe`: the same target passed 9/9 tests after first-run gating, persistence, budget saving, and the three screens were implemented.
- Refactor `68b0c27`: added the over-allocation guarantee and moved onboarding JavaScript/CSS behind a lazy boundary after the CSS size gate caught an always-loaded regression. The target passed 10/10 tests and the size gate returned to green.

## Guarantees

| Guarantee | Evidence | Type | Result |
| --- | --- | --- | --- |
| Fresh installs open the compact brand-bar welcome without the tab bar | `src/App.test.tsx` | Integration | PASS |
| Editing the plan saves total, targets, computed Buffer, and the `others` compatibility alias | `src/App.test.tsx` | Integration | PASS |
| Overallocated targets show an error, disable Save, and write no configuration | `src/App.test.tsx` | Integration | PASS |
| Accepting defaults reaches the receipt and finishes into Add entry | `src/App.test.tsx` | Integration | PASS |
| Existing plans and direct Add entry launches bypass onboarding | `src/App.test.tsx` | Integration | PASS |
| Completion is stored in the active user's local namespace | `src/onboarding/onboardingState.ts`, `src/userStorage.ts` | Unit/integration path | PASS |

## Verification

- `npm run test:coverage -- --pool=forks --maxWorkers=1`: 57 files / 486 tests passed; 84.99% statements, 77.2% branches, 83.51% functions, 88.47% lines.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run size`: passed at 136.8 KiB eager JavaScript and 12.0 KiB eager CSS. First-run assets are separate 1.73 KiB JavaScript and 1.23 KiB CSS gzip chunks.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Read-only browser QA at 390×844 traversed Welcome → Your pockets → Ready with no horizontal overflow (`390px` document and client widths). At 320×568 the budget editor remained 320px wide and required only 14px of vertical scrolling.
- The selected Original Dark theme, 44px navigation targets, disabled invalid state, and bottom-thumb primary actions were visually inspected after the lazy-loading refactor.
