# Custom Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add and remove their own spend categories (with an optional budget) alongside the fixed built-in five.

**Architecture:** Custom categories are additive *spend* categories stored locally (like `budget_config`). `Entry.category` becomes a free `string`; the built-in `Category` union/constants remain for built-in special behavior. `compute.ts` gains a small seam (a category-id list + budget map) so all per-category math (spend, deficits, buffer spill, month comparison) extends to customs automatically. UI (Settings/AddEntry/Dashboard/BudgetIcon) iterates `[...built-ins, ...customs]`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, lucide-react, localStorage.

## Global Constraints

- Run all commands inside `budget-tracker/` (the repo root is this subdir).
- TypeScript throughout; tests are colocated `*.test.ts(x)`, run with `npm test` (vitest).
- All date/budget logic is SGT-local via `shared/sgtDate.ts` / `dates.ts`; do not reintroduce raw `Date` math.
- Built-in categories (`lunch`, `transport`, `savings`, `investments`, `others`/buffer) and their special behavior stay untouched.
- Custom categories are *spend* type only (never commitments); budget is optional (`null` = no target).
- Removal is blocked while any entry (this month or history) references the category.
- Custom category definitions persist in localStorage only; entries stay server-synced and carry the category-id string.
- Run `npm run lint` and `npm test` clean before each commit. Each task ends green.

---

### Task 1: Custom-category type + storage

**Files:**
- Modify: `src/types.ts`
- Modify: `src/storage.ts`
- Test: `src/storage.test.ts`

**Interfaces:**
- Produces: `interface CustomCategory { id: string; label: string; budget: number | null; icon: string }`; `Entry.category: string | null`; `getCustomCategories(): CustomCategory[]`; `saveCustomCategories(cats: CustomCategory[]): void`; `makeCustomCategoryId(label: string): string`.

- [ ] **Step 1: Write the failing test**

Append to `src/storage.test.ts`:

```ts
import { getCustomCategories, saveCustomCategories, makeCustomCategoryId } from './storage'
import type { CustomCategory } from './types'

describe('custom categories storage', () => {
  beforeEach(() => localStorage.clear())

  const cat = (o: Partial<CustomCategory> = {}): CustomCategory => ({
    id: 'cat_groceries_x1', label: 'Groceries', budget: 120, icon: 'ShoppingBag', ...o,
  })

  it('returns [] when nothing is stored', () => {
    expect(getCustomCategories()).toEqual([])
  })

  it('round-trips saved categories', () => {
    const cats = [cat(), cat({ id: 'cat_gym_x2', label: 'Gym', budget: null, icon: 'Dumbbell' })]
    saveCustomCategories(cats)
    expect(getCustomCategories()).toEqual(cats)
  })

  it('returns [] when stored JSON is corrupt', () => {
    localStorage.setItem('budget_custom_categories', '{not json')
    expect(getCustomCategories()).toEqual([])
  })

  it('makeCustomCategoryId slugifies the label and is unique', () => {
    const a = makeCustomCategoryId('My Gym!')
    const b = makeCustomCategoryId('My Gym!')
    expect(a).toMatch(/^cat_my_gym_/)
    expect(a).not.toEqual(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/storage.test.ts`
Expected: FAIL — `getCustomCategories`/`saveCustomCategories`/`makeCustomCategoryId`/`CustomCategory` not exported.

- [ ] **Step 3: Implement the type and storage**

In `src/types.ts`, change the `Entry.category` line:

```ts
  category: string | null
```

Add after the `Category` constants block:

```ts
export interface CustomCategory {
  id: string            // stable id stored as Entry.category (e.g. "cat_groceries_x7")
  label: string
  budget: number | null // null = no target ("leave it empty")
  icon: string          // a lucide icon name from the curated set (see BudgetIcon)
}
```

In `src/storage.ts`, add:

```ts
import type { Entry, BudgetConfig, PokerSession, CustomCategory } from './types'

const CUSTOM_CATEGORIES_KEY = 'budget_custom_categories'

export function getCustomCategories(): CustomCategory[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY)
    return raw ? (JSON.parse(raw) as CustomCategory[]) : []
  } catch {
    return []
  }
}

export function saveCustomCategories(categories: CustomCategory[]): void {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories))
}

export function makeCustomCategoryId(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'category'
  return `cat_${slug}_${Math.random().toString(36).slice(2, 7)}`
}
```

