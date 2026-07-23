# Apple Pay Shortcut onboarding — TDD evidence

**Date:** 2026-07-23
**Branch:** `feature/apple-pay-shortcut-onboarding`
**Source:** User request to replace manual endpoint/header/body entry with a ready-made Shortcut
installer and in-app token generation.

## User journeys

- As an unlinked signed-in iPhone user, I can generate the private Apple Pay setup value from the
  app instead of using a server script.
- As a setup user, I can copy the complete `Bearer <token>` value and open a ready-made Apple-hosted
  Shortcut without typing a URL, header, or JSON body.
- As a security-conscious user, I never send my private token in the public installer URL.
- As a user whose deployment has no shared Shortcut link yet, I retain a clear manual fallback.
- As a returning user, I can verify the receiving account and last capture after completing
  Apple's device-specific Transaction trigger.

## RED → GREEN

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `npm test -- src/automaticCapture.test.ts src/screens/settings/AutomaticCaptureSettings.test.tsx src/screens/settings/IngestStatusCard.test.tsx` | Expected failure | 3 files ran; 15 failed and 17 passed. Failures were the missing trusted-link helper, installable flow, full setup value, and installer controls. |
| RED checkpoint | `git commit` | PASS | `4f574ec test: define Apple Pay Shortcut onboarding flow` |
| GREEN | Same focused Vitest command | PASS | 3 files and 32 tests passed. |
| GREEN checkpoint | `git commit` | PASS | `06fe26f feat: streamline Apple Pay Shortcut setup` |

## Guarantees

| # | What is guaranteed | Test/evidence | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Only HTTPS `www.icloud.com/shortcuts/<id>` installers are accepted; query and fragment data are removed | `src/automaticCapture.test.ts` | Unit | PASS |
| 2 | Apple Pay leads with setup, Run Immediately, Run Shortcut, and verification while DBS remains an advanced fallback | `src/screens/settings/AutomaticCaptureSettings.test.tsx` | Component | PASS |
| 3 | The copied value includes the required case-sensitive `Bearer ` prefix | `src/screens/settings/IngestStatusCard.test.tsx` | Component | PASS |
| 4 | The public installer `href` never contains the private token | `src/screens/settings/IngestStatusCard.test.tsx` | Component/security | PASS |
| 5 | Clipboard denial leaves the setup value selectable and reports a recovery instruction | `src/screens/settings/IngestStatusCard.test.tsx` | Component/error path | PASS |
| 6 | Automatic Tracking navigation controls retain 44px mobile targets and the screen has no automated WCAG A/AA violations | `tests/e2e/accessibility.spec.ts` | Browser | PASS |

## Full verification

- `npm run test:coverage -- --maxWorkers=1 --no-file-parallelism --testTimeout=20000`:
  **84 files / 816 tests passed**.
  - Statements: **87.19%**
  - Branches: **81.05%**
  - Functions: **86.67%**
  - Lines: **90.21%**
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run size`: passed — initial JS **145.4 KB gzip / 146 KB**, CSS
  **13.2 KB gzip / 14 KB**.
- `npm audit --audit-level=high`: **0 vulnerabilities**.
- Browser accessibility run in installed Chrome: 7/8 parallel checks passed; the full-screen
  sweep exhausted its 30-second suite timeout at its final assertion. The same failing test reran
  alone with a 90-second ceiling and passed in 19 seconds. Supabase requests were intentionally
  offline in this browser test.

## Visual QA and mockups

The real React branch was rendered at **390×844** with a fake signed-in account, intercepted
Supabase responses, and a fake token. No production data or credential was used.

- `docs/screenshots/apple-pay-onboarding-ready.png`
- `docs/screenshots/apple-pay-onboarding-setup-value.png`
- Horizontal overflow: **none** (`scrollWidth = viewportWidth = 390`).
- Browser console errors: **0**.
- No prior image baseline exists, so visual regression is **INCONCLUSIVE**; the screenshots are
  review mockups and future baseline candidates.

## Known device-only gap

Windows cannot publish or validate Apple's signed iCloud Shortcut artifact. Before production:

1. Build and share **Budget Tracker Capture** from an iPhone.
2. Verify on a physical iPhone that Wallet Transaction input passes Amount and Merchant through
   **Run Shortcut**.
3. Set the resulting link as `VITE_APPLE_PAY_SHORTCUT_URL` in Vercel and redeploy.

These steps are intentionally documented in `docs/APPLE_PAY_SHORTCUT_TEMPLATE.md`; the PWA shows a
manual fallback until the installer URL is configured.
