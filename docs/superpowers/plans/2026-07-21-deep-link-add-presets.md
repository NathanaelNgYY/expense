# F10 Quick-add Deep-link Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill the Add screen from `?add=true&category=<c>&amount=<n>` so an iOS Shortcuts widget can carry a one-tap preset ("Kopi S$2.20"); the user reviews and taps Save.

**Architecture:** A pure `src/deepLink.ts` parses the query string and resolves the category against the real category list. `AppShell` computes a one-shot prefill at mount (resolving the category with `buildCategoryOptions`) and passes resolved `initialAmount` / `initialCategory` props into `AddEntry`, mirroring the existing `initialDate` prop. Prefill is cleared on save and on tab change.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react (jsdom).

## Global Constraints

- Prefill only — never auto-save. The user always taps Save.
- Deep-link prefill targets the **Personal** destination only (default `selectedBudgetId === null`); shared budgets untouched.
- `category` resolves case-insensitively against option **id** first, then **label**. No match → category left empty (never guess).
- `amount` must be finite and `> 0`, truncated (not rounded) to 2 decimals to match the numpad. Invalid/absent → Add opens at 0.
- Deep-link values only ever set local state; never rendered as raw HTML. No new dependencies, no network calls, no data-model change.
- Tests run with `npm test` (`vitest run`). Component/integration tests use the `render` helper from `src/test-utils` (wraps `BudgetConfigProvider`).
- Commit style: `feat:` / `test:` / `docs:` prefixes; work happens on branch `feat/deep-link-add-presets`.

---

### Task 1: Pure deep-link module (`src/deepLink.ts`)

**Files:**
- Create: `src/deepLink.ts`
- Test: `src/deepLink.test.ts`

**Interfaces:**
- Consumes: nothing (pure; takes a `location.search` string and a plain options array).
- Produces:
  - `interface AddDeepLink { add: boolean; amount?: number; category?: string }`
  - `parseAddDeepLink(search: string): AddDeepLink`
  - `resolveCategoryId(raw: string, options: ReadonlyArray<{ id: string; label: string }>): string | null`
  - `amountToDigits(n: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/deepLink.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseAddDeepLink, resolveCategoryId, amountToDigits } from './deepLink'

const OPTIONS = [
  { id: 'lunch', label: 'Lunch' },
  { id: 'transport', label: 'Transport' },
  { id: 'cat_groceries_x7', label: 'Groceries' },
]

describe('parseAddDeepLink', () => {
  it('returns add:false with no params', () => {
    expect(parseAddDeepLink('')).toEqual({ add: false })
  })

  it('detects add=true', () => {
    expect(parseAddDeepLink('?add=true')).toEqual({ add: true })
  })

  it('parses a valid amount and trimmed category', () => {
    expect(parseAddDeepLink('?add=true&category=%20lunch%20&amount=5.80')).toEqual({
      add: true,
      amount: 5.8,
      category: 'lunch',
    })
  })

  it('truncates over-precise amounts to 2 decimals', () => {
    expect(parseAddDeepLink('?add=true&amount=5.809').amount).toBe(5.8)
  })

  it('omits non-positive or non-numeric amounts', () => {
    expect(parseAddDeepLink('?amount=-1').amount).toBeUndefined()
    expect(parseAddDeepLink('?amount=0').amount).toBeUndefined()
    expect(parseAddDeepLink('?amount=abc').amount).toBeUndefined()
  })

  it('omits an empty category', () => {
    expect(parseAddDeepLink('?add=true&category=%20').category).toBeUndefined()
  })
})

describe('resolveCategoryId', () => {
  it('matches a built-in id case-insensitively', () => {
    expect(resolveCategoryId('LUNCH', OPTIONS)).toBe('lunch')
  })

  it('matches a custom category by label case-insensitively', () => {
    expect(resolveCategoryId('groceries', OPTIONS)).toBe('cat_groceries_x7')
  })

  it('returns null for an unknown value', () => {
    expect(resolveCategoryId('petrol', OPTIONS)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(resolveCategoryId('   ', OPTIONS)).toBeNull()
  })
})

describe('amountToDigits', () => {
  it('formats integers without a decimal', () => {
    expect(amountToDigits(5)).toBe('5')
  })

  it('preserves up to two decimals', () => {
    expect(amountToDigits(5.8)).toBe('5.8')
    expect(amountToDigits(5.05)).toBe('5.05')
  })

  it('truncates extra precision', () => {
    expect(amountToDigits(5.809)).toBe('5.8')
  })

  it('returns "0" for non-positive or invalid input', () => {
    expect(amountToDigits(0)).toBe('0')
    expect(amountToDigits(-3)).toBe('0')
    expect(amountToDigits(NaN)).toBe('0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/deepLink.test.ts`