(Update the existing `import type` line in `storage.ts` to include `CustomCategory` as shown.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/storage.test.ts`
Expected: PASS. Also run `npm run lint` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/storage.ts src/storage.test.ts
git commit -m "feat: CustomCategory type + localStorage persistence"
```

---

### Task 2: Icon allow-list + BudgetIcon custom resolution

**Files:**
- Modify: `src/components/BudgetIcon.tsx`
- Test: `src/components/BudgetIcon.test.tsx` (create)

**Interfaces:**
- Consumes: `CustomCategory` (Task 1).
- Produces: `CUSTOM_ICON_NAMES: string[]` (curated picker list) and `ICON_COMPONENTS: Record<string, LucideIcon>` from `BudgetIcon.tsx`; `<BudgetIcon name={string} />` resolves built-in names, then custom icon names, then falls back to `CircleDollarSign`.

- [ ] **Step 1: Write the failing test**

Create `src/components/BudgetIcon.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BudgetIcon, { CUSTOM_ICON_NAMES, ICON_COMPONENTS } from './BudgetIcon'

describe('BudgetIcon', () => {
  it('exposes a non-empty curated icon set, all resolvable', () => {
    expect(CUSTOM_ICON_NAMES.length).toBeGreaterThanOrEqual(12)
    for (const name of CUSTOM_ICON_NAMES) expect(ICON_COMPONENTS[name]).toBeTruthy()
  })

  it('renders an svg for a built-in name', () => {
    const { container } = render(<BudgetIcon name="lunch" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders an svg for a custom icon name', () => {
    const { container } = render(<BudgetIcon name={CUSTOM_ICON_NAMES[0]} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('falls back to an svg for an unknown name', () => {
    const { container } = render(<BudgetIcon name="totally-unknown" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/BudgetIcon.test.tsx`
Expected: FAIL — `CUSTOM_ICON_NAMES`/`ICON_COMPONENTS` not exported.

- [ ] **Step 3: Implement**

Replace `src/components/BudgetIcon.tsx` with:

```tsx
import {
  BookOpen, Car, CircleDollarSign, Coffee, Dumbbell, Gamepad2, Gift, Heart,
  Home, PawPrint, Phone, PiggyBank, Plane, ShieldCheck, Shirt, ShoppingBag,
  Stethoscope, TrainFront, TrendingUp, Utensils, Zap,
  type LucideIcon,
} from 'lucide-react'

// Icons offered to the user when creating a custom category.
export const CUSTOM_ICON_NAMES = [
  'ShoppingBag', 'Coffee', 'Gift', 'Heart', 'Home', 'Car', 'Plane', 'Dumbbell',
  'Gamepad2', 'Shirt', 'Stethoscope', 'BookOpen', 'Phone', 'Zap', 'PawPrint', 'CircleDollarSign',
] as const

// Every icon name (built-in + custom) that BudgetIcon can render.
export const ICON_COMPONENTS: Record<string, LucideIcon> = {
  // built-in budget lines
  lunch: Utensils, transport: TrainFront, savings: PiggyBank,
  investments: TrendingUp, others: ShoppingBag, buffer: ShieldCheck,
  // curated custom set
  ShoppingBag, Coffee, Gift, Heart, Home, Car, Plane, Dumbbell,
  Gamepad2, Shirt, Stethoscope, BookOpen, Phone, Zap, PawPrint, CircleDollarSign,
}

interface Props {
  name: string
}

export default function BudgetIcon({ name }: Props) {
  const Icon = ICON_COMPONENTS[name] ?? CircleDollarSign
  return <Icon className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
}
```

Note: `name` is now `string` (was `BudgetIconName`). Existing callers pass `'buffer'`, `'uncategorized'`, and `Category` values — all still valid strings; `'uncategorized'` is absent from the map and correctly falls back to `CircleDollarSign`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/BudgetIcon.test.tsx`
Expected: PASS. Run full `npm test` to confirm no caller broke on the `name` prop type, and `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/BudgetIcon.tsx src/components/BudgetIcon.test.tsx
git commit -m "feat: curated icon set + BudgetIcon custom resolution"
```

---

### Task 3: Compute seam for custom categories

**Files:**
- Modify: `src/compute.ts`
- Test: `src/compute.test.ts`

**Interfaces:**
- Consumes: `CustomCategory` (Task 1).
- Produces:
  - `allCategoryIds(custom?: CustomCategory[]): string[]` — built-in `CATEGORIES` then custom ids.
  - `categoryBudgets(config: BudgetConfig, custom?: CustomCategory[]): Record<string, number>` — built-in budgets from config, custom from `cat.budget ?? 0`.
  - `monthlySpendByCategory(entries, year, month, custom?)` → `Record<string, number>` keyed by all ids.
  - `categoryDeficits(spend, config, custom?)` → `Record<string, number>`.
  - `customBudgetTotal(custom?: CustomCategory[]): number` — sum of `cat.budget ?? 0`.
  - (Out of scope, intentionally unchanged: `monthComparison` and the Insights panel stay built-in-only — see note in Step 3.)

- [ ] **Step 1: Write the failing test**

Append to `src/compute.test.ts`:

```ts
import { allCategoryIds, categoryBudgets, customBudgetTotal } from './compute'
import type { CustomCategory } from './types'

const groceries: CustomCategory = { id: 'cat_groc', label: 'Groceries', budget: 100, icon: 'ShoppingBag' }
const gym: CustomCategory = { id: 'cat_gym', label: 'Gym', budget: null, icon: 'Dumbbell' }

describe('custom category compute seam', () => {
  it('allCategoryIds appends custom ids after built-ins', () => {
    expect(allCategoryIds([groceries])).toEqual([...CATEGORIES, 'cat_groc'])
    expect(allCategoryIds()).toEqual([...CATEGORIES])
  })

  it('categoryBudgets reads built-ins from config and customs from .budget', () => {
    const budgets = categoryBudgets(DEFAULT_BUDGET, [groceries, gym])
    expect(budgets.lunch).toBe(DEFAULT_BUDGET.lunch)
    expect(budgets.cat_groc).toBe(100)
    expect(budgets.cat_gym).toBe(0) // null budget -> 0
  })

  it('customBudgetTotal sums custom budgets treating null as 0', () => {
    expect(customBudgetTotal([groceries, gym])).toBe(100)
  })

  it('monthlySpendByCategory tallies custom categories', () => {
    const entries = [e({ amount: 30, category: 'cat_groc', date: '2026-05-04' })]
    const spend = monthlySpendByCategory(entries, 2026, 4, [groceries])
    expect(spend.cat_groc).toBe(30)
    expect(spend.lunch).toBe(0)
  })

  it('categoryDeficits and buffer spill cover custom overspend', () => {
    const spend = monthlySpendByCategory(
      [e({ amount: 130, category: 'cat_groc', date: '2026-05-04' })], 2026, 4, [groceries],
    )
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET, [groceries])
    expect(deficits.cat_groc).toBe(-30) // 100 budget - 130 spent
    // 30 over a non-'others' category eats into the buffer
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(DEFAULT_BUDGET.buffer - 30)
  })
})
```

Add `CATEGORIES` to the existing import from `./types` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/compute.test.ts`
Expected: FAIL — `allCategoryIds`/`categoryBudgets`/`customBudgetTotal` not exported; `monthlySpendByCategory`/`categoryDeficits` don't accept the 4th arg.

