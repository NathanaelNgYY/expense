# Runtime Theme System Design

**Date:** 2026-07-09  
**Status:** Approved visual design, awaiting implementation-plan review  
**Product:** Budget Tracker

## Goal

Let users choose one of three dark-first themes from Settings. Each theme changes both the visual design and the composition of Home, Add Expense, History, and Poker while preserving the same data, calculations, navigation, accessibility, and editing behavior.

The approved themes are:

1. **Deep Sea Revised**: dark teal, aqua accent, circular monthly-budget progress, soft spatial grouping.
2. **Copper Current**: charcoal and burnished orange, hard ledger geometry, split metrics, waterfall history, poker scoreboard.
3. **Berry Circuit**: deep plum and acid-lime, rounded ribbons, category tiles, week strips, chart-led poker analysis.

Deep Sea Revised is the default for new users.

## User Experience

### Theme selection

Settings gains an **Appearance** section above the existing budget preferences. It contains three visual theme cards. Each card includes:

- A small representative preview.
- Theme name.
- Three palette swatches.
- A one-line description.
- A visible selected state with both border and checkmark.

Tapping a card applies the theme immediately and saves it automatically. A polite status message confirms: “Theme applied and saved.” There is no separate Apply button because theme selection is reversible and immediate preview is the useful feedback.

### Persistence

The chosen theme is stored locally under a versioned key:

`budget-tracker-theme-v1`

On startup, the stored value is validated against the theme registry. Missing or invalid values fall back to Deep Sea Revised. The theme attribute is applied before React renders so refreshes do not briefly flash the wrong palette.

### Scope

The selected theme applies globally to:

- Home
- Add Expense
- History
- Poker
- Settings
- Shared-budget surfaces and secondary screens through shared semantic tokens

The four primary screens receive theme-specific composition. Secondary screens inherit color, typography, shape, and component tokens without receiving bespoke layouts in this iteration.

## Architecture

### Shared data, theme-specific presentation

Business logic must not be copied per theme. Existing calculations, storage access, form state, validation, and event handlers remain authoritative.

Each primary screen is split conceptually into:

1. A **screen container** that reads contexts, computes values, and owns interactions.
2. A **view model** containing display-ready data and callbacks.
3. A **theme-aware presentation layer** that composes shared primitives according to the active theme.

The presentation layer may choose a theme-specific visualization, such as a budget ring or waterfall bars, but receives the same view model. No theme may reimplement budget calculations or persistence.

### Theme registry

A central registry defines:

```ts
type ThemeId = 'deep-sea' | 'copper-current' | 'berry-circuit'

interface ThemeDefinition {
  id: ThemeId
  name: string
  description: string
  swatches: readonly [string, string, string]
  rootClass: string
}
```

The registry is the source of truth for validation, Settings previews, labels, and root theme attributes.

### Theme context

`ThemeProvider` owns:

- The active `ThemeId`.
- Storage initialization and validation.
- Applying `data-theme` to the document root.
- Persisting changes.
- Exposing `setTheme(themeId)`.
- Announcing successful changes through a non-blocking status region.

The provider wraps the existing entry and shared-budget providers.

### Semantic tokens

CSS uses semantic variables rather than theme-specific raw colors inside components:

- Background: `--bg`, `--surface`, `--surface-elevated`
- Content: `--text`, `--text-secondary`, `--text-tertiary`
- Actions: `--primary`, `--primary-contrast`, `--focus-ring`
- State: `--success`, `--warning`, `--danger`
- Structure: `--separator`, `--radius-card`, `--radius-control`
- Motion: `--motion-fast`, `--motion-standard`, `--ease-out`

Each `[data-theme]` block maps these roles to its palette. Layout-specific selectors may change grid areas, density, card treatment, and component geometry without hardcoding business-state colors.

## Screen Composition

### Home

All themes preserve the same decision priority: safe-to-spend first, monthly position second, category status third.

