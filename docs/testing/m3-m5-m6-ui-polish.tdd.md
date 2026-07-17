# M3 + M5 + M6 — tab-bar semantics, desktop presentation, short screens — TDD evidence

## Source and journeys

Journeys were derived from M3, M5, and M6 of the July 2026 audit review, batched per
`docs/superpowers/specs/2026-07-17-m3-m5-m6-design.md` and
`docs/superpowers/plans/2026-07-17-m3-m5-m6-ui-polish.md` because they are small, related
presentation/accessibility fixes, all client-only:

- As a keyboard or screen-reader user of the five-tab bottom bar, I hear the active destination
  announced via `aria-current="page"` (not a toggle-button `aria-pressed`), and I can move focus
  between tabs with `ArrowLeft`/`ArrowRight`/`Home`/`End` without accidentally navigating away from
  the screen I'm on.
- As a user on a desktop or tablet browser, the 430px phone column reads as a deliberate app
  surface — a themed backdrop and soft elevation — instead of a stranded box on a blank page, at
  every width and in every theme.
- As a user on an iPhone SE-class short screen (320×568), every primary screen and its main action
  (Save, Reset, etc.) stays reachable and tappable, with no horizontal overflow, across all four
  themes.

## RED and GREEN

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED (M3) | `npx vitest run src/components/TabBar.test.tsx` | Expected failure | The `aria-current` assertions failed (the attribute did not exist yet — the component still rendered `aria-pressed`), and the new `keyboard focus movement` describe block failed (no `onKeyDown` handler existed, so focus never moved on Arrow/Home/End). Pre-implementation base per the plan's Task 1 Step 2. |
| GREEN (M3) | `npx vitest run src/components/TabBar.test.tsx src/App.test.tsx` | PASS | `TabBar.tsx` swapped `aria-pressed` for `aria-current="page"` on the active tab only (inactive tabs get no attribute at all, not `aria-current="false"`) and gained a `handleKeyDown` on the `<nav>` that moves focus among the five buttons (wrapping) on Arrow/Home/End without calling `onChange`, and ignores every other key. `App.test.tsx`'s external `aria-pressed` assertion on the Settings tab was updated to `aria-current`. Commit `09d52a3`. |
| RED (M5) | `npx vitest run src/desktopPresentation.test.ts` | Expected failure | No `@media (min-width: 700px)` block existed yet in `src/index.css`, so all four static-CSS assertions (single wide-viewport block, theme-derived backdrop, elevation + hairline border, no `max-width` override) failed against the pre-change file. Static-CSS-assertion style follows the existing `src/passCardStyle.test.ts` precedent. |
| GREEN (M5, first pass) | `npx vitest run src/desktopPresentation.test.ts` | PASS | Added one `@media (min-width: 700px)` block: `body` gets a `color-mix(in srgb, var(--bg) 82%, black)` backdrop and `.app` gets a soft `box-shadow` plus a `border-inline` hairline derived from `var(--text)`. Commit `ee16955`. |
| Bug found in manual verification (M5) | Visual check across all four themes | Regressed | `themes.css` carries an unconditional `html, body, #root, .app { background: var(--bg) }` rule that loads after `index.css` and won the cascade tie on equal specificity (later rule wins), so the new backdrop was invisible on every theme in a real browser despite `desktopPresentation.test.ts` passing (a static-CSS-content test cannot see cascade/specificity outcomes). | Root-caused during manual desktop verification, not caught by the unit test. |
| GREEN (M5, cascade fix) | Manual visual re-check across all four themes at ≥700px | PASS | The selector was raised to `html body, html #root` (two-class specificity, still zero explicit `!important`) to outrank the later `themes.css` rule; `.app`'s box-shadow/border-inline were unaffected since `themes.css` does not touch those properties. Commit `a9ede10`. |
| AUDIT (M6, phase 1) | 9 screens × 4 themes × {320×568, 375×667} via a throwaway Playwright script (`.superpowers/sdd/short-audit/audit.mjs`, gitignored) | 24 raw findings, then investigated | All 24 raw findings were one selector artifact: the script's primary-control selector `{ role: 'button', name: /Save\|Back/ }` never matched `settings-budget`/`settings-appearance`/`settings-data`, because those screens pass `backLabel="Settings"` (rendering "‹ Settings"), not "Save"/"Back", to `SettingsHeader`. Three additional Home-screen observations that looked like clipped content in static screenshots were re-probed against the app's real scroll container (`.screen`, `overflow-y: auto`) rather than `document.body`, and were found fully reachable after scrolling. Recorded first as 3 apparent defects in commit `7500f6a`, then corrected to 0 after the re-probe in commit `71bd708`. See `docs/testing/m6-short-screen-audit.md` for the full method, evidence, and reasoning. |
| FIX (M6, phase 2) | N/A | Not needed | The corrected audit found 0 qualifying defects, so no CSS changes were made — per the plan's Task 4 Step 3 ("If the audit found zero defects, skip this step."). |
| RED (M6 guard, first form) | `npx playwright test tests/e2e/accessibility.spec.ts -g "short viewports"` | Expected failure, then hardened | The guard was first written checking only `scrollWidth <= innerWidth` and a raw `boundingBox()` height per control; a review found this could pass even when a control was rendered but visually trapped behind the fixed tab bar, since `boundingBox()` alone doesn't see whether an ancestor visually clips a sibling. Commit `8fa6a37`. |
| GREEN (M6 guard, hardened) | `npx playwright test tests/e2e/accessibility.spec.ts -g "short viewports"` | PASS | Added an explicit `expectClearsTabBar` assertion: the control's `y + height` must be `<=` the tab bar's `y` (with 1px tolerance) after `scrollIntoViewIfNeeded()`, applied to the Add screen's Save control and the Settings Reset control at 320×568, alongside the existing no-horizontal-overflow checks on Home/History/Insights. Commit `efd3220`. |

