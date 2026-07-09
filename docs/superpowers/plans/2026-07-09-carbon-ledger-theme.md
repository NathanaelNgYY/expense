# Carbon Ledger Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Carbon Ledger theme to every existing Budget Tracker surface without changing features or business logic.

**Architecture:** Keep `src/index.css` as the structural baseline and add a focused `src/carbon-ledger.css` override layer imported last from `src/main.tsx`. This keeps behavior and layout contracts stable while centralizing the new palette, typography hierarchy, shared primitives, and screen-specific treatments. Add a small CSS contract test and rely on the existing component suites for behavior preservation.

**Tech Stack:** React 19, TypeScript 6, Vite 8, CSS, Vitest, Testing Library, Playwright CLI

---

## File Map

- Create `src/carbon-ledger.css`: Carbon Ledger tokens and visual overrides for all app surfaces.
- Create `src/carbonLedgerTheme.test.ts`: static theme contract covering tokens and required surfaces.
- Modify `src/main.tsx`: import the Carbon Ledger override after the existing structural stylesheet.
- Do not modify state, compute, storage, API, Supabase, context, or screen behavior modules.

### Task 1: Establish the Theme Contract

**Files:**
- Create: `src/carbonLedgerTheme.test.ts`
- Create: `src/carbon-ledger.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing CSS contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./carbon-ledger.css', import.meta.url), 'utf8')

describe('Carbon Ledger theme', () => {
  it('defines the approved palette and typography tokens', () => {
    expect(css).toContain('--carbon-canvas: #1a1b1c')
    expect(css).toContain('--carbon-surface: #202223')
    expect(css).toContain('--carbon-text: #ece9e4')
    expect(css).toContain('--carbon-copper: #c98d68')
    expect(css).toContain('--carbon-display:')
  })

  it.each([
    '.tab-bar',
    '.summary-card',
    '.amount-display',
    '.entry-list',
    '.settings-input',
    '.poker-stats-card',
    '.shared-budget-card',
    '.shared-auth',
  ])('covers the %s surface', selector => {
    expect(css).toContain(selector)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails because the stylesheet does not exist**

Run: `npm test -- carbonLedgerTheme`

Expected: FAIL with an error resolving or opening `src/carbon-ledger.css`.

- [ ] **Step 3: Create the token scaffold**

Create `src/carbon-ledger.css` with this opening contract:

```css
:root {
  --carbon-canvas: #1a1b1c;
  --carbon-surface: #202223;
  --carbon-surface-raised: #292b2c;
  --carbon-text: #ece9e4;
  --carbon-text-secondary: #aaa59e;
  --carbon-text-tertiary: #7f7c77;
  --carbon-separator: #3a3b3c;
  --carbon-copper: #c98d68;
  --carbon-copper-pressed: #ad7352;
  --carbon-sage: #79a58a;
  --carbon-amber: #c7a66a;
  --carbon-brick: #ca766b;
  --carbon-display: Georgia, "Times New Roman", serif;

  --bg: var(--carbon-canvas);
  --bg-elev: var(--carbon-surface);
  --bg-elev-2: var(--carbon-surface-raised);
  --text: var(--carbon-text);
  --text-secondary: var(--carbon-text-secondary);
  --text-tertiary: var(--carbon-text-tertiary);
  --primary: var(--carbon-copper);
  --blue: var(--carbon-copper);
  --green: var(--carbon-sage);
  --warning: var(--carbon-amber);
  --yellow: var(--carbon-amber);
  --red: var(--carbon-brick);
  --separator: var(--carbon-separator);
  --fill: #303233;
}
```

- [ ] **Step 4: Import the override after the baseline stylesheet**

Update `src/main.tsx`:

```ts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './carbon-ledger.css'
import App from './App'
```

- [ ] **Step 5: Run the contract test and verify the token assertions pass while surface assertions fail**

Run: `npm test -- carbonLedgerTheme`

Expected: FAIL only for the required selectors that are not yet in the override file.

### Task 2: Theme Shared Primitives and Core Budget Screens

**Files:**
- Modify: `src/carbon-ledger.css`
- Test: `src/carbonLedgerTheme.test.ts`
- Existing behavior tests: `src/App.test.tsx`, `src/screens/Dashboard.test.tsx`, `src/screens/AddEntry.test.tsx`, `src/screens/History.test.tsx`, `src/screens/Settings.test.tsx`

- [ ] **Step 1: Add global, navigation, typography, control, and focus overrides**

Add explicit blocks for:

```css
html,
body,
#root,
.app {
  background: var(--carbon-canvas);
}