- **Deep Sea Revised:** monthly spend ring showing `spent / total budget`, with remaining and safe-per-day below.
- **Copper Current:** split hero with safe-to-spend and a vertical monthly utilization meter, followed by ledger rows.
- **Berry Circuit:** full-width safe-to-spend ribbon, offset remaining/buffer panel, then category tiles.

The monthly ring must visibly show amount and percentage. It is not a category pie chart.

### Add Expense

All themes preserve the fastest path: amount, category, optional details, save.

- **Deep Sea Revised:** amount-first bottom-sheet composition with integrated keypad.
- **Copper Current:** split calculator with category rail beside the keypad.
- **Berry Circuit:** category-tile selection followed by a large amount ribbon.

The existing controlled inputs, category options, notes, date handling, validation, and save behavior remain unchanged.

### History

- **Deep Sea Revised:** calendar heatmap followed by chronological entries.
- **Copper Current:** category waterfall summary followed by ledger entries.
- **Berry Circuit:** horizontal week strip followed by grouped daily summaries.

All themes retain access to month navigation, backfill, entry editing, totals, insights, and empty states.

### Poker

- **Deep Sea Revised:** win-rate ring, P&L summary, and compact bankroll bars.
- **Copper Current:** large scoreboard, bankroll bars, and ledger-like session rows.
- **Berry Circuit:** P&L ribbon, trend-first chart, three-stat strip, and rounded session rows.

Logging a session and all current poker calculations remain unchanged.

## Accessibility and Interaction

- Theme cards are real radio-style buttons with a programmatic selected state.
- Theme selection never relies on color alone; selection includes a checkmark and border.
- All interactive targets remain at least 44 by 44 CSS pixels.
- Text and controls meet WCAG AA contrast in every theme.
- Focus indicators use the active theme’s focus token and remain clearly visible.
- The status message uses `role="status"` or an equivalent polite live region.
- Charts always include visible numeric labels. Color is supplementary.
- Motion is limited to 150–250 ms state transitions and respects `prefers-reduced-motion`.
- Theme changes must not move focus or reset the current screen.

## Failure Handling

- Invalid stored theme: ignore it, use Deep Sea Revised, and replace the value on the next valid selection.
- Storage unavailable: apply the chosen theme for the current session and keep the interface usable.
- Theme registry lookup failure: fall back to Deep Sea Revised without throwing.
- CSS loading failure: semantic defaults on `:root` preserve a readable Deep Sea-compatible interface.

## Testing

### Unit tests

- Registry contains exactly the three approved themes.
- Stored valid values initialize correctly.
- Missing and invalid stored values fall back to Deep Sea Revised.
- Selecting a theme updates context, root attribute, and storage.
- Storage exceptions do not break theme switching.
- Settings renders all theme cards with accessible names and selected state.

### Screen tests

For each primary screen:

- The same view-model values appear in all themes.
- Theme-specific landmark components render.
- Existing actions and forms still call the same handlers.
- Empty and populated states remain available.

Home specifically verifies that the Deep Sea budget ring displays both spent amount, total budget, and computed percentage.

### Regression verification

- Existing test suite passes.
- Production build succeeds.
- All three themes are checked at mobile width.
- Home, Add Expense, History, Poker, and Settings are visually inspected in each theme.
- Keyboard navigation, largest practical text scaling, and reduced motion are checked.
- Refreshing with a stored theme shows no incorrect-theme flash.

## Out of Scope

- User-created custom themes.
- Light-mode variants.
- Cloud synchronization of theme preference.
- Per-screen theme selection.
- Theme-specific business logic or different calculations.
- Bespoke alternate layouts for Shared Budgets, Log Session, or other secondary screens.

## Acceptance Criteria

1. Settings offers the three approved theme cards.
2. A selected theme applies immediately across the app and persists after refresh.
3. Home, Add Expense, History, and Poker visibly change layout as specified.
4. Deep Sea’s ring shows monthly spent amount over total budget and percentage.
5. Theme switching does not alter stored financial data or reset navigation/form state.
6. The app remains accessible, responsive, and readable in every theme.
7. Existing tests pass and new theme tests cover persistence, fallback, and selection.
