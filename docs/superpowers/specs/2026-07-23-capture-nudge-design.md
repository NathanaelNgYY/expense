# Automatic-Capture Nudge Design (U5)

**Date:** 2026-07-23
**Status:** draft
**Product:** Budget Tracker
**Audit item:** U5 (`docs/PRODUCT_AUDIT_2026-07-19.md` §2–3), originally §H1 of `UX_AUDIT_2026-07-10.md`

## Goal

Tell people the app can log their spending for them.

First-run onboarding covers budget setup and stops. Background ingestion — the thing the audit calls
"the only defensible position" the product has — is discoverable solely by wandering into Settings →
Automatic Tracking. Someone can type entries by hand forever and never learn the feature exists.

U5 is one card, shown once, after the third hand-typed entry: *"Stop typing these in — your phone can
log Apple Pay and DBS alerts by itself."*

## Placement

**A Home banner**, in the same slot and shape as the F4 capture-health warning
(`Dashboard.tsx:311`) — opposite tone, identical grammar. Chosen over the alternative of riding the
save toast on the third save, which is more relevant in the moment but lands on the numpad Add flow
the audit explicitly protects ("Explicitly keep: the numpad Add flow (best-in-class)"). Home is also
where saving already returns you, so the card is seen immediately regardless.

Tapping through goes to `#/settings/automatic` — a real address since U1.

## Trigger rules

| Rule | Behaviour |
|---|---|
| Trigger | 3 or more manual entries exist |
| Guard | **Zero automatic captures, ever.** Anyone already set up never sees it. |
| Frequency | Once. Dismissal persists; there is no re-nag. |
| Scope | Personal only — shared budgets have no ingest path. |
| Action | Navigate to Automatic Tracking. Dismiss and "Not now" both close it permanently. |

"Manual" is defined as **not automatic** (`source` is neither `apple-pay` nor `dbs-email`), the exact
inverse of `isAutomaticCapture` in `captureHealth.ts`. This deliberately counts legacy cached entries
that predate the `source` field: they were typed by hand, and treating an absent `source` as "unknown,
so don't count" would hide the card from precisely the long-standing manual users it is for.

### The two capture cards can never collide

The audit's obvious worry — the nudge appearing next to the "your Shortcut may have stopped" warning —
is impossible by construction rather than by an added guard. `getCaptureHealthWarning` returns `null`
below `CAPTURE_HEALTH_MIN_ACTIVE_DAYS` (3) distinct automatic-capture days, so it requires at least
three automatic captures; the nudge requires exactly zero. The conditions are disjoint. This is
asserted as a test rather than defended with a redundant `if`, so that if someone later loosens either
threshold the suite says so.

## Architecture

- **`src/captureNudge.ts`** — pure. `shouldShowCaptureNudge(entries, dismissed)`, plus the manual
  count. No DOM, no storage access, mirroring `captureHealth.ts` next to it.
- **Dismissal** goes through `userStorage` (`getUserStorageItem`/`setUserStorageItem`) under
  `budget_capture_nudge_dismissed`, the same per-user-scoped mechanism `onboardingState.ts` uses, so
  one user dismissing it does not silence it for another on a shared device.
- **Render** in `Dashboard.tsx`, gated on `viewScope === 'personal'` exactly as the capture-health
  warning is, reusing its CSS shape under a `capture-nudge` class with the copper accent instead of
  the warning amber — this is an offer, not an alert.

## Copy

> **Stop typing these in**
> Your phone can log Apple Pay and DBS alerts by itself. Takes about 3 minutes to set up, once.
> `[Set it up]` `[Not now]`

The audit's own line was *"Tired of typing? Set up automatic capture (3 min)."* Rewritten because
"automatic capture" is our internal noun — the user recognises *Apple Pay* and *DBS alerts*. The
payoff leads; the cost ("3 minutes, once") is stated plainly rather than hidden, because the ask is
genuinely a multi-step Shortcuts setup and overselling it would burn the one chance we get.

## Non-goals

- **No repeat.** One dismissal is final. A nudge that returns is an ad.
- **No blocking modal.** The uncategorised-review dialog already owns app-entry interruption; a second
  one would make opening the app feel like running a gauntlet.
- **No counter beyond 3.** The threshold is a judgement call from the audit, not a tuned number, and
  there is no analytics to tune it with (T4: keep it that way).

## Testing

- `captureNudge.test.ts` — threshold at 2 vs 3, legacy `source`-less entries count as manual, any
  automatic capture suppresses it forever, dismissal suppresses it, empty input.
- A disjointness test asserting no entry set can satisfy both `shouldShowCaptureNudge` and
  `getCaptureHealthWarning`.
- `Dashboard` render test — card appears on the third manual entry, routes to Automatic Tracking,
  dismissal persists across a remount, and it is absent under `viewScope === 'shared'`.
- E2E — the card is reachable, and its CTA lands on `#/settings/automatic`.
- Bundle: initial JS is at 145.7 KiB against 146. This adds a small pure module and markup to the
  eager Home path, so it may need another lazy extraction rather than a budget raise.
