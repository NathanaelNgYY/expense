# Hash Routing & Back-Swipe Design (U1 / T1)

**Date:** 2026-07-23
**Status:** draft
**Product:** Budget Tracker
**Audit item:** U1 (`docs/PRODUCT_AUDIT_2026-07-19.md` §2–3) and T1 (§6), roadmap v1.5

## Goal

Give every destination an address, so the OS back gesture means "back" instead of "quit".

Today all navigation is React `useState` and none of it reaches the URL:

| State | Where | Values |
|---|---|---|
| `tab` | `App.tsx:46` | `home` · `add` · `history` · `insights` · `settings` |
| `settingsTool` | `App.tsx:59` | `null` · `poker` · `shared` |
| `subscreen` | `Settings.tsx:57` | `hub` · `automatic` · `budget` · `appearance` · `data` |

Eleven reachable destinations, none addressable. There is no `popstate`/`hashchange` listener in
`src/`; the only history call in the app is `App.tsx:74`, a `replaceState` that *strips* the
quick-add query after a save. The app therefore keeps exactly one history entry for its whole
lifetime, which produces four failures:

1. **Back-swipe exits the app.** From three levels deep in Settings, an iOS edge-swipe or an
   Android back press dismisses the PWA. `SettingsHeader` renders a `‹ Settings` chevron while the
   OS gesture does something else entirely — the app claims a native grammar it does not honour.
2. **Reopening always lands on Dashboard**, wherever the user left off.
3. **Only one deep link exists** — the hand-built `?add=true` (F10). Automatic Tracking, the screen
   most worth sending to someone, is unreachable by URL.
4. **No scroll restoration** (explicitly out of scope here — see Non-goals).

Audit U1 calls this "the only remaining architectural UX debt."

## Non-goals

- **Scroll restoration.** Named in U1 but deliberately deferred: it needs a per-route scroll cache
  and restore-after-paint handling, and it is separable from addressability. Filed as follow-on.
- **`prefers-reduced-motion`-style screen transitions.** No animation is added; this is a state
  plumbing change.
- **Path-based routes.** See Decisions.
- **Routing the first-run onboarding.** It is a modal gate, not a destination (see Edge cases).

## Decisions

### Hash, not the History API

`#/history` needs no Vercel rewrite rule and cannot 404 on a cold load or a hard refresh. Path
routing (`/history`) would need a catch-all rewrite in `vercel.json`, and any mistake there is a
white screen on a real device rather than a failed test. The URL is cosmetic here — nobody types it
— so the robustness wins outright.

### Hand-rolled, no router dependency

