# Carbon Ledger Theme Design

## Goal
Restyle the existing Budget Tracker PWA with the approved Carbon Ledger visual language while preserving every existing feature and behavior. The redesign covers Home, Add, History, Settings, Poker, Shared Budgets, authentication, forms, empty states, loading states, confirmation states, and navigation.

This is a theme and presentation migration. It is not a feature rewrite.

## Preservation Contract
The implementation must not change:
- routes, URL parameters, or deep-link behavior
- tab names, tab order, or navigation destinations
- calculations, budgets, forecasts, poker statistics, or shared-budget totals
- storage formats, API calls, Supabase behavior, authentication, or offline behavior
- form fields, validation rules, save flows, edit flows, or delete flows
- visible feature availability
- accessibility labels relied on by tests
- existing test expectations unless a test asserts a purely visual class that must change

Component markup may be adjusted only where needed for visual hierarchy or accessibility. Existing handlers and data flow remain intact.

## Visual Direction
Carbon Ledger is a restrained dark product interface inspired by a carefully maintained personal ledger.
- Backgrounds use charcoal rather than pure black.
- Surfaces are separated primarily by spacing and fine rules, with cards reserved for grouped controls or data that benefits from containment.
- Warm copper is the single interaction accent.
- Positive and negative financial states retain distinct semantic colors, tuned to feel at home in the Carbon Ledger palette.
- Editorial serif type is used only for important monetary totals and selected page headings.
- Controls, labels, body copy, navigation, forms, and dense data remain in the existing system sans stack for clarity.
- Corners are restrained at 8 to 16 pixels. Pills remain limited to category filters and compact statuses.
- Motion remains short and functional. Existing amount-entry and state-transition animations are retained, with colors and easing aligned to the new theme.

## Theme Tokens
The global CSS variables will become the single source of truth:
- canvas: charcoal near #1a1b1c
- raised surface: slightly lighter charcoal near #202223
- secondary surface: near #292b2c
- primary text: warm off-white near #ece9e4
- secondary text: warm gray near #a8a39b
- separator: low-contrast warm gray
- primary accent: muted copper near #c98d68
- accent pressed/selected: a darker copper tone
- success: muted sage green
- warning: subdued amber
- danger: softened brick red

Exact values may be adjusted during browser verification to meet WCAG AA contrast.

## Screen Treatment

### Home
The existing Home information architecture and all personal/shared scope controls remain. The main monthly total and safe-to-spend figure receive the editorial hierarchy shown in the selected mockup. Category content becomes quieter ledger rows with fine dividers and slim copper or semantic progress indicators. Expandable expenses, delete confirmation, buffer behavior, forecasts, and uncategorized entries remain available.

### Add Expense
The existing custom numpad, category selection, date, note, editing behavior, and save flow remain. The amount becomes the dominant serif element. Category chips use copper only for the selected state. Keypad separation relies on rules or low-contrast surfaces. The save action is a solid copper control with dark readable text.

### History
All current charts, filters, insights, editing, import-derived entries, and grouping remain. Transaction groups use ledger-like date headings and rules. Data visualizations adopt the charcoal, copper, sage, amber, and brick palette without changing their meaning.

### Settings
All budget, category, API token, CSV, reset, and shared-budget settings remain. Forms use consistent charcoal inputs, visible labels, copper focus rings, and warm neutral dividers. Destructive controls stay brick red and visually distinct from primary actions.

### Poker
All session logging and calculations remain. Total P&L and hourly rate retain semantic gain/loss colors. Bankroll insights, trend visualization, session list, empty state, and Log Session flow use the Carbon Ledger tokens and typography. Poker does not become a separate casino-style theme.

### Shared Budgets
Configuration notices, authentication, display-name setup, budget list, budget detail, members, categories, owner tools, entries, invitations, offline state, and all forms use the same Carbon Ledger system. Shared Budgets does not receive a separate blue or Supabase-themed surface.

### Navigation
The existing five-tab structure remains unchanged. The tab bar becomes an opaque charcoal surface with a fine top rule. Inactive items use warm gray; the active tab uses copper. Icons and labels retain their current size and accessible button behavior.

## Responsive and Platform Behavior
- Preserve the current iPhone-first layout and safe-area handling.
- Keep the existing 430-pixel app width behavior on larger screens unless a screen already intentionally expands.
- Maintain 44-pixel minimum touch targets.
- Prevent monetary values, category names, member names, notes, and translated browser text from overflowing.
- Preserve reduced-motion behavior and add it where any newly styled transition requires it.
- The app remains fully usable when browser font scaling or narrow mobile widths increase text wrapping.

## Accessibility
- Body text and form text target at least 4.5:1 contrast.
- Large text and essential graphical indicators target at least 3:1 contrast.
- Focus indicators are visible against every Carbon Ledger surface.
- Semantic status is never communicated by color alone.
- Existing ARIA labels, roles, keyboard interactions, and pressed/expanded states remain.
- Empty, loading, offline, error, and destructive confirmation states remain distinguishable.