- [ ] **Step 3: Implement**

In `src/compute.ts`, update the import and add the seam helpers near the top (after the existing imports):

```ts
import type { Entry, BudgetConfig, Category, CustomCategory } from './types'
import { CATEGORIES } from './types'

export function allCategoryIds(custom: CustomCategory[] = []): string[] {
  return [...CATEGORIES, ...custom.map(c => c.id)]
}

export function categoryBudgets(
  config: BudgetConfig,
  custom: CustomCategory[] = [],
): Record<string, number> {
  const budgets: Record<string, number> = {}
  for (const c of CATEGORIES) budgets[c] = config[c] ?? 0
  for (const c of custom) budgets[c.id] = c.budget ?? 0
  return budgets
}

export function customBudgetTotal(custom: CustomCategory[] = []): number {
  return custom.reduce((sum, c) => sum + (c.budget ?? 0), 0)
}
```

Change `monthlySpendByCategory` to enumerate all ids:

```ts
export function monthlySpendByCategory(
  entries: Entry[],
  year: number,
  month: number,
  custom: CustomCategory[] = [],
): Record<string, number> {
  const monthly = entriesForMonth(entries, year, month)
  const result = Object.fromEntries(allCategoryIds(custom).map(c => [c, 0])) as Record<string, number>
  for (const entry of monthly) {
    if (entry.category && entry.category in result) result[entry.category] += entry.amount
  }
  return result
}
```

