# Runtime Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three persistent, dark-first themes that change both visual styling and the composition of Home, Add Expense, History, and Poker, selected from Settings.

**Architecture:** A typed theme registry and `ThemeProvider` own validation, persistence, and the document root attribute. Existing screen components remain the sole owners of data and behavior; theme-aware semantic wrappers and CSS rearrange their presentation, while small shared visualization components provide the Deep Sea budget ring and theme-specific summaries without duplicating calculations.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS custom properties, localStorage.

---

## File Structure

- Create `src/theme/themeRegistry.ts`: theme identifiers, metadata, validation, storage helpers.
- Create `src/theme/ThemeContext.tsx`: global theme state and root-attribute synchronization.
- Create `src/theme/ThemePicker.tsx`: accessible Settings preview cards.
- Create `src/theme/ThemePicker.test.tsx`: selection and accessibility behavior.
- Create `src/theme/ThemeContext.test.tsx`: initialization, persistence, fallback, and failure handling.
- Create `src/components/BudgetUsageRing.tsx`: accessible spent-versus-budget ring.
- Create `src/components/BudgetUsageRing.test.tsx`: percentage and labels.
- Create `src/themes.css`: semantic tokens, Settings picker, and theme-specific screen composition.
- Modify `src/App.tsx`: install `ThemeProvider`.
- Modify `src/main.tsx`: import theme CSS.
- Modify `src/screens/Settings.tsx`: render Appearance section and status feedback.
- Modify `src/screens/Settings.test.tsx`: wrap Settings in `ThemeProvider` and test all choices.
- Modify `src/screens/Dashboard.tsx`: add semantic layout hooks and budget usage visualization.
- Modify `src/screens/AddEntry.tsx`: add semantic layout regions.
- Modify `src/screens/History.tsx`: add semantic layout regions and theme-safe calendar color.
- Modify `src/screens/Poker.tsx`: add semantic layout regions.
- Modify `src/App.test.tsx`: assert stored theme initialization.

### Task 1: Typed theme registry and persistence

**Files:**
- Create: `src/theme/themeRegistry.ts`
- Create: `src/theme/ThemeContext.test.tsx`
- Create: `src/theme/ThemeContext.tsx`

- [ ] **Step 1: Write failing provider tests**

Create tests covering default initialization, valid stored initialization, invalid-value fallback, selection persistence, root attribute updates, and storage failure:

```tsx
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

function Probe() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <output aria-label="theme">{theme}</output>
      <button onClick={() => setTheme('copper-current')}>Copper</button>
    </>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to Deep Sea and applies it to the document', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByLabelText('theme')).toHaveTextContent('deep-sea')
    expect(document.documentElement).toHaveAttribute('data-theme', 'deep-sea')
  })

  it('restores a valid stored theme', () => {
    localStorage.setItem('budget-tracker-theme-v1', 'berry-circuit')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByLabelText('theme')).toHaveTextContent('berry-circuit')
  })

  it('rejects an invalid stored theme', () => {
    localStorage.setItem('budget-tracker-theme-v1', 'unknown')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByLabelText('theme')).toHaveTextContent('deep-sea')
  })

  it('updates the root and storage after selection', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    act(() => screen.getByRole('button', { name: 'Copper' }).click())
    expect(document.documentElement).toHaveAttribute('data-theme', 'copper-current')
    expect(localStorage.getItem('budget-tracker-theme-v1')).toBe('copper-current')
  })

  it('keeps switching when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })
    render(<ThemeProvider><Probe /></ThemeProvider>)
    act(() => screen.getByRole('button', { name: 'Copper' }).click())
    expect(document.documentElement).toHaveAttribute('data-theme', 'copper-current')
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run src/theme/ThemeContext.test.tsx
```

Expected: FAIL because `ThemeContext` does not exist.

- [ ] **Step 3: Implement the registry**

```ts
export const THEME_STORAGE_KEY = 'budget-tracker-theme-v1'

export const THEMES = [
  {
    id: 'deep-sea',
    name: 'Deep Sea Revised',
    description: 'Calm aqua, circular progress, and soft spatial grouping.',
    swatches: ['#061012', '#52d8d0', '#eafaf9'],
  },
  {
    id: 'copper-current',
    name: 'Copper Current',
    description: 'Burnished orange, ledger geometry, and dense financial data.',
    swatches: ['#100d09', '#ff9147', '#fff5e9'],
  },
  {
    id: 'berry-circuit',
    name: 'Berry Circuit',
    description: 'Deep plum, acid-lime signals, and rounded ribbon layouts.',
    swatches: ['#170a18', '#d7ff6f', '#fff2ff'],
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export const DEFAULT_THEME: ThemeId = 'deep-sea'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some(theme => theme.id === value)
}

export function readStoredTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeId(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}
```

