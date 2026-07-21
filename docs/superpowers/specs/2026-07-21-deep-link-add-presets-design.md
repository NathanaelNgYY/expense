# F10 — Quick-add deep-link presets

**Date:** 2026-07-21
**Status:** Approved (design)
**Audit item:** F10 in `docs/PRODUCT_AUDIT_2026-07-19.md` (v1.1 roadmap, "The number never lies")

## Product diagnosis

### Who this is for

The owner — a Singapore intern who logs the same handful of small expenses many times a week (kopi,
MRT top-up, hawker lunch). The app already claims "fast entry above all," and `?add=true` already
deep-links straight to the Add screen. The missing piece is letting an iOS Shortcuts widget carry the
*whole* preset — category and amount — so a routine "Kopi S$2.20" is a home-screen tap plus one Save,
not a numpad session.

### Pain

Today the Add deep link only opens the screen. Every recurring small purchase still requires typing
the amount and tapping the category, even though those are identical every time. There is no way to
build the one-tap preset widget the audit calls out, because the app parses no parameters beyond
`add`.

### Why now

F10 is a v1.1 "quickest win" (impact ÷ effort) in the 2026-07-19 audit: cheap, on-brand, and it
unlocks a zero-native-code iOS Shortcuts preset widget. The Add screen already accepts an
`initialDate` prop and holds amount/category as local state, so this is wiring URL params to state
that already exists — not new infrastructure.

### Ten-star version

A home-screen grid of labelled presets ("Kopi 2.20", "MRT 1.09", "Lunch 5.50") each files the exact
entry with a single tap and an ambient push receipt confirms it — no app screen at all. That depends
on auto-save-from-URL and Web Push (F3), both deliberately out of scope here for safety and sequencing.

### MVP decision

Parse `category` and `amount` from the existing `?add=true` deep link and **prefill** the Add screen
with them; the user reviews and taps **Save** once. Prefill, not auto-save — an accidental widget tap
can never create a phantom entry, and the user can still adjust before committing. This keeps the
capture fast while preserving the review step and the existing dedupe/undo model.

## Scope

**In scope**

- `?add=true&category=<c>&amount=<n>` prefills the Add screen (Personal destination only).
- `category` resolves case-insensitively against category **id** first, then display **label** —
  so `category=lunch` hits the built-in and `category=Groceries` hits a custom category by name.
- `amount` prefills the numpad amount; the user still taps Save.
- Graceful degradation: unknown/missing `category` → amount prefills, category left empty;
  invalid/missing `amount` → Add opens at 0.

**Out of scope (deferred)**

- `?screen=insights|history|settings` tab navigation.
- `note=` parameter.
- Auto-save (saving with no interaction).
- Multi-currency in the link — `amount` is interpreted in the active wallet currency.

## Architecture

Approach: parse the URL once at startup in a pure module, resolve the category against the real
category list in `AppShell` (which already builds `categoryOptions`), and pass resolved
`initialAmount` / `initialCategory` into `AddEntry` — mirroring the existing `initialDate` prop.
The prefill is one-shot, cleared on save and on tab change, exactly like `addEntryDate`.

### New module — `src/deepLink.ts` (pure, no DOM dependency)

```ts
export interface AddDeepLink {
  add: boolean
  amount?: number      // positive, <= 2 decimals; omitted when absent/invalid
  category?: string    // trimmed raw string; resolution happens against real options
}

// Parses a location.search string (passed in, so this stays testable and DOM-free).
export function parseAddDeepLink(search: string): AddDeepLink

// Case-insensitive match against each option's id first, then its label. No match -> null.
export function resolveCategoryId(
  raw: string,
  options: ReadonlyArray<{ id: string; label: string }>,
): string | null

// Number -> the `digits` string AddEntry seeds, honouring the <=2-decimal numpad rule
// (e.g. 5.8 -> "5.80", 5 -> "5", 5.805 -> "5.80").
export function amountToDigits(n: number): string
```

`parseAddDeepLink` amount rules: parse with `Number`; require finite and `> 0`; truncate (not round
up) to 2 decimals to match the numpad's own `getNextDigits` behaviour; otherwise omit `amount`.

### `App.tsx`

- `initialTab()` uses `parseAddDeepLink(window.location.search).add` instead of the inline
  `params.get('add') === 'true'` check.
- `AppShell` computes the prefill once via a `useState` initializer:
  parse `window.location.search`, then resolve `category` against the already-built
  `categoryOptions`, producing `{ amount?: number; category?: string | null }` held in state.
- Passes `initialAmount` and `initialCategory` to `<AddEntry initialDate=… />`.
- Clears the prefill in `handleSave` and `handleTabChange` (one-shot lifecycle identical to
  `addEntryDate`). The URL query string is already stripped on save via the existing
  `window.history.replaceState({}, '', window.location.pathname)`.

Onboarding note: a first-run `?add=true&…` launch shows onboarding first (`shouldShowBudgetOnboarding`
already treats `add` as intent). Because the prefill is prop-based and applied when `AddEntry` mounts,
it survives onboarding and applies once the user lands on Add.

### `AddEntry.tsx`

- Two new optional props: `initialAmount?: number`, `initialCategory?: string | null`.
- Seeded through the existing `useState` initializers for `digits` and `category`
  (`useState(() => initialAmount ? amountToDigits(initialAmount) : '0')`,
  `useState<string | null>(initialCategory ?? null)`) — no effects, no behaviour change when props
  are absent.
- Prefill targets the **Personal** destination only (the default `selectedBudgetId === null`); shared
  budgets are untouched by the deep link.

## Validation & safety

- Deep-link values only ever set local state (amount digits string, category id) and are never
  rendered as raw HTML, so there is no injection surface (React escapes all text; no
  `dangerouslySetInnerHTML`).
- `amount` is strictly validated (finite, positive, 2-decimal truncated) before it becomes state.
- `category` that resolves to nothing is silently dropped — the entry is never mis-filed to a
  guessed category.
- No new network calls, no new dependencies, no bundle-budget-relevant imports (Home/Add path only).

## Testing

- **Unit (`deepLink.test.ts`):**
  - `parseAddDeepLink`: no params; `add=true` only; valid `amount`; garbage `amount` (`abc`, `-1`,
    `0`, `5.805` → `5.80`); `category` trimmed; `add` absent → `{ add: false }`.
  - `resolveCategoryId`: built-in id match; label match; case-insensitivity; custom category by
    label; unknown → `null`; empty string → `null`.
  - `amountToDigits`: integer, one-decimal, two-decimal, over-precision truncation.
- **Component (`AddEntry.test.tsx`):** rendering with `initialAmount`/`initialCategory` seeds the
  displayed amount (`S$5.80`) and marks the matching category chip selected; absent props → empty
  Add screen unchanged.
- **Integration (`App.test.tsx`):** mounting at `?add=true&category=lunch&amount=5.80` opens the Add
  tab showing `S$5.80` with Lunch selected; pressing Save strips the query string
  (`window.location.search === ''`). Unknown category param → amount shown, no chip selected.

## Documentation

- Add a short "Quick-add presets" subsection to `README.md` next to the existing Shortcuts setup,
  documenting the `?add=true&category=&amount=` URL shape and one worked example
  (`…/?add=true&category=lunch&amount=2.20` → "Kopi").

## Rollout

Single PR, feature branch, TDD (RED tests first) per repo convention; merged through the protected
`main` `verify`/`rls`/`e2e` gate. No migration, no data-model change, no flag.
