# N5 production verification — 2026-07-17

**Status:** Partial — do not close N5 yet
**Production origin:** `https://budget-tracker-sooty-ten.vercel.app`

## Summary

Production audit: **84/100, launchable with caveats.** No new code or deployment blocker was found,
but confidence remains capped because the physical-iPhone ingestion check is outstanding and the
Sentry recurrence check could not be read from the available browser session.

## Verification results

### 1. Physical iPhone Apple Pay capture — pending

The required real-device evidence remains:

- One Lunch-window Apple Pay capture reaches the correct account and category.
- One Dinner-window Apple Pay capture reaches the correct account and category.

This cannot be simulated credibly from the development machine because the verification depends on
the iOS Wallet automation trigger and the owner's installed Shortcut.

### 2. Sentry BUDGET-TRACKER-2 recurrence — blocked

The fix is present in merged commit `561452f` (PR #21), committed on 2026-07-17 at 20:32 SGT. It
wraps all lazy routes with bounded retry, a single guarded hard reload for stale chunks, and error-
boundary fallback for persistent failures.

At approximately 22:05 SGT, both the Sentry issues UI and the organization issues API were attempted
for organization `nee-x7`, project `budget-tracker`, query `BUDGET-TRACKER-2`. The available browser
blocked both Sentry surfaces with `ERR_BLOCKED_BY_CLIENT` / an ad-blocking notice. No claim is made
about the issue's latest event or recurrence status.

To close this item, open Sentry in a browser where the site is allowed and record:

- `lastSeen` for BUDGET-TRACKER-2;
- event count after the PR #21 production deployment;
- whether any post-fix event is the same stale lazy-chunk failure signature.

### 3. CrUX field Core Web Vitals — checked, no field data

Google PageSpeed Insights was run against the production origin on 2026-07-17 at 22:05 SGT. The
real-user section reported **No Data**, so the origin still lacks enough Chrome UX Report traffic to
publish field LCP, CLS, or INP. This is a valid availability result, not a passing field-vitals result.

The same report produced a mobile Lighthouse lab snapshot:

| Metric | Result |
| --- | ---: |
| Performance | 98 |
| FCP | 1.8 s |
| LCP | 1.8 s |
| TBT | 0 ms |
| CLS | 0 |
| Speed Index | 2.8 s |

Report: `https://pagespeed.web.dev/analysis/https-budget-tracker-sooty-ten-vercel-app/m100obizrt?form_factor=mobile`

These lab results are healthy but do not replace the requested field evidence. M14 should remain
closed unless future CrUX data becomes available and shows sustained LCP above 2.5s or INP above
200ms, matching the existing decision threshold.

## Evidence checked

- `docs/SENTRY.md`
- PR #21 merge commit `561452f`
- `src/lazyWithRetry.ts` and its tests
- Production PageSpeed Insights report linked above
- Existing three-run lab baseline in `docs/testing/m14-production-cwv-2026-07-15.md`

## N5 completion checklist

- [ ] Physical iPhone Lunch capture verified.
- [ ] Physical iPhone Dinner capture verified.
- [ ] Sentry BUDGET-TRACKER-2 post-fix recurrence status verified.
- [x] CrUX availability checked — No Data as of 2026-07-17.
- [x] Fresh mobile lab snapshot recorded separately from field evidence.
