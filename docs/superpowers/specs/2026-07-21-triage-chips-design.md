# F11 — One-tap uncategorised triage chips

**Date:** 2026-07-21
**Status:** Approved (design)
**Audit item:** F11 in `docs/PRODUCT_AUDIT_2026-07-19.md` (v1.1 roadmap, "The number never lies")

## Product diagnosis

### Who this is for

The owner — a Singapore intern glancing at the Home dashboard many times a day. Background capture
(Apple Pay Wallet trigger, DBS-alert emails) files most transactions automatically, but a capture
with no recognisable merchant lands in the **Uncategorized** bucket with no category. Filing those is
the recurring 10-second daily job.

### Pain

Today the Home Uncategorized bucket is **view-only**. Each row shows date, note, amount, and a delete
button; its own copy says entries are "to categorize in History." To actually file one, the user
leaves Home. The proactive `UncategorizedReviewDialog` modal covers *fresh* auto-captures by
interrupting with an all-categories grid, but it does nothing for the standing backlog of rows
already sitting in the bucket. The learned-merchant data that could rank the likely category
(`categoryFromHistory`, `guessCategory`, the SG merchant pack) is never surfaced at the point of
triage.

### Why now

F11 is a v1.1 "quickest win" (impact ÷ effort) in the 2026-07-19 audit, and the categorise path
(`editEntry(id, { category })`) plus the ranking primitives already exist — this is wiring existing
intelligence to the row where the decision is made, not new infrastructure.

### Ten-star version

Every uncategorised row shows a single, nearly-always-correct chip because merchant normalisation and
learning are strong enough that one tap is all triage ever needs; mis-files are rare and self-correct.
That depends on a richer merchant-normalisation layer (a separate audit item) — out of scope here.

### MVP decision

Add ranked, one-tap category chips **inline on each row of Home's Uncategorized bucket**, keeping the
existing modal unchanged as the proactive interrupt for fresh captures. Two complementary surfaces.

## Scope decisions (from brainstorming)

1. **Surface:** Home Uncategorized-bucket rows only. `UncategorizedReviewDialog` is left as-is;
   History ledger rows are out of scope.
2. **Ranking:** per row, fill up to 3 chips in order — (a) categories this merchant was filed under
   before, (b) the keyword / SG-merchant-pack guess, (c) the user's globally most-used categories to
   fill remaining slots. Guarantees 3 real chips even for a brand-new merchant.
3. **Overflow:** a `⋯` chip **inline-expands the row in place** to show every candidate category as
   chips plus a `✕` to collapse. No modal, no depth-2 (consistent with the two-levels-only settings
   direction).
4. **Feedback:** filing is optimistic; the row leaves the bucket immediately and an **Undo toast**
   (`Filed {merchant} → {label}` · Undo) appears, matching the app's undo-not-confirm pattern.

## Architecture

### Domain logic — `rankCategoriesForMerchant` (`src/shared/category.ts`)

New pure function, colocated with the existing ranking primitives so future ingest-side reuse is
possible (T3 discipline — all new domain math lives in `src/shared/`):

```
rankCategoriesForMerchant(
  entries: Entry[],
  merchant: string | null,
  candidateIds: string[],   // built-in + custom category ids, in preferred display order
  limit = 3
): string[]                 // ordered category ids, length <= limit, deduped
```

Ordering, appending only ids not already chosen and only ids present in `candidateIds`:

1. **History** — categories this merchant was previously filed under, most-frequent first, ties
   broken by most-recent. This generalises `categoryFromHistory` (which returns only the single best)
   into an ordered list; `categoryFromHistory` is refactored to delegate to the shared ranking so the
   two never diverge.
2. **Keyword / merchant pack** — `guessCategory(merchant)`, if not already included.
3. **Global popularity** — the user's overall most-used categories across all categorised entries,
   most-frequent first, to fill remaining slots.
4. **`candidateIds` order** — final fallback when the three sources above still yield fewer than
   `limit` (e.g. a brand-new user with no categorised entries at all): fill remaining slots from
   `candidateIds` in order. Guarantees the "always 3 chips" criterion even at true zero-state.

Deterministic, no network. Retired/renamed custom categories never surface because only `candidateIds`
are returned.

### UI — `UncategorizedTriageChips` (`src/components/UncategorizedTriageChips.tsx`)

Presentational component rendered inside `renderExpenseRow` in `Dashboard.tsx` **only when
`entry.category == null`** (categorised rows unchanged).

Props:

