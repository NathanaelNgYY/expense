# Trends & Longitudinal Insights Design (F6)

**Date:** 2026-07-23
**Status:** draft
**Product:** Budget Tracker
**Audit item:** F6 (`docs/PRODUCT_AUDIT_2026-07-19.md` §2), with constraints from U6 (empty-state
discipline), P2 (no charting library), U4 (nothing hard-codes Lunch) and T2 (branch coverage).

## Goal

Make month six of using this app more valuable than month one.

Insights today is a single month in isolation: category breakdown, weekly bars, a Month Review, and a
"What Changed" block that compares against exactly one previous month. Nothing on the screen answers
*is this month normal for me?* — the question that only accumulated history can answer, and the one
reason to keep an app installed past the novelty period.

F6 adds a **Trends** section: six months of totals as bars, the user's own average as the reference
line, leanest/heaviest months, a daily-average comparison that survives unequal month lengths, and a
per-category sparkline row.

## Scope boundaries

- **Read-only and derived.** Nothing here is persisted; all of it is a pure function of entries
  already on the device (`compute.ts`), consistent with "nothing derived is persisted".
- **No charting library.** Bars are CSS-sized `div`s. P2 names a charting dependency as the single
  biggest bundle risk in the pipeline; this section adds zero dependencies and its CSS ships in the
  lazy `insights` chunk (`Trends.css`, imported by the component), not the initial payload.
- **Not a new screen.** Trends lives at the bottom of Insights, after Month Review / What Changed.
  The audit's ranking puts F6 fifth by impact but the settings-redesign direction caps navigation at
  two levels; a sixth tab for one section would be worse than a scroll.

## Window

Six months ending at the **selected** month — Insights already has month navigation, and a trend that
ignored it would contradict the header above it. Viewing March shows October–March.

Leading months with no entries are dropped, so a user two months in sees two bars, not four blanks
followed by two. Interior empty months are kept: a month where nothing was logged is a real zero and
hiding it would misdraw the shape.

### Partial months

Only the current calendar month (per `sgtToday`, SGT like everything else) is partial. Its bar is
drawn striped and labelled "so far", and it is **excluded from every average, and from
leanest/heaviest**. A month that is nine days old is not a low-spend month; letting it into the mean
would make the reference line drift down every time the month rolled over.

### The average is the baseline, not the window mean

`averageMonth` averages the complete months **excluding the selected one**. The line is there to
answer "versus my usual", so the month being judged cannot be part of what it is judged against.
Leanest/heaviest do include the selected month when it is complete — those are superlatives over the
window, not a comparison.

## Suppression (U6)

U6 asks for the same discipline the Month Review already has, from day one: **no bars until two
complete months exist** in the window. Below that the section renders a pending card in the shape of
the existing `month-review-card--pending` — "One more full month and your six-month trend appears
here" — rather than a chart of one bar, which is a chart of nothing.

Two is the floor because a single complete month gives an average identical to itself, a delta of
zero, and a "leanest month" that is also the heaviest.

## Metrics

| Row | Definition | Why not the obvious alternative |
|---|---|---|
| Six-month bars | Net total per month (`entryNetAmount`, so refunds subtract) | — |
| Average month | Mean of complete months, selected excluded | See above |
| vs average | Selected total − average month | — |
| Leanest / heaviest | Min / max complete month in window | — |
| Daily average | Selected month total ÷ days counted (elapsed days when partial, month length when complete), compared against the mean of the other complete months' daily averages | A raw total comparison punishes February and rewards nothing; the daily rate is the only fair cross-month number, and it is what makes the current partial month comparable at all |
| Category sparklines | Per-category six-bar sparkline + delta vs that category's own baseline | Categories with no spend anywhere in the window are omitted — five flat lines is noise. Custom categories are included; **nothing is hard-coded to Lunch** (U4's complaint about the weekly bars applies here in advance) |

## Architecture

- **`spendingTrend.ts`** — one exported entry point, `spendingTrend(entries, year, month,
  referenceDate, custom)`, returning `SpendingTrend`. Pure, SGT-agnostic (it takes the reference
  date), no formatting, no labels — the UI owns month names and money strings as it does everywhere
  else. It always returns an object; the caller gates on `completeMonths.length`, which is also what
  the pending card counts down from. Returning `null` would have thrown that count away.

  The audit says "`compute.ts` needs ~3 new pure functions", and that is where this started — but
  `compute.ts` is on the eager Home path, and measurement said the trend math cost 0.6 KiB gzip of
  initial payload (145.4 → 146.0 against a 146 budget) to ship code only the lazy `insights` chunk
  calls. A sibling module keeps the same domain-math discipline at zero first-paint cost;
  `monthOrder` and `daysElapsedForForecast` are now exported from `compute.ts` and reused rather
  than duplicated.
- **`components/Trends.tsx` + `Trends.css`** — presentational, props-in. Rendered by `Insights.tsx`
  under `InsightsSection`, receiving the already currency-filtered entries the rest of the screen uses.
- Colours come from existing theme tokens (`--primary`, `--fill`, `--text-tertiary`, `--red`,
  `--green`); the section inherits all five themes with no per-theme additions.

## Accessibility

The bar chart is a `role="img"` with an `aria-label` that reads the whole series as a sentence
("Six-month spending: February S$1,040, March S$980, …"), matching how the weekly cards already carry
an `sr-only` summary instead of asking a screen reader to interpret geometry. Category sparklines are
`aria-hidden`; each row's text already states the category, its current figure and its delta, so the
sparkline is decoration for that row rather than its content. Direction is never conveyed by colour
alone — every delta carries a sign and an ▲/▼ glyph with a text label.

## Tests

- `spendingTrend.test.ts` — window trimming, partial-month exclusion, baseline exclusion of the selected
  month, refunds reducing a month's total, unequal month lengths in the daily average, empty-category
  omission, custom categories included, year boundaries (December → January).
- `Trends.test.tsx` — pending card below two complete months (and its countdown wording), bars and
  stats above it, the partial-month "so far" marking, delta sign/label pairing.