body {
  color: var(--carbon-text);
}

.screen {
  background: var(--carbon-canvas);
}

.screen-title,
.section-title {
  color: var(--carbon-text-secondary);
  letter-spacing: 0.035em;
}

.tab-bar {
  background: #181a1b;
  border-top: 1px solid var(--carbon-separator);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tab-bar button {
  color: var(--carbon-text-tertiary);
}

.tab-bar button.active {
  color: var(--carbon-copper);
}

button:focus-visible,
input:focus-visible,
[role="button"]:focus-visible {
  outline: 2px solid var(--carbon-copper);
  outline-offset: 2px;
}
```

Style `.card`, `.ios-list`, `.entry-list`, `.scope-switch`, `.progress-bar`, buttons, inputs, chips, date inputs, numpad keys, icon pickers, and empty/error/offline states with the token set. Use fine separators and no wide decorative shadows.

- [ ] **Step 2: Add the Home hierarchy**

Override `.dashboard-header`, `.month-label`, `.income-label`, `.summary-card`, `.summary-amount--large`, `.summary-label`, `.summary-pill`, `.forecast-card`, `.forecast-value`, `.buffer-card`, `.category-row-card`, `.category-row-toggle`, `.category-expense-list`, `.week-strip`, and progress states.

Required hierarchy:

```css
.summary-amount--large,
.forecast-value,
.amount-display {
  font-family: var(--carbon-display);
  letter-spacing: -0.025em;
}

.summary-amount--large {
  font-size: 44px;
  line-height: 1;
}

.category-row-card {
  border-radius: 0;
  border-width: 0 0 1px;
  border-color: var(--carbon-separator);
  background: transparent;
  padding-inline: 0;
}
```

Retain semantic over-budget, committed, warning, and success colors.

- [ ] **Step 3: Add Add Expense, History, and Settings overrides**

Cover `.amount-display`, `.amount-glyph`, `.numpad`, `.numpad-key`, `.chips`, `.chip`, `.date-input-shell`, `.month-nav`, `.history-summary`, `.week-bar`, `.month-review-card`, `.month-change-card`, `.breakdown-row`, `.entry-row`, `.entry-edit-panel`, `.settings-header`, `.back-btn`, `.settings-row`, `.settings-input`, `.category-add-form`, `.category-edit-btn`, `.category-remove-btn`, `.settings-total`, and `.settings-divider`.

Keep selected chips copper, destructive controls brick, and all editable fields visibly bounded against charcoal.

- [ ] **Step 4: Complete the contract selectors**

Ensure `src/carbon-ledger.css` contains concrete rules for:

```css
.summary-card {}
.amount-display {}
.entry-list {}
.settings-input {}
```

Remove the empty braces by folding each selector into the real override blocks.

- [ ] **Step 5: Run core behavior and theme tests**

Run:

```powershell
npm test -- carbonLedgerTheme App Dashboard AddEntry History Settings
```

Expected: all selected suites PASS.

- [ ] **Step 6: Commit the core theme**

```powershell
git add src/main.tsx src/carbon-ledger.css src/carbonLedgerTheme.test.ts
git commit -m "feat: apply Carbon Ledger core theme"
```

### Task 3: Extend Carbon Ledger to Poker and Shared Budgets

**Files:**
- Modify: `src/carbon-ledger.css`
- Existing behavior tests: `src/screens/Poker.test.tsx`, `src/sharedBudgets/SharedScreen.test.tsx`, `src/sharedBudgets/BudgetList.test.tsx`, `src/sharedBudgets/BudgetDetail.test.tsx`, `src/sharedBudgets/AuthGate.test.tsx`, `src/sharedBudgets/OwnerTools.test.tsx`

- [ ] **Step 1: Add Poker surface overrides**

Cover `.poker-stats-card`, `.poker-stats-row`, `.poker-stat`, `.poker-pnl`, `.bankroll-card`, `.bankroll-trend`, `.bankroll-trend-point`, `.bankroll-card-footer`, `.log-session`, `.time-row`, `.custom-stakes-row`, `.result-toggle`, and `.result-toggle-btn`.

Rules:

- editorial serif is limited to P&L and hourly-rate values
- wins use muted sage and losses use brick
- bankroll bars use semantic colors without glow
- Log Session uses the same inputs, chips, copper focus state, and primary button as Add Expense

- [ ] **Step 2: Add Shared Budget surface overrides**

Cover `.shared-auth`, `.shared-form`, `.shared-budget-cards`, `.shared-budget-card`, `.shared-budget-name`, `.shared-actions`, `.shared-detail-header`, `.shared-progress`, `.member-total-row`, `.member-row`, `.shared-entry-row`, `.invite-row`, `.invite-code`, `.owner-tools`, `.shared-signout`, `.form-error`, `.offline-banner`, and `.shared-dashboard`.

Rules:

- auth and setup screens use the same field and button vocabulary
- budget cards use restrained containment and 12 to 16 pixel corners
- invite codes use a readable monospace stack on the raised charcoal surface
- owner/destructive actions retain distinct semantic styling
- member, category, and entry lists use the same ledger separators as personal history

- [ ] **Step 3: Run Poker and Shared behavior suites**

Run:

```powershell
npm test -- Poker SharedScreen BudgetList BudgetDetail AuthGate OwnerTools
```

Expected: all selected suites PASS.

- [ ] **Step 4: Commit Poker and Shared theme coverage**

```powershell
git add src/carbon-ledger.css
git commit -m "feat: extend Carbon Ledger to poker and shared budgets"
```

### Task 4: Automated Regression Verification

**Files:**
- Modify only if a visual contract issue is found: `src/carbon-ledger.css`

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests PASS with no new unhandled errors.

- [ ] **Step 2: Run ESLint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully and produce `dist/`.

- [ ] **Step 4: Run the Impeccable detector**

Run:

```powershell
node .agents/skills/impeccable/scripts/detect.mjs --json src/index.css src/carbon-ledger.css
```

Expected: no high-severity contrast, overflow, gradient-text, side-stripe, or decorative-glow findings in the new theme.

### Task 5: Browser Verification Across Every Surface

**Files:**
- Modify only for defects found: `src/carbon-ledger.css`
- Generated evidence: `.playwright-cli/` and `.superpowers/brainstorm/` remain untracked

- [ ] **Step 1: Start the Vite app**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite reports a local URL, normally `http://127.0.0.1:5173`.

- [ ] **Step 2: Open a dedicated Playwright session at iPhone width**

Run:

```powershell
playwright-cli -s=carbon-ledger open http://127.0.0.1:5173
playwright-cli -s=carbon-ledger resize 390 844
```

Expected: Home loads with no console error.

- [ ] **Step 3: Exercise and capture every main tab**

For Home, Add, History, Poker, and Shared:

- navigate using accessible tab buttons
- capture a screenshot
- inspect the snapshot for clipped values or missing controls
- read `playwright-cli -s=carbon-ledger console error`

Also open Settings, expand a Home category, enter an Add amount, open a History edit panel, open Poker Log Session, and inspect every reachable Shared state.

- [ ] **Step 4: Repeat the layout check at the app-width ceiling**

Run:

```powershell
playwright-cli -s=carbon-ledger resize 430 932
```

Expected: no horizontal overflow, clipped money values, wrapped tab labels, or obscured primary actions.

- [ ] **Step 5: Verify reduced motion**

Run:

```powershell
playwright-cli -s=carbon-ledger run-code "async page => { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); }"
```

Expected: content remains visible and usable; no essential state depends on animation.

- [ ] **Step 6: Close the browser session**

Run: `playwright-cli -s=carbon-ledger close`

- [ ] **Step 7: Commit final visual fixes if any**

```powershell
git add src/carbon-ledger.css
git commit -m "fix: polish Carbon Ledger responsive states"
```

Skip this commit when browser verification requires no code changes.