Initial JS is **145.6 KiB gzipped against a 146 KiB budget** — 0.4 KiB of headroom. React Router is
~10 KiB gzipped. The decision makes itself, and the audit anticipated it ("even hand-rolled, no
router dependency"). What we need is a parse, a format, and a subscription; that is well under
100 lines.

### One route table, not three

`TabBar`, `Settings`, and the shell each independently know part of the destination space today,
which is how `settingsSubscreen` in `App.tsx` ended up a two-value subset (`'hub' | 'automatic'`) of
the five-value union in `Settings.tsx`. The route table in `src/router.ts` becomes the single source
of truth; the drift is designed out rather than documented.

### The in-app back chevron becomes `history.back()`

This is the heart of U1. Rather than `SettingsHeader`'s chevron calling a state setter while the OS
gesture does something else, **both invoke the same operation**. The chevron stops being a parallel
navigation system and becomes a visible affordance for the gesture that was already there.

## Route table

```
#/home                  Dashboard
#/add                   Add entry
#/history               History
#/insights              Insights
#/settings              Settings hub
#/settings/automatic    Automatic tracking
#/settings/budget       Budget & Categories
#/settings/appearance   Appearance
#/settings/data         Data & Backup
#/settings/poker        Poker tracker
#/settings/shared       Shared budgets
```

Model:

```ts
type SettingsSub = 'automatic' | 'budget' | 'appearance' | 'data' | 'poker' | 'shared'
interface Route { tab: Tab; sub: SettingsSub | null }   // sub is non-null only when tab === 'settings'
```

`poker` and `shared` currently render through `settingsTool` in the shell (wrapped in a
`SettingsHeader`) while the other four render inside `Settings.tsx`. That rendering split is left
alone — this change moves *where the state lives*, not how the screens compose.

## Push, replace, and back

The semantics matter more than the parsing, because they decide whether back feels right:

| Action | History op | Why |
|---|---|---|
| Tab tap | **push** | Back returns to the previous tab. Standard web behaviour, and what makes back non-destructive. |
| Settings hub → subscreen | **push** | The drill-down the chevron already implies. |
| Back chevron / `onDone` | **`history.back()`** | Identical operation to the OS gesture — the whole point. |
| Save an entry | **replace** | Navigates home; back must not return to a stale, already-saved Add screen. |
| Onboarding finish | **replace** | The onboarding gate is not a place you go back to. |
| Unknown hash on load | **replace** | Normalise to `#/home` without leaving a junk entry behind. |
| Cold load with `?add=true`, no hash | **replace** | Normalise to `#/add`, preserving the query. |

Repeated tab-tapping grows the stack. That is how the web works, it is what makes back predictable,
and the alternative (replace-on-tab) would leave back exiting the app from the tab bar — the exact
bug being fixed.

## Compatibility with the quick-add deep link

`?add=true&category=&amount=` is live: an iOS Shortcuts widget points at it (F10), so it cannot
break. Query and hash coexist —

- On cold load, if there is no hash and `?add=true` is present, `replaceState` to `#/add` while
  **keeping the query string** so `parseAddDeepLink` still reads the prefill.
- `handleSave`'s existing "strip the query" `replaceState` must now preserve the hash it navigates
  to, rather than resetting to `location.pathname` and silently dropping the route.

## Architecture

Two new modules, both small, both colocated-tested:

- **`src/router.ts`** — pure. `ROUTES`, `parseHash(hash): Route`, `formatHash(route): string`,
  `parentOf(route): Route | null`. No DOM access, so it unit-tests without a browser — the same
  discipline `deepLink.ts` already follows ("No DOM dependency: callers pass location.search").
- **`src/useRoute.ts`** — the DOM edge. Subscribes to `hashchange` through `useSyncExternalStore`,
  which is the concurrent-safe way to read an external store and avoids the tearing a
  `useEffect` + `useState` pair would allow. Exposes `useRoute()`, `navigate(route)`, `goBack()`.

`AppShell` then derives `tab`/`sub` from `useRoute()` instead of owning three `useState` calls, and
`Settings` takes its subscreen as a prop instead of holding it. Net: state is deleted, not added.

## Edge cases

- **Onboarding.** `shouldShowBudgetOnboarding` gates the whole shell before any route renders. It
  stays outside routing: it is a first-run modal, and giving it a URL would let someone link past or
  into a half-configured budget. On finish it *replaces* to `#/home` or `#/add`.
- **Unknown / legacy hash** (`#/settings/nope`, or a hash from a future version) → `#/home` via
  `replaceState`. Same defensive shape as `isThemeId`'s fallback to the default theme.
- **`#/settings/poker` deep-linked cold.** Renders the tool with its `‹ Settings` chevron; pressing
  it calls `history.back()`, which has nothing to pop on a cold load. `goBack()` therefore falls back
  to `navigate(parentOf(route))` when `history.length <= 1`, so a cold-loaded deep link still walks
  up rather than dead-ending.
- **Hash typed by hand mid-session** — `hashchange` fires and the app follows it. Free, and it is
  what makes the routes genuinely linkable.

## Testing

- `router.test.ts` — parse/format round-trip for all 11 routes, unknown-hash fallback, `parentOf`.
- `useRoute.test.tsx` — `hashchange` updates the hook; `navigate` pushes; `goBack` pops; the
  cold-load `goBack` fallback.
- `App.test.tsx` — tab taps write the hash; back returns to the previous tab; `?add=true` still
  prefills and normalises to `#/add`; save replaces rather than pushes.
- E2E (`journeys.spec.ts`) — the real proof, because only a browser has a real history stack:
  drill to `#/settings/appearance`, `page.goBack()`, assert the Settings hub is showing and the app
  has not unloaded. Plus a cold-load deep link straight to `#/settings/automatic`.
- Bundle budget must hold at 146 KiB. If the router pushes it over, the fix is to move a screen to a
  lazy chunk — **not** to raise the budget, which is a deliberate human decision per
  `scripts/check-bundle-size.mjs`.

## Trade-offs

- **Visible `#/` in the URL.** Cosmetically worse than clean paths. Nobody reads this URL; the app
  is launched from a Home-Screen icon. Not worth a rewrite rule and a 404 class of bug.
- **The stack grows with tab taps.** Deliberate, per the table above.
- **Touching `App.tsx` and `Settings.tsx` together.** Unavoidable — the state being lifted lives in
  both. Mitigated by landing the pure `router.ts` first, with its tests, before any component moves.