Expected: FAIL — `Failed to resolve import "./deepLink"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/deepLink.ts`:

```ts
// src/deepLink.ts
// Pure parsing/resolution for the quick-add deep link (?add=true&category=&amount=).
// No DOM dependency: callers pass location.search so this stays unit-testable.

export interface AddDeepLink {
  add: boolean
  amount?: number
  category?: string
}

// Truncate to 2 decimals without floating-point drift (5.8*100 = 579.9999… in JS).
function truncate2(n: number): number {
  return Math.floor(n * 100 + 1e-6) / 100
}

export function parseAddDeepLink(search: string): AddDeepLink {
  const params = new URLSearchParams(search)
  const result: AddDeepLink = { add: params.get('add') === 'true' }

  const rawAmount = params.get('amount')
  if (rawAmount !== null) {
    const n = Number(rawAmount)
    if (Number.isFinite(n) && n > 0) result.amount = truncate2(n)
  }

  const rawCategory = params.get('category')
  if (rawCategory !== null) {
    const trimmed = rawCategory.trim()
    if (trimmed) result.category = trimmed
  }

  return result
}

// Case-insensitive match against each option's id first, then its label.
export function resolveCategoryId(
  raw: string,
  options: ReadonlyArray<{ id: string; label: string }>,
): string | null {
  const needle = raw.trim().toLowerCase()
  if (!needle) return null
  const byId = options.find(o => o.id.toLowerCase() === needle)
  if (byId) return byId.id
  const byLabel = options.find(o => o.label.toLowerCase() === needle)
  return byLabel ? byLabel.id : null
}

// Number -> the `digits` string AddEntry seeds, honouring the <=2-decimal numpad rule.
export function amountToDigits(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  return String(truncate2(n))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/deepLink.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/deepLink.ts src/deepLink.test.ts
git commit -m "feat: pure deep-link parse/resolve helpers for quick-add presets"
```

---

### Task 2: `AddEntry` accepts prefill props

**Files:**
- Modify: `src/screens/AddEntry.tsx` (Props interface ~24-27; `digits`/`category` useState ~34,36; add import)
- Test: `src/screens/AddEntry.test.tsx` (add one test + a prefill render helper)

**Interfaces:**
- Consumes: `amountToDigits` from Task 1 (`src/deepLink.ts`).
- Produces: `AddEntry` now accepts `initialAmount?: number` and `initialCategory?: string | null`. Absent props → identical to today's behaviour (empty amount `'0'`, no category).

- [ ] **Step 1: Write the failing test**

In `src/screens/AddEntry.test.tsx`, add a render helper that passes prefill props and a test. Place near the existing `renderWithEntries`:

```tsx
function renderWithPrefill(props: { initialAmount?: number; initialCategory?: string | null }) {
  localStorage.setItem('budget_entries', '[]')
  localStorage.setItem('api_token', 'tok')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
  return render(
    <EntriesProvider>
      <AddEntry onSave={() => undefined} {...props} />
    </EntriesProvider>,
  )
}

describe('AddEntry prefill props', () => {
  it('seeds the amount and selects the matching category chip', () => {
    renderWithPrefill({ initialAmount: 5.8, initialCategory: 'lunch' })

    expect(screen.getByLabelText('Entered amount').textContent).toContain('5.80')
    expect(screen.getByRole('button', { name: /Lunch/ })).toHaveClass('chip--selected')
  })

  it('renders an empty amount and no selected chip without prefill', () => {
    renderWithPrefill({})

    expect(screen.getByLabelText('Entered amount').textContent).toContain('0.00')
    expect(screen.getByRole('button', { name: /Lunch/ })).not.toHaveClass('chip--selected')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/screens/AddEntry.test.tsx -t "prefill props"`
Expected: FAIL — amount shows `0.00` (props ignored) and the Lunch chip lacks `chip--selected`.

- [ ] **Step 3: Write minimal implementation**

In `src/screens/AddEntry.tsx`:

1. Add the import (next to the other local imports):

```tsx
import { amountToDigits } from '../deepLink'
```

2. Extend the `Props` interface:

