# H4–H5 weekly History correctness and accessibility — TDD evidence

**Date:** 2026-07-14  
**Branch:** `main`

## Reconstructed intent

The live status document retained the H4–H5 identifiers but not their definitions. The authoritative July product audit identifies the two remaining findings between completed H1–H3 and H6:

- `monthlyIncome / 4` makes History's weekly target inaccurate in most months;
- chart values need accessible text summaries.

This mapping was treated as an explicit implementation assumption and kept narrow. Pay-cycle budgeting, recurring bills, and visual redesign remain out of scope.

## User journeys and acceptance criteria

- As a user reviewing a month, I want its weekly targets to allocate exactly the monthly total so partial boundary weeks do not distort my pace.
- As a user reviewing a boundary week, I want only transactions from the selected month included.
- As a screen-reader user, I want each weekly chart to announce total and lunch spend against their targets.

| Criterion | Observable guarantee | Verification |
| --- | --- | --- |
| AC-001 | A boundary week's target is prorated by the selected-month days it contains, and all displayed week targets sum to the monthly target. | `src/compute.test.ts` |
| AC-002 | The first/last week row excludes entries from adjacent months. | `src/screens/History.test.tsx` |
| AC-003 | Each weekly group has an accessible description with exact total and lunch spend/target values. | `src/screens/History.test.tsx`, Playwright Axe suite |

## RED/GREEN report

- RED: `npm test -- src/compute.test.ts src/screens/History.test.tsx` ran 65 tests; three intended failures showed that `weeklyBudgetTarget` did not exist, April spend leaked into May's first row, and the row had no accessible description.
- GREEN: the same command passed 65/65 tests after implementing prorated targets, selected-month scoping, and an `aria-describedby` summary.
- Checkpoints: `d650496 test: reproduce H4-H5 weekly history defects`; `d118ffd fix: correct and describe weekly history targets`.

## Full verification

- `npm run test:coverage`: 53 files and 460 tests passed; 84.59% statements, 76.94% branches, 83.14% functions, and 88.23% lines.
- `npm run test:e2e`: 7/7 mobile Chromium journeys and Axe WCAG A/AA checks passed. Expected offline Supabase messages appeared because the E2E environment blocks backend traffic.
- `npm run lint`: passed with no reported errors.
- `npm run build && npm run size`: passed; initial JavaScript is 137.4 KiB gzip against the 143 KiB budget, and CSS is 11.2 KiB against 12 KiB.
- `npm run typecheck:functions`: passed for all three Deno ingest files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Secret-pattern scan across `src`, `scripts`, and `supabase`: no matches.

## Deployment

- Release `7e7634191cab617e092537c313644afce63b8383` built successfully on Vercel and was aliased to `https://budget-tracker-sooty-ten.vercel.app`.
- The live HTML and entry asset returned HTTP 200; the corresponding public source-map URL returned 404.
- A physical-iPhone VoiceOver walkthrough remains the final manual check because desktop automation cannot reproduce Safari's spoken output exactly.
