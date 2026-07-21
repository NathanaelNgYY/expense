# F11 — One-tap Triage Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user file an uncategorised transaction from Home's Uncategorized bucket in one tap, using ranked, personalised category chips, with an Undo toast.

**Architecture:** A new pure ranking function in `src/shared/category.ts` produces up to 3 category ids per merchant (history → keyword → global popularity → candidate order). A new presentational component `UncategorizedTriageChips` renders those as chips (plus inline overflow-expand) on each uncategorised row in `Dashboard.tsx`; filing reuses the existing `editEntry(id, { category })` path and shows an Undo toast via a small extension to `SaveToast`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + React Testing Library (component), `createRoot`+`act` (Dashboard integration), Playwright (E2E), lucide-react icons, theme CSS custom properties.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-21-triage-chips-design.md` — the source of truth for behaviour.
- **All new domain math lives in `src/shared/`** (T3). `src/shared/category.ts` is reachable by the Deno ingest Edge Function — add no new imports there beyond what already exists (`../types.ts`, `./singaporeMerchantPack.ts`).
- **Chips use only existing theme CSS custom properties** — no hardcoded colours. Must render correctly in all four themes (original-dark, deep-sea, copper-current, berry-circuit). Mirror `.uncategorized-review__categories button` (`--separator` / `--fill` / `--text` / `--primary`).
- Chips are `<button>` elements with a **min 44px** target and accessible name `Categorize {merchant} as {label}`.
- Filing path is `editEntry(entry.id, { category: categoryId })`; Undo is `editEntry(id, { category: null })`. No new API, storage, ingest, or sync code.
- Leave `UncategorizedReviewDialog`, ingest, storage schema, and History rows untouched. No chips on History.
- TDD: write the failing test first every time. Run `npm test` (Vitest) for unit/component/integration. Commit after each green task.

---

### Task 1: Ranking helper `rankCategoriesForMerchant` (shared domain)

**Files:**
- Modify: `src/shared/category.ts`
- Test: `src/shared/category.test.ts`

**Interfaces:**
- Consumes: existing `normalizeCategoryMerchant`, `guessCategory` from the same file; `Entry` from `../types.ts`.
- Produces:
  - `rankCategoriesForMerchant(entries: Entry[], merchant: string | null, candidateIds: string[], limit?: number): string[]` — ordered, deduped, every id ∈ `candidateIds`, length ≤ `limit` (default 3).
  - `categoryFromHistory(entries: Entry[], merchant: string): string | null` — unchanged public behaviour (now delegates internally).

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/category.test.ts`:

```ts
import { rankCategoriesForMerchant } from './category'

describe('rankCategoriesForMerchant', () => {
  const ids = ['lunch', 'transport', 'others', 'savings', 'investments']
  const e = (over: Partial<Entry>): Entry => ({
    id: `id-${Math.random()}`, amount: 5, category: null, note: '', date: '2026-07-01', ...over,
  })

  it('ranks this merchant\'s own history first, most-frequent then most-recent', () => {
    const entries = [
      e({ merchant: 'Toast Box', category: 'lunch', date: '2026-07-01' }),
      e({ merchant: 'Toast Box', category: 'lunch', date: '2026-07-02' }),
      e({ merchant: 'Toast Box', category: 'others', date: '2026-07-03' }),
    ]
    expect(rankCategoriesForMerchant(entries, 'Toast Box', ids)[0]).toBe('lunch')
  })

  it('falls back to the keyword guess when there is no history', () => {
    expect(rankCategoriesForMerchant([], 'SimplyGo MRT', ids)[0]).toBe('transport')
  })

  it('fills remaining slots with globally most-used categories', () => {
    const entries = [
      e({ merchant: 'A', category: 'savings' }),
      e({ merchant: 'B', category: 'savings' }),
      e({ merchant: 'C', category: 'transport' }),
    ]
    // Unknown merchant, no keyword match -> global popularity: savings (2) then transport (1)
    const ranked = rankCategoriesForMerchant(entries, 'Unknown Shop', ids)
    expect(ranked).toContain('savings')
    expect(ranked.length).toBe(3)
  })

  it('always returns `limit` real chips even at true zero-state', () => {
    const ranked = rankCategoriesForMerchant([], null, ids)
    expect(ranked).toEqual(['lunch', 'transport', 'others'])
  })

  it('never repeats an id and never returns an id outside candidateIds', () => {
    const entries = [e({ merchant: 'Toast Box', category: 'lunch' })]
    const ranked = rankCategoriesForMerchant(entries, 'Toast Box', ['lunch', 'transport'])
    expect(ranked).toEqual(['lunch', 'transport'])
    expect(new Set(ranked).size).toBe(ranked.length)
  })

  it('excludes a retired category id that is no longer a candidate', () => {
    const entries = [e({ merchant: 'Toast Box', category: 'old-custom' })]
    const ranked = rankCategoriesForMerchant(entries, 'Toast Box', ids)
    expect(ranked).not.toContain('old-custom')
  })
})

describe('categoryFromHistory still returns the single best after refactor', () => {
  it('returns the most-frequent category for the merchant', () => {
    const entries: Entry[] = [
      { id: '1', amount: 5, category: 'lunch', note: '', date: '2026-07-01', merchant: 'Toast Box' },
      { id: '2', amount: 5, category: 'lunch', note: '', date: '2026-07-02', merchant: 'Toast Box' },
      { id: '3', amount: 5, category: 'others', note: '', date: '2026-07-03', merchant: 'Toast Box' },
    ]
    expect(categoryFromHistory(entries, 'Toast Box')).toBe('lunch')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/shared/category.test.ts`