Change `categoryDeficits` to use the budget map across all present ids:

```ts
export function categoryDeficits(
  spend: Record<string, number>,
  config: BudgetConfig,
  custom: CustomCategory[] = [],
): Record<string, number> {
  const budgets = categoryBudgets(config, custom)
  const ids = new Set([...Object.keys(spend), ...Object.keys(budgets)])
  return Object.fromEntries(
    [...ids].map(c => [c, (budgets[c] ?? 0) - (spend[c] ?? 0)]),
  ) as Record<string, number>
}
```

`bufferRemaining` needs **no change** — it already sums every non-`others` negative deficit, so custom overspend spills into the buffer once customs are in `deficits`.

**Leave `monthComparison` and the `MonthComparison`/`HighlightedCategoryMonthDelta` interfaces unchanged** (built-in-only). It still compiles after the `monthlySpendByCategory` return type widens to `Record<string, number>` (indexing by a `Category` key remains valid). Reason: `InsightsSection.tsx` does `CATEGORY_LABELS[comparison.biggestIncrease.category]`, so a `string` category there would both break types and render an `undefined` label for custom ids. Insights over custom categories is intentionally out of scope for this plan.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/compute.test.ts`
Expected: PASS (new + existing — the optional `custom` param keeps old call sites valid). Run `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/compute.ts src/compute.test.ts
git commit -m "feat: extend compute (spend/deficits/buffer/comparison) to custom categories"
```

---

### Task 4: Removal guard helper

**Files:**
- Modify: `src/compute.ts`
- Test: `src/compute.test.ts`

**Interfaces:**
- Produces: `countEntriesForCategory(entries: Entry[], categoryId: string): number`.

- [ ] **Step 1: Write the failing test**

Append to `src/compute.test.ts`:

```ts
import { countEntriesForCategory } from './compute'