```
entry: Entry
rankedIds: string[]                 // from rankCategoriesForMerchant
categoryOptions: CategoryOption[]   // all candidates (id, label, icon), for the expanded view
onCategorize: (entry: Entry, categoryId: string) => void | Promise<void>
```

- **Collapsed (default):** the `rankedIds` chips (icon + label) followed by a `⋯` overflow chip. The
  first (top-ranked) chip is emphasised with `border-color: var(--primary)`; the rest use the
  established `--separator` / `--fill` / `--text` pattern. Each chip is a `<button>` with a min 44px
  target and an accessible name `Categorize {merchant} as {label}`. The group carries
  `aria-label="Suggested categories"`.
- **Expanded (`⋯` tapped):** a `"Choose a category"` label, every `categoryOptions` entry as a chip,
  and a `✕` to collapse. Expand/collapse is local `useState` — no app-level state, no modal.

The component holds no domain logic — presentation plus the expand toggle only.

### Theming (hard constraint)

Chips use **only** existing theme CSS custom properties — no hardcoded colours — mirroring
`.uncategorized-review__categories button` (`border: 1px solid var(--separator)`,
`background: transparent`, `color: var(--text)`, `:active { background: var(--fill); border-color:
var(--primary) }`) reshaped into pill controls with `--theme-control-radius`. This guarantees correct
rendering across all four themes (original-dark, deep-sea, copper-current, berry-circuit). Styles live
in `src/index.css` alongside the related bucket/row rules.

## Data flow

1. `Dashboard.tsx` derives, per uncategorised row, `rankCategoriesForMerchant(allEntries,
   entry.merchant, candidateIds)`, memoised over the entry list and category configuration.
2. `onCategorize = (entry, id) => editEntry(entry.id, { category: id })` — the **same path the modal
   already uses**. `editEntry` queues optimistically, so the row drops from the bucket and the
   bucket total/count re-derive with no extra state.
3. Because filing sets `entry.category`, it **feeds `categoryFromHistory` automatically** — the next
   same-merchant capture ranks that category higher. No change to ingest, storage, or the modal.

## Feedback and error handling

- **Optimistic file:** existing `editEntry` queue behaviour; row leaves the bucket immediately.
- **Undo toast:** `Filed {merchant} → {label}` with an Undo action that re-files as uncategorised via
  `editEntry(id, { category: null })`. Reuses the app's existing toast/undo surface.
- **Sync failure:** if the queued mutation later rejects, EntriesContext's existing sync-error
  surfacing handles it and the entry reappears in the bucket on reconciliation. No new error path is
  introduced.

## Testing (TDD)

- **Unit** — `src/shared/category.test.ts`: `rankCategoriesForMerchant` history ordering,
  keyword fallback, global-popularity fill, dedupe across sources, `limit` honoured, retired-category
  exclusion, empty/cold-start (no history, no keyword) still returns 3, null/empty merchant. Plus a
  regression test that `categoryFromHistory` still returns the previous single-best after the
  delegation refactor.
- **Component** — `src/components/UncategorizedTriageChips.test.tsx`: renders top-3 + overflow, a chip
  tap calls `onCategorize` with the right id, `⋯` expands to all candidates and `✕` collapses,
  accessible names present, 44px targets.
- **Integration** — `src/screens/Dashboard.test.tsx`: chips render only for uncategorised rows;
  tapping a chip files the entry and it leaves the bucket; Undo restores it to the bucket.
- **E2E** — extend an existing mobile journey in `tests/e2e/` to file an uncategorised entry from Home
  via a chip; the existing Axe/target checks cover the new controls.

## Success criteria

- An uncategorised Home row shows 3 ranked category chips plus a `⋯` overflow; a categorised row shows
  none.
- The first chip is the merchant's learned category when history exists, otherwise the keyword guess,
  otherwise the user's top category.
- A cold-start merchant (no history, no keyword match) still shows 3 real chips.
- Tapping a chip files the entry via `editEntry`, removes it from the bucket, and shows an Undo toast;
  Undo restores it.
- `⋯` expands the row in place to all candidates and collapses via `✕`, never leaving Home.
- Chips render correctly in all four themes with no hardcoded colours.
- Coverage thresholds hold; the shared ranking helper is fully unit-tested.

## Anti-goals

- No change to `UncategorizedReviewDialog`, ingest, storage schema, or sync.
- No chips on History rows.
- No new merchant-normalisation work (tracked separately).
- No modal or new screen for the overflow view — inline expansion only.

## Recommendation

**Go.** Small, high-leverage: it wires existing ranking primitives and the existing categorise path to
the row where triage happens, adds one pure shared function plus one presentational component, needs no
data migration, and stays inside the established theme and undo patterns.