Expected: FAIL — `rankCategoriesForMerchant` is not exported.

- [ ] **Step 3: Implement in `src/shared/category.ts`**

Replace the existing `categoryFromHistory` function (lines ~56–86) with this block:

```ts
// Ordered categories this merchant was previously filed under: most-frequent first,
// ties broken by most-recent (a fresh correction outranks an old one).
function historyRankedCategories(entries: Entry[], merchant: string): string[] {
  const target = normalizeCategoryMerchant(merchant)
  if (!target) return []

  const stats = new Map<string, { count: number; recent: string }>()
  for (const entry of entries) {
    if (entry.category == null || !entry.merchant) continue
    if (normalizeCategoryMerchant(entry.merchant) !== target) continue
    const recent = entry.occurredAt ?? entry.date
    const current = stats.get(entry.category)
    if (current) {
      current.count += 1
      if (recent > current.recent) current.recent = recent
    } else {
      stats.set(entry.category, { count: 1, recent })
    }
  }

  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].recent.localeCompare(a[1].recent))
    .map(([category]) => category)
}

// Learn from the user's own history: if they have categorized this same payee before,
// reuse that category. Most frequent wins, ties broken by most recent. Returns null when
// there's nothing to learn from.
export function categoryFromHistory(entries: Entry[], merchant: string): string | null {
  return historyRankedCategories(entries, merchant)[0] ?? null
}

// Categories the user files most often overall (across all categorized entries):
// most-frequent first, ties broken by most-recent.
function globallyPopularCategories(entries: Entry[]): string[] {
  const stats = new Map<string, { count: number; recent: string }>()
  for (const entry of entries) {
    if (entry.category == null) continue
    const recent = entry.occurredAt ?? entry.date
    const current = stats.get(entry.category)
    if (current) {
      current.count += 1
      if (recent > current.recent) current.recent = recent
    } else {
      stats.set(entry.category, { count: 1, recent })
    }
  }

  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].recent.localeCompare(a[1].recent))
    .map(([category]) => category)
}

// Rank up to `limit` category ids to suggest for an uncategorized entry, filling from four
// sources in priority order and never repeating or returning an id outside `candidateIds`:
//   1. this merchant's own history   2. keyword / merchant-pack guess
//   3. the user's globally most-used categories   4. candidateIds order (true zero-state)
export function rankCategoriesForMerchant(
  entries: Entry[],
  merchant: string | null,
  candidateIds: string[],
  limit = 3,
): string[] {
  const result: string[] = []
  const candidateSet = new Set(candidateIds)
  const add = (id: string | null): void => {
    if (id == null || result.length >= limit) return
    if (!candidateSet.has(id) || result.includes(id)) return
    result.push(id)
  }

  if (merchant) {
    for (const id of historyRankedCategories(entries, merchant)) add(id)
    add(guessCategory(merchant))
  }
  for (const id of globallyPopularCategories(entries)) add(id)
  for (const id of candidateIds) add(id)

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/shared/category.test.ts`
Expected: PASS (new suites green; existing `guessCategory`/`normalizeCategoryMerchant`/`categoryFromHistory` tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/shared/category.ts src/shared/category.test.ts
git commit -m "feat: add rankCategoriesForMerchant ranking helper"
```

---

### Task 2: `SaveToast` gains an optional `message` override

**Files:**
- Modify: `src/components/SaveToast.tsx`
- Test: `src/components/SaveToast.test.tsx`

**Interfaces:**
- Produces: `SaveToast` accepts a new optional prop `message?: string`; when present it renders that text instead of the amount-derived text. `entry` becomes optional. `onUndo` / `onDismiss` unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/components/SaveToast.test.tsx`:

```tsx
it('renders a custom message when the message prop is provided', () => {
  render(<SaveToast message="Filed Toast Box → Lunch" onUndo={vi.fn()} onDismiss={vi.fn()} />)
  expect(screen.getByText('Filed Toast Box → Lunch')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy()
})
```

(If `render`, `screen`, `vi` are not yet imported in that file, add: `import { render, screen } from '@testing-library/react'` and include `vi` in the existing `vitest` import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/SaveToast.test.tsx`
Expected: FAIL — `message` prop is not accepted / text not found.

- [ ] **Step 3: Implement the change**

In `src/components/SaveToast.tsx`, change the `Props` interface and the render body:

```tsx
interface Props {
  entry?: ToastEntry
  message?: string
  onUndo: () => void
  onDismiss: () => void
  /** Exposed for tests; the UI never needs to override it. */
  durationMs?: number
}

const DEFAULT_DURATION_MS = 5000

export default function SaveToast({ entry, message, onUndo, onDismiss, durationMs = DEFAULT_DURATION_MS }: Props) {
  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [durationMs, onDismiss])

  if (message == null && entry == null) return null

  return (
    <div className="save-toast" role="status">
      <span className="save-toast__text">
        {message ?? (
          <>
            {entry?.kind === 'refund' ? 'Refunded' : 'Saved'}{' '}
            {entry ? formatMoney(entry.amount, entry.currency ?? 'SGD') : ''}
            {entry?.categoryLabel && <span className="save-toast__cat"> to {entry.categoryLabel}</span>}
          </>
        )}
      </span>
      <button type="button" className="save-toast__undo" onClick={onUndo}>
        <Undo2 size={15} aria-hidden="true" />
        Undo
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/SaveToast.test.tsx`
Expected: PASS (new test green; existing SaveToast tests still green — `entry` behaviour unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/SaveToast.tsx src/components/SaveToast.test.tsx
git commit -m "feat: support a custom message on SaveToast"
```

---

### Task 3: `UncategorizedTriageChips` component

**Files:**
- Create: `src/components/UncategorizedTriageChips.tsx`
- Test: `src/components/UncategorizedTriageChips.test.tsx`

**Interfaces:**
- Consumes: `BudgetIcon` from `./BudgetIcon`; `Entry` from `../types`.
- Produces: default export `UncategorizedTriageChips` with props
  `{ entry: Entry; rankedIds: string[]; categoryOptions: { id: string; label: string; icon: string }[]; onCategorize: (entry: Entry, categoryId: string) => void | Promise<void> }`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/UncategorizedTriageChips.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UncategorizedTriageChips from './UncategorizedTriageChips'
import type { Entry } from '../types'

const options = [
  { id: 'lunch', label: 'Lunch', icon: 'lunch' },
  { id: 'transport', label: 'Transport', icon: 'transport' },
  { id: 'others', label: 'Others', icon: 'others' },
  { id: 'savings', label: 'Savings', icon: 'savings' },
]
const entry: Entry = { id: 'e1', amount: 5.8, category: null, note: '', date: '2026-07-15', merchant: 'Toast Box' }

describe('UncategorizedTriageChips', () => {
  it('renders the ranked chips plus an overflow control, and hides non-ranked categories', () => {
    render(<UncategorizedTriageChips entry={entry} rankedIds={['lunch', 'transport', 'others']} categoryOptions={options} onCategorize={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Categorize Toast Box as Lunch' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Categorize Toast Box as Transport' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show all categories' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Categorize Toast Box as Savings' })).toBeNull()
  })

  it('calls onCategorize with the entry and chosen id when a chip is tapped', () => {
    const onCategorize = vi.fn()
    render(<UncategorizedTriageChips entry={entry} rankedIds={['lunch', 'transport', 'others']} categoryOptions={options} onCategorize={onCategorize} />)
    fireEvent.click(screen.getByRole('button', { name: 'Categorize Toast Box as Lunch' }))
    expect(onCategorize).toHaveBeenCalledWith(entry, 'lunch')
  })

  it('expands to every category and collapses again', () => {
    render(<UncategorizedTriageChips entry={entry} rankedIds={['lunch', 'transport', 'others']} categoryOptions={options} onCategorize={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show all categories' }))
    expect(screen.getByRole('button', { name: 'Categorize Toast Box as Savings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse category list' }))
    expect(screen.queryByRole('button', { name: 'Categorize Toast Box as Savings' })).toBeNull()
  })

  it('names an entry with no merchant generically', () => {
    render(<UncategorizedTriageChips entry={{ ...entry, merchant: undefined }} rankedIds={['lunch']} categoryOptions={options} onCategorize={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Categorize entry as Lunch' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/UncategorizedTriageChips.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/UncategorizedTriageChips.tsx`:

```tsx
import { useState } from 'react'
import { MoreHorizontal, X } from 'lucide-react'
import type { Entry } from '../types'
import BudgetIcon from './BudgetIcon'

interface CategoryOption {
  id: string
  label: string
  icon: string
}

interface Props {
  entry: Entry
  rankedIds: string[]
  categoryOptions: CategoryOption[]
  onCategorize: (entry: Entry, categoryId: string) => void | Promise<void>
}

export default function UncategorizedTriageChips({ entry, rankedIds, categoryOptions, onCategorize }: Props) {
  const [expanded, setExpanded] = useState(false)
  const merchant = entry.merchant?.trim() || 'entry'
  const optionsById = new Map(categoryOptions.map(option => [option.id, option]))
  const rankedOptions = rankedIds
    .map(id => optionsById.get(id))
    .filter((option): option is CategoryOption => option != null)

  const renderChip = (option: CategoryOption, isTop: boolean) => (
    <button
      key={option.id}
      type="button"
      className={`triage-chip${isTop ? ' triage-chip--top' : ''}`}
      aria-label={`Categorize ${merchant} as ${option.label}`}
      onClick={() => void onCategorize(entry, option.id)}
    >
      <BudgetIcon name={option.icon} />
      {option.label}
    </button>
  )

  if (expanded) {
    const labelId = `triage-label-${entry.id}`
    return (
      <div className="triage-chips triage-chips--expanded">
        <span className="triage-chips__label" id={labelId}>Choose a category</span>
        <div className="triage-chips__row" role="group" aria-labelledby={labelId}>
          {categoryOptions.map(option => renderChip(option, false))}
          <button
            type="button"
            className="triage-chip triage-chip--collapse"
            aria-label="Collapse category list"
            onClick={() => setExpanded(false)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="triage-chips" role="group" aria-label={`Suggested categories for ${merchant}`}>
      {rankedOptions.map((option, index) => renderChip(option, index === 0))}
      <button
        type="button"
        className="triage-chip triage-chip--more"
        aria-label="Show all categories"
        onClick={() => setExpanded(true)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/UncategorizedTriageChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/UncategorizedTriageChips.tsx src/components/UncategorizedTriageChips.test.tsx
git commit -m "feat: add UncategorizedTriageChips component"
```

---

### Task 4: Wire chips + Undo toast into Dashboard, with themed styles

**Files:**
- Modify: `src/screens/Dashboard.tsx`
- Modify: `src/index.css`
- Test: `src/screens/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `rankCategoriesForMerchant` (Task 1), `UncategorizedTriageChips` (Task 3), `SaveToast` `message` prop (Task 2), `buildCategoryOptions` from `../categoryDisplay`, `editEntry` from `useEntries()`.
- Produces: no new exported API — internal Dashboard behaviour only.

- [ ] **Step 1: Write the failing integration test**

Append to `src/screens/Dashboard.test.tsx` (reuse the file's existing `renderWithEntries` helper and `sharedCtx` mock; add imports `import { sgtToday } from '../shared/sgtDate'` and `import { toLocalDateString } from '../dates'` if absent):

```tsx
it('files an uncategorised entry from Home via a triage chip and shows an Undo toast', async () => {
  const today = toLocalDateString(sgtToday())
  const { container } = renderWithEntries([
    { id: 'u1', amount: 5.8, category: null, note: '', date: today, merchant: 'Toast Box' },
  ])

  // Expand the Uncategorized bucket so its rows (and chips) render.
  const bucketToggle = [...container.querySelectorAll('button')]
    .find(b => /Uncategorized/.test(b.textContent ?? ''))
  await act(async () => { bucketToggle?.click() })

  const lunchChip = [...container.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === 'Categorize Toast Box as Lunch')
  expect(lunchChip).toBeTruthy()

  await act(async () => { lunchChip?.click(); await Promise.resolve() })

  // The entry is now categorised, so its triage chip is gone and the Undo toast is shown.
  expect([...container.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === 'Categorize Toast Box as Lunch')).toBeFalsy()
  expect(container.querySelector('.save-toast')?.textContent).toContain('Filed Toast Box → Lunch')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/screens/Dashboard.test.tsx`
Expected: FAIL — no chip button is rendered.

- [ ] **Step 3: Add imports and wiring in `src/screens/Dashboard.tsx`**

3a. Add imports near the other imports at the top:

```tsx
import SaveToast from '../components/SaveToast'
import UncategorizedTriageChips from '../components/UncategorizedTriageChips'
import { buildCategoryOptions } from '../categoryDisplay'
import { rankCategoriesForMerchant } from '../shared/category'
```

3b. Pull `editEntry` from the entries context — change line 62 from:

```tsx
  const { entries: allEntries, removeEntry, sync, refresh } = useEntries()
```
to:
```tsx
  const { entries: allEntries, editEntry, removeEntry, sync, refresh } = useEntries()
```

3c. Add derived options + toast state. After the `iconFor` definition (line ~70), add:

```tsx
  const triageCategoryOptions = buildCategoryOptions(overrides, customCategories)
  const [triageToast, setTriageToast] = useState<{ id: string; message: string } | null>(null)

  async function handleTriageCategorize(target: Entry, categoryId: string) {
    await editEntry(target.id, { category: categoryId })
    const merchant = target.merchant?.trim() || 'entry'
    setTriageToast({ id: target.id, message: `Filed ${merchant} → ${labelFor(categoryId)}` })
  }

  function handleTriageUndo() {
    if (triageToast) void editEntry(triageToast.id, { category: null })
    setTriageToast(null)
  }
```

3d. Render chips inside `renderExpenseRow`. Replace its final `return ( <div key={entry.id} className="category-expense-row"> … </div> )` (lines ~223–245) so the row is captured and, for uncategorised entries, followed by chips:

```tsx
    const row = (
      <div className="category-expense-row">
        <span className="category-expense-main">
          <span className="category-expense-date">
            {format(fromLocalDateString(entry.date), 'EEE, MMM d')}
          </span>
          {entry.note && <span className="category-expense-note">{entry.note}</span>}
        </span>
        <span className="category-expense-trailing">
          <strong className={`category-expense-amount${isRefund(entry) ? ' entry-amount--refund' : ''}`}>
            {formatEntryAmount(entry)}
          </strong>
          <button
            type="button"
            className="expense-delete-btn"
            aria-label="Delete entry"
            onClick={() => setConfirmingDeleteId(entry.id)}
          >
            <Minus size={15} strokeWidth={3} aria-hidden="true" />
          </button>
        </span>
      </div>
    )

    if (entry.category != null) return <div key={entry.id}>{row}</div>

    const rankedIds = rankCategoriesForMerchant(allEntries, entry.merchant ?? null, categoryIds)
    return (
      <div key={entry.id} className="triage-row">
        {row}
        <UncategorizedTriageChips
          entry={entry}
          rankedIds={rankedIds}
          categoryOptions={triageCategoryOptions}
          onCategorize={handleTriageCategorize}
        />
      </div>
    )
```

3e. Render the toast. Just before the final closing `</div>` of the root `.screen dashboard …` element (the last line of the component's returned JSX), add:

```tsx
      {triageToast && (
        <SaveToast
          message={triageToast.message}
          onUndo={handleTriageUndo}
          onDismiss={() => setTriageToast(null)}
        />
      )}
```

- [ ] **Step 4: Add themed chip styles to `src/index.css`**

Append near the other `.category-expense-*` / `.uncategorized-review__categories` rules:

```css
.triage-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.triage-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 2px 0 4px;
}

.triage-chips--expanded {
  flex-direction: column;
  align-items: flex-start;
}

.triage-chips__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.triage-chips__row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.triage-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--separator);
  border-radius: var(--theme-control-radius, 12px);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.triage-chip:active {
  background: var(--fill);
  border-color: var(--primary);
}

.triage-chip--top {
  border-color: var(--primary);
}

.triage-chip--more,
.triage-chip--collapse {
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/screens/Dashboard.test.tsx`
Expected: PASS. Then run the full suite: `npm test`
Expected: all green.

- [ ] **Step 6: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: type-check + build succeed; eslint clean.

- [ ] **Step 7: Commit**

```bash
git add src/screens/Dashboard.tsx src/screens/Dashboard.test.tsx src/index.css
git commit -m "feat: one-tap triage chips on Home Uncategorized rows"
```

---

### Task 5: E2E journey — file from Home

**Files:**
- Modify: `tests/e2e/journeys.spec.ts`

**Interfaces:**
- Consumes: existing `prepareApp`, `currentLocalDate`, `expect`, `test` from `./fixtures`.

- [ ] **Step 1: Write the E2E test**

Append to `tests/e2e/journeys.spec.ts`:

```ts
test('user files an uncategorised capture from Home with one tap', async ({ page }) => {
  await prepareApp(page, [{
    id: 'uncat-1', amount: 5.8, note: '', category: null,
    date: currentLocalDate(), merchant: 'Toast Box',
  }])
  await page.goto('/')

  // Open the triage bucket, then file with the top-ranked chip.
  await page.getByRole('button', { name: /Uncategorized/ }).click()
  await page.getByRole('button', { name: 'Categorize Toast Box as Lunch' }).click()

  await expect(page.locator('.save-toast')).toContainText('Filed Toast Box → Lunch')
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('budget_entries') ?? '[]'))
  expect(entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'uncat-1', category: 'lunch' }),
  ]))
})
```

Note: `guessCategory('Toast Box')` returns `lunch`, so the top-ranked chip is deterministically Lunch for this brand-new merchant.

- [ ] **Step 2: Run the E2E test**

Run: `npm run test:e2e -- -g "files an uncategorised capture"` (or the repo's E2E command from `package.json`; check `scripts` if unsure).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys.spec.ts
git commit -m "test: e2e triage-chip filing from Home"
```

---

## Self-Review

**1. Spec coverage:**
- Ranking (history→keyword→popularity→candidate order, always 3, retired-category exclusion) → Task 1. ✓
- `UncategorizedTriageChips` collapsed/expanded, 44px, accessible names → Task 3. ✓
- Wiring via `editEntry`, learning-loop feed (automatic — filing sets `category`, read back by `categoryFromHistory`) → Task 4. ✓
- Optimistic file + Undo toast (`Filed {merchant} → {label}`, Undo → `category: null`) → Tasks 2 + 4. ✓
- Theme tokens only, all four themes → Task 4 CSS. ✓
- Modal / ingest / storage / History untouched → nothing in any task modifies them. ✓
- Tests: unit (T1), component (T3), SaveToast (T2), integration (T4), E2E (T5). ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✓

**3. Type consistency:** `rankCategoriesForMerchant(entries, merchant, candidateIds, limit?)` is defined in Task 1 and called with `(allEntries, entry.merchant ?? null, categoryIds)` in Task 4. `handleTriageCategorize(target, categoryId)` matches the `onCategorize` prop signature of `UncategorizedTriageChips`. `SaveToast` `message` prop added in Task 2, consumed in Task 4. `triageCategoryOptions` (from `buildCategoryOptions`) matches the component's `categoryOptions` `{ id, label, icon }[]` type. ✓

**Note for the executor:** line numbers are approximate — anchor on the quoted code, not the numbers. Chips render only when the Uncategorized bucket is expanded (existing UX); tests expand it first.