describe('countEntriesForCategory', () => {
  it('counts entries tagged with the given category across all dates', () => {
    const entries = [
      e({ category: 'cat_groc', date: '2026-05-04' }),
      e({ category: 'cat_groc', date: '2024-01-01' }),
      e({ category: 'lunch', date: '2026-05-04' }),
      e({ category: null, date: '2026-05-04' }),
    ]
    expect(countEntriesForCategory(entries, 'cat_groc')).toBe(2)
    expect(countEntriesForCategory(entries, 'cat_unused')).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/compute.test.ts`
Expected: FAIL — `countEntriesForCategory` not exported.

- [ ] **Step 3: Implement**

Add to `src/compute.ts`:

```ts
// How many entries (any date) reference this category id. Used to block removal
// of an in-use category so no entry is left pointing at a deleted category.
export function countEntriesForCategory(entries: Entry[], categoryId: string): number {
  return entries.reduce((n, entry) => (entry.category === categoryId ? n + 1 : n), 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/compute.test.ts`
Expected: PASS. `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/compute.ts src/compute.test.ts
git commit -m "feat: countEntriesForCategory removal-guard helper"
```

---

### Task 5: Settings — manage custom categories

**Files:**
- Modify: `src/screens/Settings.tsx`
- Modify: `src/index.css` (small styles for the add form / icon picker / remove button)
- Test: `src/screens/Settings.test.tsx`

**Interfaces:**
- Consumes: `getCustomCategories`/`saveCustomCategories`/`makeCustomCategoryId` (Task 1), `CUSTOM_ICON_NAMES`/`BudgetIcon` (Task 2), `countEntriesForCategory` (Task 4), `useEntries` (existing).
- Produces: a "Categories" management UI; on Save, persists both budget config and custom categories.

- [ ] **Step 1: Write the failing test**

Append to `src/screens/Settings.test.tsx` (follow the file's existing render/setup helpers; the snippet below assumes a `renderSettings()` helper like the existing tests — if the file renders inline, mirror that):

```tsx
import { fireEvent, screen, within } from '@testing-library/react'
import { getCustomCategories, saveCustomCategories } from '../storage'

describe('Settings custom categories', () => {
  beforeEach(() => localStorage.clear())

  it('adds a custom category with a budget and persists on save', () => {
    renderSettings() // existing helper that renders <Settings onBack={...} /> inside EntriesProvider
    fireEvent.click(screen.getByRole('button', { name: /add category/i }))
    fireEvent.change(screen.getByLabelText(/category name/i), { target: { value: 'Groceries' } })
    fireEvent.change(screen.getByLabelText(/category budget/i), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save budgets/i }))

    const saved = getCustomCategories()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ label: 'Groceries', budget: 120 })
  })

  it('allows an empty budget (null)', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /add category/i }))
    fireEvent.change(screen.getByLabelText(/category name/i), { target: { value: 'Gym' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save budgets/i }))
    expect(getCustomCategories()[0]).toMatchObject({ label: 'Gym', budget: null })
  })

  it('removes a category with no entries', () => {
    saveCustomCategories([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }])
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /remove gym/i }))
    fireEvent.click(screen.getByRole('button', { name: /save budgets/i }))
    expect(getCustomCategories()).toEqual([])
  })
})
```

If `Settings.test.tsx` has no shared `renderSettings` helper, add one at the top mirroring how the file currently mounts `<Settings />` (wrap in the same provider the existing tests use). Keep the new `describe` block consistent with that.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/screens/Settings.test.tsx`
Expected: FAIL — no "Add category"/remove controls exist.

- [ ] **Step 3: Implement**

In `src/screens/Settings.tsx`:

1. Add imports:

```tsx
import { Plus } from 'lucide-react'
import { getBudgetConfig, saveBudgetConfig, getCustomCategories, saveCustomCategories, makeCustomCategoryId } from '../storage'
import { CUSTOM_ICON_NAMES } from '../components/BudgetIcon'
import { countEntriesForCategory } from '../compute'
import type { BudgetConfig, CustomCategory } from '../types'
```

2. Add state and derived totals (inside the component, alongside existing state):

```tsx
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(getCustomCategories)
  const [showAdd, setShowAdd] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newIcon, setNewIcon] = useState<string>(CUSTOM_ICON_NAMES[0])
  const [removeError, setRemoveError] = useState('')
```

Extend the budget total to include custom budgets:

```tsx
  const customTotal = customCategories.reduce((sum, c) => sum + (c.budget ?? 0), 0)
  const total = BUDGET_FIELDS.reduce((sum, field) => sum + config[field.key], 0) + customTotal
```

3. Add handlers:

```tsx
  function handleAddCategory() {
    const label = newLabel.trim()
    if (!label) return
    const trimmed = newBudget.trim()
    const budget = trimmed === '' ? null : Math.max(0, parseFloat(trimmed) || 0)
    setCustomCategories(prev => [...prev, { id: makeCustomCategoryId(label), label, budget, icon: newIcon }])
    setNewLabel(''); setNewBudget(''); setNewIcon(CUSTOM_ICON_NAMES[0]); setShowAdd(false)
  }

  function handleCustomBudgetChange(id: string, value: string) {
    const trimmed = value.trim()
    const budget = trimmed === '' ? null : Math.max(0, parseFloat(trimmed) || 0)
    setCustomCategories(prev => prev.map(c => (c.id === id ? { ...c, budget } : c)))
  }

  function handleRemoveCategory(cat: CustomCategory) {
    const count = countEntriesForCategory(entries, cat.id)
    if (count > 0) {
      setRemoveError(`${count} entr${count === 1 ? 'y' : 'ies'} use "${cat.label}". Re-tag or delete them first.`)
      return
    }
    setRemoveError('')
    setCustomCategories(prev => prev.filter(c => c.id !== cat.id))
  }
```

