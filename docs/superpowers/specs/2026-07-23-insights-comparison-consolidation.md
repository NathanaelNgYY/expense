# Insights Comparison Consolidation Design

**Date:** 2026-07-23
**Status:** draft
**Product:** Budget Tracker
**Follows:** `2026-07-23-trends-design.md` (F6). This is the cleanup F6 should have included.

## The problem F6 created

After F6, Insights printed the same month-over-month figure **three times**:

1. the Month Review prose card — "Down S$62.40 vs last month."
2. a `vs last month` insight row directly beneath it — `-S$62.40`
3. the "What Changed" card directly beneath that — "Vs Jun / −S$62.40"

and it printed **two per-category delta lists** a scroll apart:

- "What Changed" — every one of the five built-in categories, against last month
- "Category trends" (F6) — every category with spend, against its six-month average

The two lists differ only in a baseline neither of them named. Rows that look identical but mean
different things are worse than either list alone: a reader who cannot tell which one they are
looking at has to distrust both. F6 added the second list without noticing the first.

## The fix

**One per-category list, with its baseline named above it and switchable.**

- New `components/CategoryDeltas.tsx` owns the single list. It renders after the Trends chart.
- The Trends chart keeps the chart and its four stat rows; its category list is gone.
- "What Changed" keeps its headline card and the two superlative rows (biggest increase, best
  improvement) — those are summaries, not a list, and they answer a different question.
- The duplicated `vs last month` insight row is deleted. The prose card states it in words and the
  What Changed card states it with both totals for context; a third bare copy earns nothing.

### Why a switch and not just the better baseline

The tempting simplification is to drop "vs last month" entirely, since a six-month baseline is
strictly more informative. It is not available strictly more often, though: `monthComparison` works
with a single prior month, while the six-month average needs two. Deleting it would leave a user in
their second month with no comparison at all — a regression for exactly the people with the least
data.

The two also answer genuinely different questions. Month-over-month is the feedback loop ("I cut
back this month, did it show?"); the six-month average is the trend ("is this month normal for me?").
Both are worth reaching, so the switch is the honest design and the caption is what makes it safe.

### `MIN_AVERAGE_BASELINE_MONTHS`

With **one** baseline month, "your six-month average" and "last month" are arithmetically the same
number. Offering both would put one figure behind two labels — precisely the confusion this whole
change exists to remove — so the average option only appears from two baseline months onward. Below
that there is one baseline, no switch, and the caption still names it.

This was found by a test that asserted the switch was absent and failed because it was present. The
rule is now `spendingTrend.baselineMonths.length >= MIN_AVERAGE_BASELINE_MONTHS`, asserted directly.

### Baseline availability is derived, never stored

Which baselines exist changes as you page through months. The chosen baseline is therefore derived
each render from a *preference*: the stored preference wins while it remains available, and the
component falls back rather than blanking when it does not. Paging from July (both available) back to
June (only "vs May") keeps the list rendered and re-captions it.

## Compute

`spendingTrend` gains the previous-month baseline alongside the average it already had:
`previousMonth`, plus `previous` / `previousDelta` per category, and `baselineMonths` so callers can
apply the rule above. A previous month that was never logged is not a baseline — the same rule
`monthComparison` already applied before it would compare anything.

This also closes a real gap: **`monthComparison` only ever covered the five built-in categories**, so
custom categories had no month-over-month delta anywhere in the app. The consolidated list gives them
one in both modes.

## Accessibility

The switch is the app's existing `.scope-switch` (`aria-pressed`, 44px targets, theme tokens) — the
same control as the Add-entry Expense/Refund toggle, so no new pattern and no new CSS. The caption is
real text, not a tooltip or an inference from the pressed state.

## Tests

- `spendingTrend.test.ts` — previous-month baseline, its absence when the prior month is unlogged or
  does not exist, custom categories covered, running month compared to the last complete one.
- `CategoryDeltas.test.tsx` — one row per spent category, the caption naming each baseline, deltas
  recomputed on switch, no switch when only one baseline exists, fallback when the preferred baseline
  disappears, `aria-pressed` tracking.
- `journeys.spec.ts` — the switch rewrites the one list in the browser rather than scrolling to a
  second one.