- [ ] **Step 4: Implement the provider**

```tsx
import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react'
import { DEFAULT_THEME, THEME_STORAGE_KEY, readStoredTheme, type ThemeId } from './themeRegistry'

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() =>
    typeof window === 'undefined' ? DEFAULT_THEME : readStoredTheme(),
  )

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  function setTheme(nextTheme: ThemeId) {
    setThemeState(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // The active session can still use the selected theme.
    }
  }

  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npx vitest run src/theme/ThemeContext.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/theme/themeRegistry.ts src/theme/ThemeContext.tsx src/theme/ThemeContext.test.tsx
git commit -m "feat: add persistent theme provider"
```

### Task 2: Settings theme picker

**Files:**
- Create: `src/theme/ThemePicker.tsx`
- Create: `src/theme/ThemePicker.test.tsx`
- Modify: `src/screens/Settings.tsx`
- Modify: `src/screens/Settings.test.tsx`

- [ ] **Step 1: Write failing picker tests**

```tsx
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeContext'
import ThemePicker from './ThemePicker'

describe('ThemePicker', () => {
  it('renders every theme as an accessible radio', () => {
    render(<ThemeProvider><ThemePicker /></ThemeProvider>)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Deep Sea Revised/i })).toBeChecked()
  })

  it('selects a theme and announces persistence', () => {
    render(<ThemeProvider><ThemePicker /></ThemeProvider>)
    act(() => screen.getByRole('radio', { name: /Berry Circuit/i }).click())
    expect(screen.getByRole('radio', { name: /Berry Circuit/i })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Theme applied and saved')
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run src/theme/ThemePicker.test.tsx
```

Expected: FAIL because `ThemePicker` does not exist.

- [ ] **Step 3: Implement the picker**

```tsx
import { useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from './ThemeContext'
import { THEMES, type ThemeId } from './themeRegistry'

export default function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const [message, setMessage] = useState('')

  function chooseTheme(nextTheme: ThemeId) {
    setTheme(nextTheme)
    setMessage('Theme applied and saved')
  }

  return (
    <section className="theme-picker" aria-labelledby="appearance-title">
      <h3 id="appearance-title" className="section-title">Appearance</h3>
      <div className="theme-options" role="radiogroup" aria-label="App theme">
        {THEMES.map(option => {
          const selected = option.id === theme
          return (
            <label key={option.id} className={`theme-option${selected ? ' theme-option--selected' : ''}`}>
              <input
                type="radio"
                name="app-theme"
                value={option.id}
                checked={selected}
                onChange={() => chooseTheme(option.id)}
              />
              <span className="theme-preview" aria-hidden="true">
                <span className="theme-preview__hero" />
                <span className="theme-preview__bar" />
                <span className="theme-preview__bar" />
              </span>
              <span className="theme-option__copy">
                <strong>{option.name}</strong>
                <span className="theme-swatches" aria-hidden="true">
                  {option.swatches.map(color => <i key={color} style={{ backgroundColor: color }} />)}
                </span>
                <small>{option.description}</small>
              </span>
              <span className="theme-option__check" aria-hidden="true">
                {selected && <Check size={14} strokeWidth={3} />}
              </span>
            </label>
          )
        })}
      </div>
      <p className="theme-status" role="status">{message}</p>
    </section>
  )
}
```

- [ ] **Step 4: Add the picker to Settings**

Import `ThemePicker` and render it immediately after the Settings header, before the personal/shared scope switch:

```tsx
import ThemePicker from '../theme/ThemePicker'

// after .settings-header
<ThemePicker />
```

Wrap every Settings test render helper with `ThemeProvider`:

```tsx
<ThemeProvider>
  <EntriesProvider>
    <Settings onBack={onBack} />
  </EntriesProvider>
</ThemeProvider>
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npx vitest run src/theme/ThemePicker.test.tsx src/screens/Settings.test.tsx
```