```tsx
interface Props {
  initialDate?: string
  initialAmount?: number
  initialCategory?: string | null
  onSave: (saved?: SavedEntrySummary) => void
}
```

3. Update the component signature and the two seeded `useState` initializers:

```tsx
export default function AddEntry({ initialDate, initialAmount, initialCategory, onSave }: Props) {
  const today = sgtTodayString()
  const [digits, setDigits] = useState(() =>
    initialAmount && initialAmount > 0 ? amountToDigits(initialAmount) : '0',
  )
  const [animationCue, setAnimationCue] = useState({ key: '', version: 0 })
  const [category, setCategory] = useState<string | null>(initialCategory ?? null)
```

(Leave the rest of the component unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/screens/AddEntry.test.tsx`
Expected: PASS — the new prefill tests and all existing AddEntry tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AddEntry.tsx src/screens/AddEntry.test.tsx
git commit -m "feat: AddEntry accepts initialAmount/initialCategory prefill props"
```

---

### Task 3: Wire the deep link through `App` + document it

**Files:**
- Modify: `src/App.tsx` (`initialTab` ~38-41; `AppShell` hook order + prefill state; `handleSave` ~59-64; `handleTabChange` ~68-73; `handleAddForDate` ~81-84; the `tab === 'add'` render ~118)
- Modify: `README.md` (add a "Quick-add presets" note next to the Shortcuts setup)
- Test: `src/App.test.tsx` (add integration tests)

**Interfaces:**
- Consumes: `parseAddDeepLink`, `resolveCategoryId` from Task 1; `AddEntry`'s `initialAmount`/`initialCategory` props from Task 2; `buildCategoryOptions` (already imported in `App.tsx`).
- Produces: end-to-end behaviour — a `?add=true&category=&amount=` URL opens Add prefilled.

- [ ] **Step 1: Write the failing test**

In `src/App.test.tsx`, add integration tests (mirror the existing `?add=true` tests that use `window.history.replaceState`):

```tsx
it('prefills amount and category from the deep link', async () => {
  window.history.replaceState({}, '', '/?add=true&category=lunch&amount=5.80')
  render(<App />)

  expect(await screen.findByLabelText('Entered amount')).toHaveTextContent('5.80')
  expect(screen.getByRole('button', { name: /Lunch/ })).toHaveClass('chip--selected')
})

it('prefills the amount but selects no chip for an unknown category', async () => {
  window.history.replaceState({}, '', '/?add=true&category=petrol&amount=3.20')
  render(<App />)

  expect(await screen.findByLabelText('Entered amount')).toHaveTextContent('3.20')
  expect(screen.getByRole('button', { name: /Lunch/ })).not.toHaveClass('chip--selected')
})
```

Note: if `App.test.tsx` seeds a first-run budget so onboarding is skipped, follow that existing setup — these tests assume the app lands on Add, not on onboarding. Reuse whatever `localStorage`/token seeding the neighbouring `?add=true` test already does.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx -t "deep link"`
Expected: FAIL — amount shows `0.00` and no chip is selected, because `App` does not yet parse `category`/`amount`.

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`:

1. Add imports (next to existing local imports):

```tsx
import { parseAddDeepLink, resolveCategoryId } from './deepLink'
```

2. Replace `initialTab`:

```tsx
function initialTab(): Tab {
  return parseAddDeepLink(window.location.search).add ? 'add' : 'home'
}
```

3. In `AppShell`, move the two context hooks above the `useState` calls and add a one-shot `prefill` state seeded from the URL. The top of `AppShell` becomes:

```tsx
function AppShell() {
  const { entries, editEntry, removeEntry } = useEntries()
  const { customCategories, overrides, activeCurrency } = useBudgetConfig()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [prefill, setPrefill] = useState<{ amount?: number; category: string | null }>(() => {
    const link = parseAddDeepLink(window.location.search)
    const options = buildCategoryOptions(overrides, customCategories)
    return {
      amount: link.amount,
      category: link.category ? resolveCategoryId(link.category, options) : null,
    }
  })
  const [showOnboarding, setShowOnboarding] = useState(() =>
    shouldShowBudgetOnboarding(initialTab() === 'add'),
  )
  const [addEntryDate, setAddEntryDate] = useState<string | undefined>()
  const [settingsTool, setSettingsTool] = useState<'poker' | 'shared' | null>(null)
  const [settingsSubscreen, setSettingsSubscreen] = useState<'hub' | 'automatic'>('hub')
  const [toast, setToast] = useState<ToastEntry | null>(null)
  const activeEntries = entriesForCurrency(entries, activeCurrency)
  const categoryOptions = buildCategoryOptions(overrides, customCategories)
```

(Delete the now-duplicated `const { entries, ... } = useEntries()` and `const { customCategories, ... } = useBudgetConfig()` lines from their old mid-body position, and the old `const [tab, setTab] = useState<Tab>(initialTab)` line.)

4. Add a one-shot clear helper and call it wherever `addEntryDate` is set/cleared. Add near the other handlers:

```tsx
  const clearPrefill = useCallback(() => setPrefill({ category: null }), [])
```

Then update the three handlers:

```tsx
  function handleSave(saved?: SavedEntrySummary) {
    setTab('home')
    setAddEntryDate(undefined)
    clearPrefill()
    setToast(saved ?? null)
    window.history.replaceState({}, '', window.location.pathname)
  }

  function handleTabChange(nextTab: Tab) {
    setAddEntryDate(undefined)
    clearPrefill()
    if (nextTab !== 'settings') setSettingsTool(null)
    setSettingsSubscreen('hub')
    setTab(nextTab)
  }

  function handleAddForDate(date: string) {
    clearPrefill()
    setAddEntryDate(date)
    setTab('add')
  }
```

5. Pass the prefill into `AddEntry`:

```tsx
          {tab === 'add' && (
            <AddEntry
              initialDate={addEntryDate}
              initialAmount={prefill.amount}
              initialCategory={prefill.category}
              onSave={handleSave}
            />
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/App.test.tsx`
Expected: PASS — the new deep-link tests plus all existing App tests (including the plain `?add=true` test) stay green.

- [ ] **Step 5: Update the README**

In `README.md`, next to the existing iOS Shortcuts setup, add:

```markdown
### Quick-add presets (deep link)

The Add screen can be prefilled from the URL, so an iOS Shortcuts home-screen widget
can carry a one-tap preset:

`https://<app-url>/?add=true&category=<id-or-name>&amount=<number>`

- `category` matches a category by its name (case-insensitive), e.g. `lunch` or `Groceries`.
  An unknown name just leaves the category empty.
- `amount` is in your active wallet currency, up to 2 decimals.
- The entry is **prefilled, not auto-saved** — you review it and tap Save.

Example — a "Kopi" preset: `…/?add=true&category=lunch&amount=2.20`
```

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: PASS (whole suite green; note `src/screens/Settings.test.tsx` can flake under full-suite CPU load — re-run it in isolation if it fails).

```bash
git add src/App.tsx src/App.test.tsx README.md
git commit -m "feat: prefill Add screen from ?add=true&category=&amount= deep link"
```

---

## Self-Review

**Spec coverage:**
- Prefill `?add=true&category=&amount=` (Personal only) → Task 3 (wiring) + Task 2 (props). ✓
- Case-insensitive id-then-label category match → Task 1 `resolveCategoryId` + tests. ✓
- Amount finite/positive/2-dp-truncated → Task 1 `parseAddDeepLink`/`amountToDigits` + tests. ✓
- Unknown category → amount prefills, category empty → Task 3 second integration test. ✓
- Invalid amount → Add at 0 → Task 1 tests (`amount` omitted) + Task 2 empty-render test. ✓
- One-shot lifecycle (cleared on save/tab-change) → Task 3 `clearPrefill` in `handleSave`/`handleTabChange`/`handleAddForDate`. ✓
- Onboarding-first launch still applies prefill → prop-based prefill survives onboarding (state persists until save/tab-change); no code needed beyond Task 3. ✓
- No injection surface / no deps / no network → satisfied by design (state-only); no task introduces any. ✓
- README documentation → Task 3 Step 5. ✓
- Out of scope (`?screen=`, `note=`, auto-save, currency in link) → not implemented. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `AddDeepLink`, `parseAddDeepLink`, `resolveCategoryId`, `amountToDigits` names/signatures identical across Tasks 1-3. `AddEntry` props `initialAmount?: number`, `initialCategory?: string | null` consistent between Task 2 (definition) and Task 3 (usage). `prefill` state shape `{ amount?: number; category: string | null }` consistent within Task 3. `buildCategoryOptions` returns `{ id; label; icon }[]`, structurally compatible with `resolveCategoryId`'s `{ id; label }[]` parameter. ✓