## Guarantees

| # | What is guaranteed | Test | Type |
| --- | --- | --- | --- |
| 1 | The active tab exposes `aria-current="page"`; inactive tabs expose neither `aria-current` nor `aria-pressed`. | `TabBar.test.tsx: exposes aria-current only on the active tab` | Component unit |
| 2 | `ArrowRight`/`ArrowLeft` move focus to the next/previous tab, wrapping at the ends, without calling `onChange`. | `TabBar.test.tsx: ArrowRight moves focus to the next tab without activating it`, `ArrowRight wraps from the last tab to the first`, `ArrowLeft wraps from the first tab to the last` | Component unit |
| 3 | `Home`/`End` move focus to the first/last tab. | `TabBar.test.tsx: Home and End jump to the first and last tabs` | Component unit |
| 4 | Keys the handler does not own (e.g. `Tab`, `ArrowDown`) are left alone — focus and `onChange` are both untouched. | `TabBar.test.tsx: ignores keys it does not own` | Component unit |
| 5 | External call sites that assert tab-bar state use `aria-current`, not the retired `aria-pressed`. | `App.test.tsx` (Settings tab assertion), `tests/e2e/journeys.spec.ts` (five-tab navigation journey) | Unit + E2E |
| 6 | Exactly one `@media (min-width: 700px)` block exists in `src/index.css`, and it never sets `max-width` (mobile/narrow rendering is untouched). | `desktopPresentation.test.ts: defines a single wide-viewport block`, `keeps the column width untouched` | Static CSS unit |
| 7 | The wide-viewport backdrop is derived from the active theme's `--bg` token via `color-mix()`, at a selector specificity (`html body, html #root`) that outranks `themes.css`'s later unconditional background rule. | `desktopPresentation.test.ts: derives the backdrop from theme tokens and outranks the themes.css blanket rule` | Static CSS unit |
| 8 | The `.app` column gains a `box-shadow` and a `--text`-derived `border-inline` hairline at wide viewports. | `desktopPresentation.test.ts: frames the app column with elevation and a token-derived hairline` | Static CSS unit |
| 9 | All 9 primary screens × 4 themes × {320×568, 375×667} were audited for horizontal overflow and primary-control reachability; the corrected result is 0 qualifying defects. | Manual audit, `docs/testing/m6-short-screen-audit.md` | Manual/scripted audit |
| 10 | At 320×568, Home/History/Insights render with no horizontal overflow, and the Add screen's Save control and the Settings Reset control are both reachable (scrollable into view), ≥44px tall, and clear the fixed tab bar's top edge. | `tests/e2e/accessibility.spec.ts: primary screens stay usable on SE-class short viewports` | E2E (mobile Chromium) |