Expected: all picker and Settings tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/theme/ThemePicker.tsx src/theme/ThemePicker.test.tsx src/screens/Settings.tsx src/screens/Settings.test.tsx
git commit -m "feat: add theme picker to settings"
```

### Task 3: Global theme installation and semantic palettes

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Create: `src/themes.css`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write a failing App test**

```tsx
it('restores the selected theme on app startup', async () => {
  localStorage.setItem('budget-tracker-theme-v1', 'copper-current')
  await act(async () => render(<App />))
  expect(document.documentElement).toHaveAttribute('data-theme', 'copper-current')
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npx vitest run src/App.test.tsx
```

Expected: new test fails because `App` has no provider.

- [ ] **Step 3: Install the provider**

```tsx
import { ThemeProvider } from './theme/ThemeContext'

export default function App() {
  return (
    <ThemeProvider>
      <EntriesProvider>
        <SharedBudgetsProvider>
          <AppShell />
        </SharedBudgetsProvider>
      </EntriesProvider>
    </ThemeProvider>
  )
}
```

Import `./themes.css` after `./carbon-ledger.css` in `src/main.tsx`.

- [ ] **Step 4: Create semantic palette blocks**

`src/themes.css` begins with:

```css
:root,
[data-theme='deep-sea'] {
  --bg: #061012;
  --bg-elev: #0d1d20;
  --bg-elev-2: #12282c;
  --text: #eafaf9;
  --text-secondary: #9ab8b9;
  --text-tertiary: #789597;
  --primary: #52d8d0;
  --green: #72dfa5;
  --red: #ff7b79;
  --warning: #f1c66a;
  --separator: #214044;
  --fill: #102528;
  --theme-primary-contrast: #031413;
  --theme-card-radius: 14px;
  color-scheme: dark;
}

[data-theme='copper-current'] {
  --bg: #100d09;
  --bg-elev: #1b1711;
  --bg-elev-2: #262016;
  --text: #fff5e9;
  --text-secondary: #c2af97;
  --text-tertiary: #9b876f;
  --primary: #ff9147;
  --green: #9cdda4;
  --red: #ff7269;
  --warning: #ffc05e;
  --separator: #413629;
  --fill: #211a12;
  --theme-primary-contrast: #1b0900;
  --theme-card-radius: 4px;
}

[data-theme='berry-circuit'] {
  --bg: #170a18;
  --bg-elev: #261329;
  --bg-elev-2: #321937;
  --text: #fff2ff;
  --text-secondary: #cfb3d0;
  --text-tertiary: #a78aaa;
  --primary: #d7ff6f;
  --green: #d7ff6f;
  --red: #ff7d9b;
  --warning: #ffd56f;
  --separator: #4c2b50;
  --fill: #2c1730;
  --theme-primary-contrast: #111800;
  --theme-card-radius: 15px;
}
```

Add shared theme-picker styling with visible focus, 44px targets, radio inputs that remain semantically present, palette-specific preview variables, and reduced-motion fallbacks.

- [ ] **Step 5: Run App tests and verify GREEN**

Run:

```bash
npx vitest run src/App.test.tsx src/theme
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/main.tsx src/themes.css src/App.test.tsx
git commit -m "feat: install global theme palettes"
```

### Task 4: Theme-specific screen composition

**Files:**
- Create: `src/components/BudgetUsageRing.tsx`
- Create: `src/components/BudgetUsageRing.test.tsx`
- Modify: `src/screens/Dashboard.tsx`
- Modify: `src/screens/AddEntry.tsx`
- Modify: `src/screens/History.tsx`
- Modify: `src/screens/Poker.tsx`
- Modify: `src/themes.css`

- [ ] **Step 1: Write the failing budget-ring test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BudgetUsageRing from './BudgetUsageRing'

describe('BudgetUsageRing', () => {
  it('shows spent amount, total budget, and percentage', () => {
    render(<BudgetUsageRing spent={842} total={1320} />)
    expect(screen.getByText('64%')).toBeInTheDocument()
    expect(screen.getByText('S$842.00 / S$1,320.00')).toBeInTheDocument()
    expect(screen.getByLabelText('64% of monthly budget spent')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npx vitest run src/components/BudgetUsageRing.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the ring**

```tsx
interface Props {
  spent: number
  total: number
}

export default function BudgetUsageRing({ spent, total }: Props) {
  const percentage = total > 0 ? Math.max(0, Math.round((spent / total) * 100)) : 0
  const visualPercentage = Math.min(100, percentage)
  return (
    <div
      className="budget-usage-ring"
      role="img"
      aria-label={`${percentage}% of monthly budget spent`}
      style={{ '--budget-progress': `${visualPercentage}%` } as React.CSSProperties}
    >
      <span className="budget-usage-ring__inner">
        <strong>{percentage}%</strong>
        <small>S${spent.toFixed(2)} / S${total.toFixed(2)}</small>
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Add semantic layout regions**

Add `theme-screen` plus screen-specific hooks:

```tsx
<div className="screen dashboard theme-screen theme-screen--home">
<div className="screen add-entry theme-screen theme-screen--add">
<div className="screen history theme-screen theme-screen--history">
<div className="screen poker theme-screen theme-screen--poker">
```

Wrap existing Add Expense regions:

```tsx
<div className="add-entry__amount">...</div>
<div className="add-entry__keypad">...</div>
<div className="add-entry__categories">...</div>
<div className="add-entry__details">...</div>
```

Wrap History calendar, backfill, summary, weekly section, insights, and entry list in semantic region classes. Wrap Poker hero, insights, trend, sessions, and action similarly.

On the personal Home dashboard, add:

```tsx
<BudgetUsageRing spent={monthTotal} total={customBudgetTotal(config, customCategories)} />
```

inside the main summary area. Keep its amount and text visible in every theme; CSS controls whether it is radial, compact, or paired with a vertical meter.

- [ ] **Step 5: Implement layout variants in CSS**

Use theme selectors rather than conditional business markup:

```css
[data-theme='deep-sea'] .theme-screen--home .budget-usage-ring { display: grid; }
[data-theme='deep-sea'] .theme-screen--add { --add-layout: 'amount' 'categories' 'keypad' 'details'; }

[data-theme='copper-current'] .theme-screen--home .summary-card {
  display: grid;
  grid-template-columns: 1.25fr .75fr;
  border-radius: 4px;
}
[data-theme='copper-current'] .theme-screen--add {
  display: grid;
  grid-template-columns: .78fr 1.22fr;
  grid-template-areas:
    'title title'
    'amount amount'
    'categories keypad'
    'details details';
}
[data-theme='copper-current'] .theme-screen--history .cal-grid { order: 2; }
[data-theme='copper-current'] .theme-screen--poker .poker-stats-card { border-radius: 3px; }

[data-theme='berry-circuit'] .theme-screen--home .summary-card {
  margin-inline: -4px;
  border-radius: 16px;
}
[data-theme='berry-circuit'] .theme-screen--add {
  display: flex;
  flex-direction: column;
}
[data-theme='berry-circuit'] .add-entry__categories { order: 1; }
[data-theme='berry-circuit'] .add-entry__amount { order: 2; }
[data-theme='berry-circuit'] .add-entry__keypad { order: 3; }
[data-theme='berry-circuit'] .theme-screen--history .week-bar { border-radius: 16px; }
[data-theme='berry-circuit'] .theme-screen--poker .bankroll-card { order: -1; }
```

Complete selectors must preserve mobile single-column scrolling, the fixed tab-bar inset, visible controls, and current state styles. Replace the History calendar’s hard-coded amber rgba with `color-mix(in srgb, var(--primary) calc(var(--heat) * 100%), transparent)` using a `--heat` custom property so all palettes render correctly.

- [ ] **Step 6: Run focused screen tests**

Run:

```bash
npx vitest run src/components/BudgetUsageRing.test.tsx src/screens/Dashboard.test.tsx src/screens/AddEntry.test.tsx src/screens/History.test.tsx src/screens/Poker.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/BudgetUsageRing.tsx src/components/BudgetUsageRing.test.tsx src/screens/Dashboard.tsx src/screens/AddEntry.tsx src/screens/History.tsx src/screens/Poker.tsx src/themes.css
git commit -m "feat: add theme-specific screen layouts"
```

### Task 5: Full verification and visual QA

**Files:**
- Modify if required by findings: `src/themes.css`, theme components, screen tests.

- [ ] **Step 1: Run all automated checks**

```bash
npm test
npm run lint
npm run build
```

Expected: zero test failures, zero lint errors, successful TypeScript and Vite production build.

- [ ] **Step 2: Run the app and inspect all themes**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

At mobile width, inspect Home, Add, History, Poker, and Settings under:

- `data-theme="deep-sea"`
- `data-theme="copper-current"`
- `data-theme="berry-circuit"`

Verify distinct palettes and compositions, no horizontal overflow, no tab-bar overlap, correct Deep Sea ring values, and readable text.

- [ ] **Step 3: Verify persistence and accessibility**

Choose each theme in Settings, refresh, and confirm it remains active. Tab through all cards and controls, verify the selected state is announced, confirm theme changes do not reset the active Settings screen, and verify reduced-motion behavior.

- [ ] **Step 4: Commit any QA corrections**

```bash
git add src
git commit -m "fix: polish runtime theme variants"
```

