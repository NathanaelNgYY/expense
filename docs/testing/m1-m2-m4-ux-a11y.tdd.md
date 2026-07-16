# M1 + M2 + M4 — lazy-load fallback, in-app confirm dialog, amount announcement — TDD evidence

## Source and journeys

Journeys were derived from M1, M2, and M4 of the July 2026 production/audit review, batched per
`docs/superpowers/specs/2026-07-16-m1-m2-m4-ux-a11y-design.md` because they are small, related
perceived-quality and accessibility fixes, all client-only:

- As a user on a slow connection, switching tabs or completing first-run onboarding shows a
  themed loading indicator instead of a blank screen, without a spinner flash on fast connections.
- As a user about to lose data (month reset, unsaved budget edits, deleting or leaving a shared
  budget), I see an in-app, iOS-styled confirmation with Cancel focused by default, and Esc/backdrop
  tap/Cancel all safely decline.
- As a screen-reader user entering an amount on the numpad, I am not re-read the full amount on
  every keypress; I hear it once, after I pause typing.

## RED and GREEN

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED (M1) | `npx vitest run src/components/LazyFallback.test.tsx` | Expected failure | 1 failed: `Failed to resolve import "./LazyFallback"` — component did not exist yet. Commit `c918754` (pre-Task-1 base). |
| GREEN (M1) | `npx vitest run src/components/LazyFallback.test.tsx` | PASS | 4 passed (initial invisibility, delayed visibility, unmount cleanup, Suspense integration). Commit `d42c1ef`. |
| RED (M2 core) | `npx vitest run src/components/ConfirmDialog.test.tsx` | Expected failure | `Failed to resolve import "./ConfirmDialog"` — component did not exist yet. |
| GREEN (M2 core) | `npx vitest run src/components/ConfirmDialog.test.tsx` | PASS | 8 passed after implementation with a jsdom `<dialog>`/`showModal()` polyfill added to `src/test-setup.ts` (jsdom does not implement these); a 9th test (concurrent-call guard) added after a review found the first `confirm()` promise could be orphaned by a second call before the first settled. Commits `114536d`, `6fa7262`, `a9aa20d`. |
| RED (M2 — Settings month reset) | `npx vitest run src/screens/Settings.test.tsx` | Expected failure | 3 failed / 9 passed (12): the 3 tests updated to expect the in-app dialog timed out on `findByRole('dialog')` since `Settings.tsx` still called native `confirm()`. Commit `a9aa20d` (pre-migration). |
| GREEN (M2 — Settings month reset) | `npx vitest run src/screens/Settings.test.tsx` | PASS | 12 passed. Commit `751b08b`. |
| RED (M2 — BudgetSettings unsaved guard) | `npx vitest run src/screens/settings/BudgetSettings.test.tsx` | Expected failure | 3 failed / 15 passed (18): the migrated guard tests timed out on the dialog/Cancel button, since `handleBack` still called native `confirm()`. |
| GREEN (M2 — BudgetSettings unsaved guard) | `npx vitest run src/screens/settings/BudgetSettings.test.tsx` | PASS | 18 passed. Commit `95d1c33`. |
| RED (M2 — shared-budget delete/leave) | `npx vitest run src/sharedBudgets/OwnerTools.test.tsx src/sharedBudgets/BudgetDetail.test.tsx` | Expected failure | 2 failed / 11 passed (13): `findByRole('button', { name: 'Cancel' })` timed out — both components still called native `confirm()`. |
| GREEN (M2 — shared-budget delete/leave) | `npx vitest run src/sharedBudgets/` | PASS | 9 files, 50 tests passed. Commit `aec1549`. Zero `window.confirm`/native `confirm(...)` call sites remain in `src/` outside `ConfirmDialog.tsx`'s own doc comment and tests (verified by grep sweep). |
| RED (M4) | `npx vitest run src/screens/AddEntry.test.tsx` | Expected failure | 3 failed / 13 passed (16): no live region existed yet (`getByRole('status')` found nothing) and the visual amount display still carried `aria-live="polite"`. |
| GREEN (M4, first pass) | `npx vitest run src/screens/AddEntry.test.tsx` | Partial | 1 failed / 15 passed (16): the 3 new debounce tests passed; one pre-existing test asserting `aria-live="polite"` on the visual display failed, since that attribute was the one this task removed. |
| GREEN (M4, final) | `npx vitest run src/screens/AddEntry.test.tsx` | PASS | 16 passed after updating the pre-existing assertion to `not.toHaveAttribute('aria-live')`. Commit `fdf407d`. |

## Guarantees

