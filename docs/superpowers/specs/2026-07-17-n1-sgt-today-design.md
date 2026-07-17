# N1 — Pin "today/now" to SGT

**Date:** 2026-07-17
**Status:** Approved (design)
**Backlog item:** N1 (see `docs/PROJECT_IMPROVEMENT_STATUS.md`, N-series)

## Problem

The app's data model is Singapore-time (SGT) local: this is the documented invariant
("All date/budget logic is SGT-local via `shared/sgtDate.ts`", `AGENTS.md`), and the
server/ingest path already stamps entry dates in SGT via `sgtDate.ts`.

The **client**, however, derives "today" / "now" / the current period from device-local
`new Date()`:

- `AddEntry` defaults a new entry's date to `toLocalDateString()` (device-local calendar date).
- `Dashboard`, `History`, `Insights`, `Poker`, `Settings` compute the current month / today /
  recent window from `new Date()` (device-local).
- `dates.ts` `isFutureDateString` clamps against the device-local date.

When the device is not in SGT (owner travelling, or the PWA opened in a browser set to another
zone), the client and the SGT server model disagree. The concrete failure: a manual expense
logged near SGT midnight from a device behind/ahead of SGT is written with the **device-local**
calendar date, landing it in the wrong SGT day/month — inconsistent with every ingested entry.

### What is NOT broken (deliberately out of scope of the fix)

Stored-entry bucketing is already correct and timezone-independent: `entry.date` is a plain
`YYYY-MM-DD` string, and `compute.ts`'s `entriesForMonth` does `parseISO(date).getMonth()`, which
reads the calendar fields straight back. This code is **not** changed.

## Decision

**Always SGT.** "Today", "now", and new-entry dates are always the Singapore calendar date,
regardless of device timezone. This matches the documented invariant and the server/ingest path
exactly, giving one consistent model. (Confirmed with the owner: travelling does not switch the
app to device-local dating.)

## Design

One primitive converts the current instant into the SGT calendar date; every device-local
`new Date()`-as-"now" call site routes through it. `compute.ts` stays **timezone-agnostic** — it
receives an injected `referenceDate`, so the SGT responsibility lives entirely at the screen
boundary. This keeps the domain-math layer free of timezone knowledge.

### New helpers — `src/shared/sgtDate.ts`

```ts
// The SGT YYYY-MM-DD calendar date for an instant (reuses the existing Intl en-CA formatter).
export function sgtTodayString(now: Date = new Date()): string

// A Date whose LOCAL calendar fields equal the SGT calendar date (local-midnight of that day).
// Once a screen's `now` is sgtToday(), everything downstream — getMonth(), date-fns
// startOfWeek/endOfWeek, addDays, toLocalDateString — computes on the correct calendar date
// with no further change.
export function sgtToday(now: Date = new Date()): Date   // = fromLocalDateString(sgtTodayString(now))
```

`sgtToday` depends on `fromLocalDateString` (in `src/dates.ts`). To avoid `shared/` → `dates.ts`
coupling (shared code is also consumed server-side), `sgtToday` constructs the local-midnight Date
inline from the `YYYY-MM-DD` parts rather than importing `dates.ts`.

**Date-granularity only.** `sgtToday()` collapses time-of-day to midnight. Anything needing SGT
*hour* (e.g. meal-time auto-categorization, which already lives in its own shared path) must not
use `sgtToday()`. This is documented in a helper comment.

### Call sites changed

| File | Line(s) | Change |
| --- | --- | --- |
| `src/shared/sgtDate.ts` | — | Add `sgtTodayString`, `sgtToday`. |
| `src/dates.ts` | `isFutureDateString` | Compare against `sgtTodayString()` instead of `toLocalDateString()`. `toLocalDateString` itself stays a pure formatter. |
| `src/screens/AddEntry.tsx` | 28 | `const today = sgtTodayString()`. |
| `src/screens/Dashboard.tsx` | 58 | `const now = sgtToday()` (fixes the derived month/today/recent-window/safe-to-spend at 70,77,78,80,88,89). |
| `src/screens/History.tsx` | 57, 105 | `new Date()` → `sgtToday()` (month-end clamp, `isCurrentMonth`). Calendar-cell formatters at 53/647 are pure and unchanged. |
| `src/screens/Insights.tsx` | 25 | `const now = sgtToday()` (initial selected year/month + `isCurrentMonth`). |
| `src/screens/Poker.tsx` | 37 | `const now = sgtToday()` (`thisMonthPnl`). |
| `src/screens/Settings.tsx` | 62 | `const now = sgtToday()` (clear-this-month count). |
| `src/screens/LogSession.tsx` | 15, 98 | `toLocalDateString()` → `sgtTodayString()` (default date + max). |

**Unchanged (pure formatters of an explicit chosen Date):** `dates.ts` `toLocalDateString`;
`History.tsx:53,647` (`toLocalDateString(new Date(year, month, day))`); `compute.ts`
`referenceDate` defaults — callers inject `sgtToday()`, and leaving the default keeps `compute.ts`
timezone-agnostic.

## Testing (TDD)

1. **Helper unit tests** (`src/shared/sgtDate.test.ts`, extend existing): drive with fixed
   **absolute UTC instants** so results are deterministic regardless of the runner's timezone —
   this is essential because the test suite pins no `TZ` (dev machine is SGT; CI is UTC).
   - `sgtTodayString(new Date('2026-07-31T16:30:00Z'))` → `'2026-08-01'` (UTC+8 crosses midnight).
   - `sgtTodayString(new Date('2026-07-31T15:00:00Z'))` → `'2026-07-31'`.
   - `sgtToday(...)` returns a Date whose `getFullYear/getMonth/getDate` match the SGT date.
2. **Regression:** run the affected screen tests. Because the dev machine is SGT, existing
   expectations should hold locally; the meaningful check is **CI (UTC)**, where SGT "today" now
   differs from the runner's local date. Update any screen test that implicitly assumed
   device-local "now" to assert SGT, and add at least one test that fails under a UTC runner
   before the fix and passes after.
3. Full `npm test`, `npm run lint`, `npx tsc -b`, `npm run build` green.

## Risks

- **Low overall:** additive helpers + mechanical call-site swaps; no storage, schema, or wire
  format change. Existing entries and the server contract are untouched.
- **CI timezone exposure:** the fix changes behavior under a UTC runner (correctly). Watch for
  pre-existing screen tests that only passed because dev-local == SGT; adjust them to the SGT
  expectation rather than weakening the assertion.
- **Time-of-day misuse:** `sgtToday()` is date-only. Mitigated by the helper comment; no current
  call site needs SGT hour.

## Out of scope

- SGT time-of-day primitives (no consumer needs them here).
- Refactoring `compute.ts` to be timezone-aware (deliberately kept agnostic).
- N2 (reactive budget-config context) — separate backlog item.
