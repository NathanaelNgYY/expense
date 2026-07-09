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

- canvas: charcoal near `#1a1b1c`
- raised surface: slightly lighter charcoal near `#202223`
- secondary surface: near `#292b2c`
- primary text: warm off-white near `#ece9e4`
- secondary text: warm gray near `#a8a39b`
- separator: low-contrast warm gray
- primary accent: muted copper near `#c98d68`
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

1. Replace and extend global theme tokens.
2. Restyle shared primitives such as cards, lists, buttons, inputs, tab navigation, progress indicators, and screen headings.
3. Add narrowly scoped class or markup changes only where a screen cannot express the approved hierarchy through CSS alone.
4. Avoid changing React state, business logic, context providers, storage, or API modules.

No new UI framework, component library, font package, or data dependency is required. A web font may be avoided in production in favor of a resilient serif fallback stack so the PWA remains fast and offline-friendly.

## Verification

Automated verification:

- run the complete Vitest suite
- run the production build
- run ESLint
- confirm existing accessible-name tests still pass

Browser verification with Playwright CLI:

- inspect Home, Add, History, Poker, and Shared tabs at iPhone width
- inspect Settings and all reachable form states
- exercise category expansion, scope switching, add-entry input, history editing, Poker logging, and reachable Shared flows
- check console errors
- check key layouts at a narrow mobile width and at the 430-pixel app width
- capture screenshots for every main tab

The implementation is complete only when all existing functionality remains reachable and the Carbon Ledger theme is visually consistent across every surface.