## Implementation Boundaries
The preferred implementation is CSS-first:
- Replace and extend global theme tokens.
- Restyle shared primitives such as cards, lists, buttons, inputs, tab navigation, progress indicators, and screen headings.
- Add narrowly scoped class or markup changes only where a screen cannot express the approved hierarchy through CSS alone.
- Avoid changing React state, business logic, context providers, storage, or API modules.
- No new UI framework, component library, font package, or data dependency is required. A web font may be avoided in production in favor of a resilient serif fallback stack so the PWA remains fast and offline-friendly.

## Verification

### Automated verification
- run the complete Vitest suite
- run the production build
- run ESLint
- confirm existing accessible-name tests still pass

### Browser verification with Playwright CLI
- inspect Home, Add, History, Poker, and Shared tabs at iPhone width
- inspect Settings and all reachable form states
- exercise category expansion, scope switching, add-entry input, history editing, Poker logging, and reachable Shared flows
- check console errors
- check key layouts at a narrow mobile width and at the 430-pixel app width
- capture screenshots for every main tab

The implementation is complete only when all existing functionality remains reachable and the Carbon Ledger theme is visually consistent across every surface.

---

# Carbon Ledger Theme Implementation Plan

Architecture: Keep `src/index.css` as the structural baseline and add a focused `src/carbon-ledger.css` override layer imported last from `src/main.tsx`. This keeps behavior and layout contracts stable while centralizing the new palette, typography hierarchy, shared primitives, and screen-specific treatments. Add a small CSS contract test and rely on the existing component suites for behavior preservation.

Tech Stack: React 19, TypeScript 6, Vite 8, CSS, Vitest, Testing Library, Playwright CLI

## File Map
- Create `src/carbon-ledger.css`: Carbon Ledger tokens and visual overrides for all app surfaces.
- Create `src/carbonLedgerTheme.test.ts`: static theme contract covering tokens and required surfaces.
- Modify `src/main.tsx`: import the Carbon Ledger override after the existing structural stylesheet.
- Do not modify state, compute, storage, API, Supabase, context, or screen behavior modules.

## Task 1: Establish the Theme Contract

**Files:**
- Create: `src/carbonLedgerTheme.test.ts`
- Create: `src/carbon-ledger.css`
- Modify: `src/main.tsx`

### Step 1: Write the failing CSS contract test

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

### Step 2: Run the test and verify it fails because the stylesheet does not exist
Run: `npm test -- carbonLedgerTheme`
Expected: FAIL with an error resolving or opening `src/carbon-ledger.css`.

### Step 3: Create the token scaffold
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

### Step 4: Import the override after the baseline stylesheet
Update `src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './carbon-ledger.css'
import App from './App'
```

### Step 5: Run the contract test and verify the token assertions pass while surface assertions fail
Run: `npm test -- carbonLedgerTheme`
Expected: FAIL only for the required selectors that are not yet in the override file.

## Task 2: Theme Shared Primitives and Core Budget Screens

**Files:**
- Modify: `src/carbon-ledger.css`
- Test: `src/carbonLedgerTheme.test.ts`
- Existing behavior tests: `src/App.test.tsx`, `src/screens/Dashboard.test.tsx`, `src/screens/AddEntry.test.tsx`, `src/screens/History.test.tsx`, `src/screens/Settings.test.tsx`

### Step 1: Add global, navigation, typography, control, and focus overrides

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

### Step 2: Add the Home hierarchy
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

### Step 3: Add Add Expense, History, and Settings overrides
Cover `.amount-display`, `.amount-glyph`, `.numpad`, `.numpad-key`, `.chips`, `.chip`, `.date-input-shell`, `.month-nav`, `.history-summary`, `.week-bar`, `.month-review-card`, `.month-change-card`, `.breakdown-row`, `.entry-row`, `.entry-edit-panel`, `.settings-header`, `.back-btn`, `.settings-row`, `.settings-input`, `.category-add-form`, `.category-edit-btn`, `.category-remove-btn`, `.settings-total`, and `.settings-divider`.

Keep selected chips copper, destructive controls brick, and all editable fields visibly bounded against charcoal.

### Step 4: Complete the contract selectors
Ensure `src/carbon-ledger.css` contains concrete rules for:

```css
.summary-card {}
.amount-display {}
.entry-list {}
.settings-input {}
```

Remove the empty braces by folding each selector into the real override blocks.

### Step 5: Run core behavior and theme tests
Run: `npm test -- carbonLedgerTheme App Dashboard AddEntry History Settings`
Expected: all selected suites PASS.

### Step 6: Commit the core theme

```bash
git add src/main.tsx src/carbon-ledger.css src/carbonLedgerTheme.test.ts
git commit -m "feat: apply Carbon Ledger core theme"
```

## Task 3: Extend Carbon Ledger to Poker and Shared Budgets

