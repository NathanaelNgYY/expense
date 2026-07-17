# N2 — Reactive budget-config context

**Date:** 2026-07-17
**Status:** Approved, pending implementation
**Backlog item:** N2 (Medium, Architecture) in `docs/PROJECT_IMPROVEMENT_STATUS.md`

## Problem

Budget config, custom categories, and category overrides are read straight from
localStorage during render:

- `getBudgetConfig()`, `getCustomCategories()`, `getCategoryOverrides()` are called in the
  render body of `Dashboard`, `History`, `Insights`, `AddEntry`, `InsightsSection`, and
  `AutomaticCaptureSettings`.

Two consequences:

1. **Non-reactive.** A settings change written by `BudgetSettings` is not reflected in a
   mounted screen without a remount. Today this is masked by the tab navigation in `App.tsx`,
   which conditionally renders each screen (`{tab === 'home' && …}`) so screens unmount and
   remount on tab switches — but the coupling is fragile and the data flow is implicit.
2. **Re-parse on every render.** Each render re-reads and re-`JSON.parse`es three localStorage
   keys.

The finding also notes `Dashboard.tsx` (669 lines) and `History.tsx` (677) exceed the 400-line
target. **Splitting those files is explicitly out of scope for this pass** (tracked as a
separate follow-up); this spec covers only the reactivity refactor.

## Goal

Lift the three settings values into a single reactive React context so that:

- Components read parsed values once per change, not once per render.
- A write in one place updates every mounted consumer.
- The read path is testable in isolation.

Behavior must be otherwise preserved: the same values are persisted to the same localStorage
keys, user-scoping is unchanged, and no derived value is newly persisted.

## Design

### New module: `src/BudgetConfigContext.tsx`

Mirrors the shape and idioms of the existing `EntriesContext.tsx`.

State, seeded once at provider mount from the storage getters:

- `config: BudgetConfig`
- `customCategories: CustomCategory[]`
- `overrides: CategoryOverrides`

Context value exposed via `useBudgetConfig()`:

| Member | Purpose |
| --- | --- |
| `config`, `customCategories`, `overrides` | Reactive, parsed-once values |
| `saveConfig(config)` | Persist via `storage.saveBudgetConfig` + update state |
| `saveCustomCategories(cats)` | Persist via `storage.saveCustomCategories` + update state |
| `saveOverrides(overrides)` | Persist via `storage.saveCategoryOverrides` + update state |
| `saveBudgets({ config, customCategories, overrides })` | Atomic persist + single state update for `BudgetSettings` Save |
| `reload()` | Re-read all three from storage into state |

Rationale for **one combined context** rather than three: the three values are low-frequency,
are always edited together in `BudgetSettings`, and are consumed together on most screens.
A single provider is the simplest thing that matches usage (KISS/YAGNI).

`storage.ts` is unchanged and remains the persistence layer. The context is the single
*reactive read path* for components; the `save*`/`get*` functions remain the primitives that the
context and the IO module (`dataTransfer.ts`) call. `storage.test.ts` is untouched.

### User-switch reactivity

Config is user-scoped (`userStorage.ts` namespaces keys by active user id). When
`EntriesContext.refresh()` calls `activateUserStorage(newUserId)` on an account transition, the
config context must re-read from the new namespace. Today screens only pick this up because tabs
remount.

Add a minimal subscription to `userStorage.ts`:

- `subscribeActiveUser(listener: () => void): () => void` — registers a listener, returns an
  unsubscribe.
- `activateUserStorage` notifies listeners **only when the active user actually changes**
  (i.e. when it already returns `changed === true`), after the namespace is updated.

`BudgetConfigProvider` subscribes on mount and calls `reload()` on notification. This keeps the
context correct across account switches without depending on `EntriesContext` internals.

### Provider placement

Wrap `AppShell` with `<BudgetConfigProvider>` inside `EntriesProvider` in `App.tsx`. The two
contexts are independent; the user-switch event decouples ordering.

### Consumers converted to `useBudgetConfig()` (read side)

- `src/screens/Dashboard.tsx` — `config`, `customCategories`, `overrides`
- `src/screens/History.tsx` — `customCategories`, `overrides`
- `src/screens/Insights.tsx` — `config`, `customCategories`, `overrides`
- `src/screens/AddEntry.tsx` — `customCategories`, `overrides`
- `src/components/InsightsSection.tsx` — `overrides`
- `src/screens/settings/AutomaticCaptureSettings.tsx` — `overrides`, `customCategories`

### Write-side rewires

- `src/screens/settings/BudgetSettings.tsx` — keeps its local editable draft and dirty
  tracking; seeds the draft from context values; on Save calls `saveBudgets(...)` instead of the
  three raw `save*` functions.
- `src/onboarding/FirstRunBudgetOnboarding.tsx` — `acceptPlan` calls context `saveConfig`
  instead of `saveBudgetConfig`.
- `src/screens/settings/DataSettings.tsx` — after `applyImport`, calls context `reload()`
  alongside the existing `refresh()`.

## Testing (TDD)

New `src/BudgetConfigContext.test.tsx`:

- Seeds `config`/`customCategories`/`overrides` from storage on mount.
- A setter persists to localStorage **and** re-renders consumers with the new value.
- `saveBudgets` updates all three atomically.
- `reload()` picks up a value written to storage out of band.
- An active-user change (via `activateUserStorage`) triggers a reload into the new namespace.

Existing screen/component tests that render the converted components now require a
`BudgetConfigProvider` in the tree. Add the provider to the shared test render helper so the
churn is centralized rather than per-file. Where a test asserts a value seeded from
localStorage, that behavior is preserved because the provider seeds from the same getters.

## Verification

- `npm test` green (new context tests + updated screen tests).
- `npm run lint` and `npm run build` clean.
- Manual: change a budget target / add a custom category in Settings, confirm dependent screens
  reflect it; confirm an account switch reloads the correct namespace; confirm JSON import
  updates config-dependent UI.

## Non-goals

- Splitting `Dashboard.tsx` / `History.tsx` (separate follow-up).
- Any change to persistence format, keys, or user-scoping.
- Any new persisted derived value.