| # | What is guaranteed | Test | Type |
| --- | --- | --- | --- |
| 1 | Lazy Suspense fallback renders nothing for the first 150ms, avoiding a spinner flash on fast loads. | `LazyFallback.test.tsx: renders nothing before the delay elapses` | Component unit |
| 2 | After 150ms, an accessible `role="status"` spinner with a "Loading…" label appears, and static text replaces the spinner under `prefers-reduced-motion`. | `LazyFallback.test.tsx: shows the spinner and status role after the delay` | Component unit |
| 3 | The fallback's timer is cleared on unmount, so it never fires state updates on an unmounted component. | `LazyFallback.test.tsx: clears its timer on unmount` | Component unit |
| 4 | Both App.tsx Suspense boundaries (tab switch, first-run onboarding) show the fallback while their lazy chunk is pending. | `LazyFallback.test.tsx: shows while a lazy-loaded component is pending` | Integration |
| 5 | `useConfirm()` resolves `true` only when the action button is pressed, and `false` on Cancel, Esc, or a backdrop tap. | `ConfirmDialog.test.tsx`: resolve-true/false/Esc/backdrop cases | Component integration |
| 6 | Cancel is focused by default (the safe choice on open). | `ConfirmDialog.test.tsx: focuses Cancel initially` | Component integration |
| 7 | The action button is styled destructive only when `destructive: true` is passed. | `ConfirmDialog.test.tsx: marks the action button destructive when asked` | Component integration |
| 8 | A second `confirm()` call before the first settles resolves the first call's promise `false` rather than orphaning it. | `ConfirmDialog.test.tsx: resolves pending confirm with false when a second confirm is called` | Component integration |
| 9 | `useConfirm()` throws outside a `ConfirmProvider`. | `ConfirmDialog.test.tsx: useConfirm throws without a provider` | Component unit |
| 10 | Settings month reset asks for confirmation via the in-app dialog before deleting current-month entries, and declining makes no changes. | `Settings.test.tsx: resets only the current month after confirming…`, `…keeps the current month when the reset confirmation is declined` | Component integration |
| 11 | Leaving `BudgetSettings` with unsaved changes prompts via the in-app dialog; a clean form never shows a dialog. | `BudgetSettings.test.tsx`: dirty-guard accept/decline/clean cases | Component integration |
| 12 | Deleting a shared budget (owner) and leaving a shared budget (member) both require in-app confirmation before the destructive action runs. | `OwnerTools.test.tsx: deletes the budget only after confirm`, `BudgetDetail.test.tsx: non-owner can leave the budget after confirm` | Component integration |
| 13 | No native `window.confirm`/`confirm()` call sites remain anywhere in `src/` outside `ConfirmDialog.tsx`'s own implementation/doc comments and test files. | Manual grep sweep (`grep -rn "window.confirm\|[^.]confirm(" src`), recorded in Task 5's report | Static sweep |
| 14 | The Add-entry amount display no longer carries `aria-live`, so numpad keypresses do not re-announce the full amount. | `AddEntry.test.tsx: does not mark the visual amount display as a live region` | Component unit |
| 15 | The amount is announced to screen readers exactly once, 1000ms after the last keypress — not on every keypress, and not for intermediate values during rapid input. | `AddEntry.test.tsx: announces the amount once after a typing pause, not per keypress`, `…restarts the debounce on rapid input so intermediate values are never announced` | Component unit (fake timers) |

## Full verification

- `npm test`: 63 files, 520 tests passed (baseline was 61 files / 504 tests; this work added 16 net
  new tests — 4 `LazyFallback` + 9 `ConfirmDialog` + 3 `AddEntry` debounce — with no removals).
- `npm run lint`: clean.
- `npm run build`: `tsc -b && vite build` succeeded with no type errors.
- `npm run size` (initial bundle budget): initial JS 137.5 KiB gzip (budget 143 KiB, ok); CSS 12.3
  KiB gzip. The CSS budget was raised from 12 to 13 KiB as part of this work — see "Bundle-budget
  note" below.
- No new dependencies were added; the ConfirmDialog uses the native `<dialog>` element
  (`showModal()`), needing only a minimal jsdom test-environment polyfill
  (`src/test-setup.ts`), not a runtime library.

### Bundle-budget note

`ConfirmDialog` and `LazyFallback` styles are deliberately loaded in the main chunk (both are used
by every screen via `App.tsx`, not behind a lazy route), per the design spec. The pre-existing CSS
budget (12 KiB gzip) sat exactly at the prior actual (12.0 KiB) with zero headroom, so this
necessary main-chunk CSS addition (+0.3 KiB) tripped the gate. The CSS budget in
`scripts/check-bundle-size.mjs` was raised to 13 KiB — just above the new 12.3 KiB actual — with a
comment recording the rationale, mirroring how the JS budget carries a small deliberate margin
rather than tracking the actual exactly. The JS budget (143 KiB) was not touched and still has 5.5
KiB of headroom.

### Test-infra note

`src/screens/Settings.test.tsx`'s `undoes a month reset with every original id and dedupe key
intact` test had one `waitFor` call widened from a 2000ms to a 5000ms timeout. Running the full
suite (not just this file) surfaced an intermittent timeout there under full-suite parallel worker
contention: the async confirm-dialog round trip (open → click Delete → resolve promise → resume
`handleReset` → remove each entry) adds real render/microtask hops versus the old synchronous
`window.confirm()` mock, occasionally too many for the fixed 2000ms poll window. The file's
hand-rolled `waitFor` helper already supported an optional timeout parameter; widening just this one
call (with a short comment) resolved it — re-verified clean across multiple full-suite reruns.

## Known boundary

`ConfirmDialog` intentionally supports only one pending confirmation at a time; a second `confirm()`
call while one is open resolves the first `false` and replaces it, rather than queuing. This matches
every current call site (all are single, sequential guards) and was a deliberate YAGNI decision
recorded in the design spec, not an oversight.