**Files:**
- Modify: `src/carbon-ledger.css`
- Existing behavior tests: `src/screens/Poker.test.tsx` (does not exist — use `src/pokerCompute.test.ts`, `src/pokerDisplay.test.ts` instead, per plan review), `src/sharedBudgets/SharedScreen.test.tsx`, `src/sharedBudgets/BudgetList.test.tsx`, `src/sharedBudgets/BudgetDetail.test.tsx`, `src/sharedBudgets/AuthGate.test.tsx`, `src/sharedBudgets/OwnerTools.test.tsx`

### Step 1: Add Poker surface overrides
Cover `.poker-stats-card`, `.poker-stats-row`, `.poker-stat`, `.poker-pnl`, `.bankroll-card`, `.bankroll-trend`, `.bankroll-trend-point`, `.bankroll-card-footer`, `.log-session`, `.time-row`, `.custom-stakes-row`, `.result-toggle`, and `.result-toggle-btn`.

Rules:
- editorial serif is limited to P&L and hourly-rate values
- wins use muted sage and losses use brick
- bankroll bars use semantic colors without glow
- Log Session uses the same inputs, chips, copper focus state, and primary button as Add Expense

### Step 2: Add Shared Budget surface overrides
Cover `.shared-auth`, `.shared-form`, `.shared-budget-cards`, `.shared-budget-card`, `.shared-budget-name`, `.shared-actions`, `.shared-detail-header`, `.shared-progress`, `.member-total-row`, `.member-row`, `.shared-entry-row`, `.invite-row`, `.invite-code`, `.owner-tools`, `.shared-signout`, `.form-error`, `.offline-banner`, and `.shared-dashboard`.

Rules:
- auth and setup screens use the same field and button vocabulary
- budget cards use restrained containment and 12 to 16 pixel corners
- invite codes use a readable monospace stack on the raised charcoal surface
- owner/destructive actions retain distinct semantic styling
- member, category, and entry lists use the same ledger separators as personal history

### Step 3: Run Poker and Shared behavior suites
Run: `npm test -- pokerCompute pokerDisplay SharedScreen BudgetList BudgetDetail AuthGate OwnerTools`
Expected: all selected suites PASS.

### Step 4: Commit Poker and Shared theme coverage

```bash
git add src/carbon-ledger.css
git commit -m "feat: extend Carbon Ledger to poker and shared budgets"
```

## Task 4: Automated Regression Verification

**Files:**
- Modify only if a visual contract issue is found: `src/carbon-ledger.css`

### Step 1: Run the complete test suite
Run: `npm test`
Expected: all tests PASS with no new unhandled errors.

### Step 2: Run ESLint
Run: `npm run lint`
Expected: exit code 0.

### Step 3: Run the production build
Run: `npm run build`
Expected: TypeScript and Vite complete successfully and produce `dist/`.

### Step 4: Run the Impeccable detector (skip if not present in this repo)
Run: `node .agents/skills/impeccable/scripts/detect.mjs --json src/index.css src/carbon-ledger.css`
Expected: no high-severity contrast, overflow, gradient-text, side-stripe, or decorative-glow findings in the new theme. If the script is not present in this repo, skip this step and note it in the report.

## Task 5: Browser Verification Across Every Surface

**Files:**
- Modify only for defects found: `src/carbon-ledger.css`
- Generated evidence: `.playwright-cli/` and `.superpowers/brainstorm/` remain untracked

### Step 1: Start the Vite app
Run: `npm run dev -- --host 127.0.0.1`
Expected: Vite reports a local URL, normally http://127.0.0.1:5173.

### Step 2: Open a dedicated Playwright session at iPhone width

```bash
playwright-cli -s=carbon-ledger open http://127.0.0.1:5173
playwright-cli -s=carbon-ledger resize 390 844
```
Expected: Home loads with no console error.

### Step 3: Exercise and capture every main tab
For Home, Add, History, Poker, and Shared:
- navigate using accessible tab buttons
- capture a screenshot
- inspect the snapshot for clipped values or missing controls
- read `playwright-cli -s=carbon-ledger console error`

Also open Settings, expand a Home category, enter an Add amount, open a History edit panel, open Poker Log Session, and inspect every reachable Shared state.

### Step 4: Repeat the layout check at the app-width ceiling

```bash
playwright-cli -s=carbon-ledger resize 430 932
```
Expected: no horizontal overflow, clipped money values, wrapped tab labels, or obscured primary actions.

### Step 5: Verify reduced motion

```bash
playwright-cli -s=carbon-ledger run-code "async page => { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); }"
```
Expected: content remains visible and usable; no essential state depends on animation.

### Step 6: Close the browser session
Run: `playwright-cli -s=carbon-ledger close`

### Step 7: Commit final visual fixes if any

```bash
git add src/carbon-ledger.css
git commit -m "fix: polish Carbon Ledger responsive states"
```
Skip this commit when browser verification requires no code changes.