## Full verification

- `npm test`: **64 test files, 533 tests passed** (baseline before this branch was 63 files / 520
  tests; this work added 1 net new file, `src/desktopPresentation.test.ts`, and net new test cases
  across `TabBar.test.tsx` and `desktopPresentation.test.ts`, with no removals). Plain `npm test`
  (Vitest's default `pool: 'threads'`) intermittently failed to spin up worker threads in this
  sandboxed session — `[vitest-pool-runner]: Timeout waiting for worker to respond` — while an
  unrelated, very CPU-heavy local process (`PenguinHotel-Win64-Shipping.exe`) was running on the
  same machine; this reproduced across two default-pool attempts (26/63 and later fewer files
  completing before timing out) with zero product-code changes in between. Re-running the
  identical suite with `npx vitest run --pool=forks --maxWorkers=2` (a CLI flag only, no config or
  source change) completed cleanly with the counts above and 0 failures — the flakiness was
  resource contention in this sandbox, not a test or product defect. See "Verification
  environment note" below.
- `npm run lint`: clean.
- `npm run build`: `tsc -b && vite build` succeeded with no type errors.
- `node scripts/check-bundle-size.mjs`: **initial JS 137.7 KB gzip (budget 143 KB, ok); CSS 12.3 KB
  gzip (budget 13 KB, ok)**. Both M5's new `@media (min-width: 700px)` rules and M6's guard (a test
  file, not shipped CSS) fit inside the existing headroom; the CSS budget was not touched.
- `npx playwright test`: **11 passed** (the 10 pre-existing mobile-Chromium checks plus the new
  320×568 short-viewport guard). Console noise reading `Supabase sync failed {"reason":"offline"}`
  is expected in this sandboxed, network-isolated run — the app is offline-first by design and the
  tests seed data via `localStorage`, not the network.

### Verification environment note

This session's sandbox had a very CPU-heavy unrelated process running concurrently
(`PenguinHotel-Win64-Shipping.exe`), which caused Vitest's default `threads` worker pool to
intermittently time out spawning workers (`Timeout waiting for worker to respond`) — a resource
contention symptom of the sandbox, not of the suite. `npx vitest run --pool=forks --maxWorkers=2`
(no config/source changes, a CLI-only override) reproduced a clean, complete, 0-failure run at the
counts recorded above. No test or product code was modified to work around this.

## Known boundary

M6's regression guard (`tests/e2e/accessibility.spec.ts`) checks Home, History, Insights, Add, and
Settings at 320×568 — the five screens the audit's Home-observation investigation and defect
process actually touched or called out. It does not re-run the full 9-screen × 4-theme audit on
every CI run (that remains a manual/scripted audit, not a permanent gate); if a future screen
change reintroduces a tab-bar-trapped control or horizontal overflow on one of the un-covered
Settings subscreens, only a fresh audit (not this guard) would catch it. This matches the plan's
scope: the guard extends the existing 375×667/390×844 pattern to 320×568 for the screens most at
risk, not a full audit-in-CI.
