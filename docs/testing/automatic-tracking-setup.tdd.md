# Automatic Tracking setup — TDD evidence

**Date:** 2026-07-15

## Source and scope

Journeys were derived from the prioritised UX roadmap: automatic capture existed, but setup depended on repository documentation. The implemented scope is a guided Settings flow for Apple Pay and DBS transaction-alert automations, safe endpoint copying, Shortcuts navigation, and linked-account/last-capture status refresh.

The initial convenience criterion to copy or mint a raw token in the browser was revised after inspecting the production contract. `ingest_tokens` is service-role-only, stores only SHA-256 hashes, and intentionally has no client grants or policies. The UI therefore displays only `Authorization: Bearer YOUR_INGEST_TOKEN` and links to trusted one-time server provisioning. No token value enters application state, DOM, fixtures, screenshots, or local storage.

## User journeys

- As an iPhone user, I can understand which Apple Pay and DBS events can be captured before opening Shortcuts.
- As a setup user, I can copy the correct public Edge Function endpoint without exposing an ingest credential.
- As a PayNow user, I can see that there is no native trigger and that capture depends on a supported DBS alert email.
- As a returning user, I can refresh the receiving account and last-capture status with immediate inline feedback.
- As an assistive-technology user, I can navigate the setup with named controls and 44px touch targets.

## RED → GREEN checkpoints

- RED `c506a4b`: four target suites failed for the intended missing implementation—two unresolved production modules, a missing fourth Settings row/subscreen, and a missing refresh control.
- GREEN `c6d8281`: the same four suites passed 25 tests after the minimal guided flow was implemented.
- Refactor `75be21b`: mobile visual inspection found excess empty feedback spacing; the gap was removed and the same 25 tests remained green.

## Guarantees

| Guarantee | Evidence | Type | Result |
| --- | --- | --- | --- |
| Supabase URLs derive the exact `/functions/v1/ingest` endpoint; invalid protocols are rejected | `src/automaticCapture.test.ts` | Unit | PASS |
| The screen explains Apple Pay, DBS alerts, and the lack of a native PayNow trigger | `src/screens/settings/AutomaticCaptureSettings.test.tsx` | Component | PASS |
| Endpoint copy succeeds with feedback, fails recoverably, and never renders a real bearer token | `src/screens/settings/AutomaticCaptureSettings.test.tsx` | Component | PASS |
| Settings opens and closes the Automatic Tracking subscreen | `src/screens/Settings.test.tsx` | Integration | PASS |
| Refresh disables immediately, reports “Checking…”, and re-fetches status once | `src/screens/settings/IngestStatusCard.test.tsx` | Component | PASS |
| The setup page has a heading, no Axe WCAG A/AA violations, and 44px Back/copy/refresh targets | `tests/e2e/accessibility.spec.ts` | Browser E2E | PASS |

## Verification

- `npm run lint`: passed.
- `npm run test:coverage`: 56 files / 475 tests passed; 84.76% statements, 77.14% branches, 83.35% functions, 88.39% lines.
- `npm run build` and `npm run size`: passed; eager JavaScript remains 137.4 KiB gzip and CSS is 11.9 KiB gzip against 143/12 KiB budgets.
- `npm run typecheck:functions`: passed.
- `npm run test:e2e`: 7/7 mobile Chromium checks passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Read-only local browser QA at 390×844 found no horizontal overflow; the setup scroll container measured 390px wide by 1,476px tall. A second 375px-wide check also matched document, screen, and viewport widths exactly, with 44px copy and Shortcuts controls. No visual baseline exists, so this is a layout inspection rather than a visual-regression PASS.