Extend `handleSave` to persist customs too:

```tsx
  function handleSave() {
    saveBudgetConfig(config)
    saveCustomCategories(customCategories)
    onBack()
  }
```

4. Render the management UI immediately after the existing Monthly Budgets `ios-list` (before the `settings-total` div), so custom rows sit with the budgets and the total below covers both:

```tsx
      {customCategories.length > 0 && (
        <div className="ios-list">
          {customCategories.map(cat => (
            <div key={cat.id} className="settings-row">
              <label className="settings-label icon-label" htmlFor={`custom-${cat.id}`}>
                <BudgetIcon name={cat.icon} />
                {cat.label}
              </label>
              <div className="settings-row-trailing">
                <input
                  id={`custom-${cat.id}`}
                  type="number"
                  className="settings-input"
                  value={cat.budget ?? ''}
                  placeholder="No budget"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  onChange={e => handleCustomBudgetChange(cat.id, e.target.value)}
                />
                <button
                  type="button"
                  className="category-remove-btn"
                  aria-label={`Remove ${cat.label}`}
                  onClick={() => handleRemoveCategory(cat)}
                >
                  <Trash2 size={16} strokeWidth={2.3} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="ios-list category-add-form">
          <div className="settings-row">
            <label className="settings-label" htmlFor="new-cat-name">Category name</label>
            <input
              id="new-cat-name"
              type="text"
              className="settings-input"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
            />
          </div>
          <div className="settings-row">
            <label className="settings-label" htmlFor="new-cat-budget">Category budget</label>
            <input
              id="new-cat-budget"
              type="number"
              className="settings-input"
              value={newBudget}
              placeholder="Optional"
              min="0"
              step="1"
              inputMode="decimal"
              onChange={e => setNewBudget(e.target.value)}
            />
          </div>
          <div className="icon-picker" role="group" aria-label="Choose an icon">
            {CUSTOM_ICON_NAMES.map(name => (
              <button
                key={name}
                type="button"
                className={`icon-picker-btn ${newIcon === name ? 'icon-picker-btn--selected' : ''}`}
                aria-label={`Icon ${name}`}
                aria-pressed={newIcon === name}
                onClick={() => setNewIcon(name)}
              >
                <BudgetIcon name={name} />
              </button>
            ))}
          </div>
          <div className="category-add-actions">
            <button type="button" className="save-btn" onClick={handleAddCategory} disabled={!newLabel.trim()}>Add</button>
            <button type="button" className="export-btn" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="export-btn" onClick={() => setShowAdd(true)}>
          <Plus aria-hidden="true" size={18} strokeWidth={2.3} />
          Add category
        </button>
      )}

      {removeError && (
        <p className="save-feedback save-feedback--error" role="status">{removeError}</p>
      )}
```

Ensure `BudgetIcon` is imported (it already is in this file).

5. Add minimal styles to `src/index.css` (place near the existing `.settings-*` rules):

```css
.settings-row-trailing { display: flex; align-items: center; gap: 8px; }
.category-remove-btn { background: none; border: none; color: var(--red); padding: 4px; cursor: pointer; }
.category-add-form { padding: 8px; }
.icon-picker { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; padding: 8px 0; }
.icon-picker-btn { display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 10px; border: 1px solid var(--border, #ddd); background: none; cursor: pointer; }
.icon-picker-btn--selected { border-color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.category-add-actions { display: flex; gap: 8px; }
```

