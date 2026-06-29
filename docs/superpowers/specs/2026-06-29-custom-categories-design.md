# Custom Categories — Design Spec

**Date:** 2026-06-29
**Status:** Approved for planning
**Topic:** Let the user add and remove their own budget categories alongside the built-in five.

## Goal

Allow the user to:
- Add their own categories with a custom budget allocation, **or** leave the budget empty (tracked but no target).
- Remove categories they added.

The five built-in categories (`lunch`, `transport`, `savings`, `investments`, `others`/buffer) and their special behaviors stay fixed and untouched. Custom categories are **purely additive spend categories**.

## Key decisions (from brainstorming)

1. **Scope:** Built-ins are fixed (not renamable/removable). Users add/remove only their own custom categories.
2. **Budget behavior:** A custom category behaves like `lunch`/`transport` — a *spend* category. Its budget adds to the monthly spendable budget, it counts in the spend forecast & "safe today", and overspend spills into the buffer. Customs are never "commitment" type.
3. **No-budget categories:** Allowed. Spending in them still counts toward the forecast & "safe today" ("money out is money out"); they just have no target/progress bar.
4. **Removal:** Blocked while the category is still in use. If any entry (this month or in history) is tagged to it, removal is refused with a message telling the user to re-tag or delete those entries first. Only a zero-entry category can be removed.
5. **Icons:** User picks from a curated set of ~12–16 lucide icons when creating a category.

## Data model

New type (in `src/types.ts`):

```ts
export interface CustomCategory {
  id: string            // stable slug, e.g. "cat_groceries_x7" — stored as entry.category
  label: string         // display name, e.g. "Groceries"
  budget: number | null // null = no target ("leave it empty")
  icon: string          // a lucide icon name from the curated allow-list
}
```

**Type change:** `Entry.category` becomes `string | null` (was the `Category` union). The `Category` union, `CATEGORIES`, and `CATEGORY_LABELS` remain as the **built-in** set. Existing `entry.category === 'lunch'` comparisons keep working unchanged (string compare).

A curated icon allow-list (icon name → lucide component) lives alongside `BudgetIcon`, e.g. `ShoppingBag`, `Coffee`, `Gift`, `Heart`, `Home`, `Car`, `Plane`, `Dumbbell`, `Gamepad2`, `Shirt`, `Stethoscope`, `BookOpen`, `Phone`, `Zap`, `PawPrint`, `CircleDollarSign`. The exact set is finalized during implementation.

## Persistence

New localStorage key `budget_custom_categories`, with `getCustomCategories()` / `saveCustomCategories(cats)` in `src/storage.ts`, mirroring the existing `budget_config` pattern (local-only). Entries stay server-synced and simply carry the category-id string. No server/Netlify changes required.

## Compute seam

`compute.ts` currently hardcodes `CATEGORIES` and reads `config[c]`. Introduce:

- `allCategoryIds(custom: CustomCategory[]): string[]` → built-in ids followed by custom ids (drives display ordering everywhere).
- A budget lookup: `budgetFor(id, config, custom)` and/or a `Record<string, number>` budget map → built-in budgets from `config`, custom budgets from `cat.budget ?? 0`.

Functions that enumerate categories take the id list instead of the global `CATEGORIES`:
- `monthlySpendByCategory`, `categoryDeficits` (their return types widen to `Record<string, number>`).
- `monthComparison` and the Insights panel stay **built-in-only** — `InsightsSection` indexes `CATEGORY_LABELS` directly, so surfacing custom ids there would break types and render `undefined` labels. Insights over custom categories is out of scope.
- `bufferRemaining` already sums overages across all non-`others` deficits, so **custom spend overages spill into the buffer automatically** once customs appear in the deficits map. No buffer-formula change.
- Commitment exclusion stays limited to `savings`/`investments`, so customs always count in the spend forecast.

Dashboard's `spendableBudget` becomes `lunch + transport + buffer + (sum of custom budgets)`. A budgeted custom raises "safe today"; a no-budget custom adds 0, so its spend still reduces "safe today" (decision 3).

Compute functions keep back-compatible defaults (built-ins only) where reasonable so existing tests/call sites stay green until updated.

## UI

### Settings — new "Categories" section
- Sits under the existing **Monthly Budgets** block.
- Built-in budget rows unchanged.
- Custom categories listed below, each like a budget row: icon + label + budget input + a small **remove (trash)** button.
- **"Add category"** control opens an inline mini-form: name field, optional budget field (blank = no target), and an icon picker grid. On add: generate a stable `id` (name slug + short random suffix to avoid collisions), append to the list.
- Persistence folds into the existing **Save Budgets** action — one save writes both `budget_config` and `budget_custom_categories`.
- The bottom **total / mismatch warning** now includes budgeted custom categories in the sum.

### Removal guard
The trash button checks how many entries across **all** entries have `entry.category === id`. If > 0, block and show e.g. *"3 entries use this category. Re-tag or delete them first."* Zero-entry categories remove immediately.

### Add Entry
Chips iterate `[...built-ins, ...customs]`; custom chips show their chosen icon and label and are selectable like the rest.

### Dashboard
Category cards iterate the same combined list:
- Custom **with** budget → normal progress card (green spend styling; overage → "Taken from buffer").
- Custom **without** budget → card shows spend with no progress bar and a neutral label (no "left/over"), reusing the existing `config[cat] > 0 ? … : …` guard.

### BudgetIcon
Gains a lookup: built-in names keep their hardcoded icons; otherwise resolve the custom category's stored icon name from the curated map, falling back to the `$` circle (`CircleDollarSign`).

## Edge cases
- Duplicate labels allowed (ids differ).
- Editing a custom budget/label/icon updates in place.
- No orphaned entries possible: removal is blocked while in use.
- CSV import/export unaffected — category is already a free string in CSV.
- `guessCategory` / keyword auto-categorization stays **built-in only**; auto-imported entries for custom categories fall to Uncategorized for manual tagging. (Acceptable; out of scope.)

## Testing (TDD)
- `storage`: get/save custom categories round-trip; empty/corrupt fallback.
- `compute`: custom budgets feed `spendableBudget`, `categoryDeficits`, and buffer spill; no-budget custom counts as spend but has no target; ordering via `allCategoryIds`.
- Removal guard: blocked when entries exist, allowed at zero.
- `Settings`: add a category (with and without budget), validation, remove allowed/blocked, total includes customs.
- `AddEntry` + `Dashboard`: render and select a custom category end-to-end (budgeted and no-budget variants).

## Out of scope
- Renaming/removing built-ins.
- Commitment-type custom categories.
- Server-side category definitions / multi-device sync of category list (stays local like all budget config).
- Auto-categorization (keyword/history) of custom categories.
- Insights / month-comparison highlighting of custom categories (stays built-in-only).