(If `--border` isn't a defined CSS var in this project, use the literal color shown via the fallback already in the rule.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/screens/Settings.test.tsx`
Expected: PASS. Run full `npm test` and `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Settings.tsx src/index.css src/screens/Settings.test.tsx
git commit -m "feat: manage custom categories in Settings (add/remove/icon/budget)"
```

---

### Task 6: AddEntry chips include custom categories

**Files:**
- Modify: `src/screens/AddEntry.tsx`
- Test: `src/screens/AddEntry.test.tsx` (create if absent; otherwise append)

**Interfaces:**
- Consumes: `getCustomCategories` (Task 1), `BudgetIcon` (Task 2), existing `CATEGORIES`/`CATEGORY_LABELS`/`useEntries`.

- [ ] **Step 1: Write the failing test**

Create/append `src/screens/AddEntry.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import AddEntry from './AddEntry'
import { EntriesProvider } from '../EntriesContext'
import { saveCustomCategories } from '../storage'

function renderAddEntry() {
  return render(
    <EntriesProvider>
      <AddEntry onSave={() => {}} />
    </EntriesProvider>,
  )
}

describe('AddEntry custom categories', () => {
  beforeEach(() => localStorage.clear())

  it('renders a chip for each custom category', () => {
    saveCustomCategories([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }])
    renderAddEntry()
    expect(screen.getByRole('button', { name: /gym/i })).toBeTruthy()
  })

  it('lets you select a custom category chip', () => {
    saveCustomCategories([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }])
    renderAddEntry()
    const chip = screen.getByRole('button', { name: /gym/i })
    fireEvent.click(chip)
    expect(chip.className).toContain('chip--selected')
  })
})
```

(If `EntriesProvider` isn't the correct export name, match what `EntriesContext.tsx` exports and how other screen tests wrap it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/screens/AddEntry.test.tsx`
Expected: FAIL — no Gym chip rendered.

- [ ] **Step 3: Implement**

In `src/screens/AddEntry.tsx`:

```tsx
import { getCustomCategories } from '../storage'
import { CATEGORY_LABELS, CATEGORIES } from '../types'
```

Add inside the component (before `return`):

```tsx
  const customCategories = getCustomCategories()
  const categoryOptions: { id: string; label: string; icon: string }[] = [
    ...CATEGORIES.map(c => ({ id: c, label: CATEGORY_LABELS[c], icon: c })),
    ...customCategories.map(c => ({ id: c.id, label: c.label, icon: c.icon })),
  ]
```

Replace the chips `.map` block to iterate `categoryOptions`:

```tsx
      <div className="chips">
        {categoryOptions.map(opt => (
          <button
            key={opt.id}
            type="button"
            className={`chip ${category === opt.id ? 'chip--selected' : ''}`}
            onClick={() => setCategory(prev => (prev === opt.id ? null : opt.id))}
          >
            <BudgetIcon name={opt.icon} />
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
```

`category` state is `string | null` already compatible (it was `Category | null`; widen the `useState` to `useState<string | null>(null)`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/screens/AddEntry.test.tsx`
Expected: PASS. Full `npm test` + `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AddEntry.tsx src/screens/AddEntry.test.tsx
git commit -m "feat: AddEntry shows custom category chips"
```

---

### Task 7: Dashboard renders custom categories + spendable budget

**Files:**
- Modify: `src/screens/Dashboard.tsx`
- Test: `src/screens/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `getCustomCategories` (Task 1); `allCategoryIds`, `categoryBudgets`, `customBudgetTotal`, updated `monthlySpendByCategory`/`categoryDeficits` (Task 3); `CATEGORY_LABELS`/`CATEGORIES` (existing).

- [ ] **Step 1: Write the failing test**

Append to `src/screens/Dashboard.test.tsx` (mirror its existing render helper / provider setup):

```tsx
import { saveCustomCategories } from '../storage'

describe('Dashboard custom categories', () => {
  it('shows a card for a budgeted custom category and its spend', async () => {
    // arrange: one entry tagged to the custom category in the current month
    saveCustomCategories([{ id: 'cat_groc_1', label: 'Groceries', budget: 100, icon: 'ShoppingBag' }])
    // use the file's existing helper to seed entries + render; e.g. seedEntries([...]) then renderDashboard()
    await seedAndRenderWith([
      { id: 'g1', amount: 40, category: 'cat_groc_1', note: '', date: toLocalDateString() },
    ])
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('S$40.00')).toBeTruthy()
  })
})
```

Adapt `seedAndRenderWith`/`toLocalDateString` to the helpers already present in `Dashboard.test.tsx` (it already constructs entries and renders within the provider — reuse that exact mechanism rather than inventing a new one).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/screens/Dashboard.test.tsx`
Expected: FAIL — no "Groceries" card.

- [ ] **Step 3: Implement**

In `src/screens/Dashboard.tsx`:

1. Imports:

```tsx
import { getBudgetConfig, getCustomCategories } from '../storage'
import {
  bufferRemaining, categoryDeficits, entriesForMonth, monthlySpendForecast,
  monthlySpendByCategory, safeToSpendPerDay, weeklyTotal, allCategoryIds,
  categoryBudgets, customBudgetTotal,
} from '../compute'
import { CATEGORY_LABELS, CATEGORIES } from '../types'
import type { Category, Entry } from '../types'
```

(`Category` is already imported in this file today; keep it for the `as Category` cast below.)

2. Load customs and build a label/icon/budget lookup near the top of the component:

```tsx
  const customCategories = getCustomCategories()
  const categoryIds = allCategoryIds(customCategories)
  const budgets = categoryBudgets(config, customCategories)
  const labelFor = (id: string): string =>
    (CATEGORY_LABELS as Record<string, string>)[id] ?? customCategories.find(c => c.id === id)?.label ?? id
  const iconFor = (id: string): string =>
    (CATEGORIES as string[]).includes(id) ? id : customCategories.find(c => c.id === id)?.icon ?? id
```

3. Pass customs into compute calls:

```tsx
  const spend = monthlySpendByCategory(entries, now.getFullYear(), now.getMonth(), customCategories)
  const deficits = categoryDeficits(spend, config, customCategories)
```

4. Include custom budgets in spendable budget:

```tsx
  const spendableBudget = config.lunch + config.transport + config.buffer + customBudgetTotal(customCategories)
```

5. Change the categories loop to iterate `categoryIds` instead of `CATEGORIES`, and replace `CATEGORY_LABELS[cat]`/`config[cat]`/`BudgetIcon name={cat}` with `labelFor(cat)`/`budgets[cat]`/`iconFor(cat)`. The existing `config[cat] > 0 ? … : …` progress guard becomes `budgets[cat] > 0 ? … : …`, which already renders a no-budget custom category as a card with spend and no progress pressure. `COMMITTED_CATEGORY_SET.has(cat)` stays as-is — customs are never committed (false), so they render as normal spend cards. Update the loop header:

```tsx
      {categoryIds.map(cat => {
        const spent = spend[cat]
        const deficit = deficits[cat]
        const over = deficit < 0
        const committed = COMMITTED_CATEGORY_SET.has(cat as Category)
        // ...
        const categoryLabel = labelFor(cat)
        const pct = budgets[cat] > 0 ? Math.min(100, (spent / budgets[cat]) * 100) : spent > 0 ? 100 : 0
        const statusLabel = committed
          ? spent >= budgets[cat] ? 'Committed' : `S$${deficit.toFixed(2)} to commit`
          : over ? `S$${Math.abs(deficit).toFixed(2)} over` : `S$${deficit.toFixed(2)} left`
```

and in the JSX replace `<BudgetIcon name={cat} />` → `<BudgetIcon name={iconFor(cat)} />`, `{categoryLabel}` stays, and `S${config[cat]}` → `S${budgets[cat]}`.

The `ExpandKey` type stays `Category | 'uncategorized'`; widen it to `string` since `expandedCategory` now holds custom ids: change `type ExpandKey = Category | 'uncategorized'` to `type ExpandKey = string`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/screens/Dashboard.test.tsx`
Expected: PASS. Run full `npm test` and `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Dashboard.tsx src/screens/Dashboard.test.tsx
git commit -m "feat: Dashboard renders custom categories and counts their budgets"
```

---

## Final verification

- [ ] Run the full suite: `npm test` — all green.
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — `tsc -b && vite build` succeeds (catches any residual `Category`-vs-`string` type breaks).
- [ ] Manual smoke (`npx netlify dev`, set `INGEST_TOKEN` first): add a custom category with a budget and one with none; confirm both appear as AddEntry chips and Dashboard cards; add an entry to one; try to remove it (blocked); remove the empty one (allowed).

## Notes / out of scope
- No server/Netlify changes — category defs are local like `budget_config`.
- `guessCategory`/keyword auto-categorization stays built-in only; auto-imported entries for custom categories fall to Uncategorized.
- Built-ins remain fixed (no rename/remove); no commitment-type customs.
