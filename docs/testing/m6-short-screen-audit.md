# M6 short-screen audit — 2026-07-17

**Method:** Playwright chromium; 9 primary screens × 4 themes × {320×568, 375×667};
seeded one lunch entry; metrics = horizontal overflow + primary-control reachability
(≥44px, fits above viewport bottom after scroll); every metric finding verified by
reading the screenshot; every theme spot-checked visually at 320×568 across all 9
screens (36 screenshots), plus the 375×667 counterpart for the one confirmed defect.

## Defects

| # | Screen | Theme | Viewport | Symptom | Evidence screenshot |
| - | ------ | ----- | -------- | ------- | ------------------- |
| 1 | home | deep-sea | 320×568 | "Safe to spend today" card's bottom edge (~y=507.8) sits ~5px past the fixed tab bar's top (y=503); page does not scroll (`document.body.scrollHeight === window.innerHeight`), so the last line of the card's text is permanently clipped, unreachable by any user action | `home-deep-sea-320x568.png` |
| 2 | home | copper-current | 320×568 | Same card, ~11px hidden behind the fixed tab bar (card bottom y=514.3 vs tab bar top y=503); page does not scroll; the "…monthly buffer" line is cut off | `home-copper-current-320x568.png` |
| 3 | home | berry-circuit | 320×568 | Same card, ~80px hidden behind the fixed tab bar (card bottom y=582.8 vs tab bar top y=503) — the worst instance; the "S$79.20" amount itself is almost entirely clipped, only the "Safe to spend today" label is legible | `home-berry-circuit-320x568.png` |

All three are the same root cause: the `deep-sea`, `copper-current`, and `berry-circuit`
themes render an additional "Safe to spend today" card on the Home dashboard that the
`original-dark` theme's layout does not include. At 320×568 that extra card pushes total
content height past the fixed tab bar, and — confirmed by directly inspecting
`window.scrollY` / `document.body.scrollHeight` after a forced `scrollTo` — the page has
no scroll mechanism to reveal the hidden portion. Not a below-the-fold-but-scrollable
situation; the content is truly unreachable at this viewport. All three are resolved by
375×667 (confirmed in `home-deep-sea-375x667.png`, `home-copper-current-375x667.png`,
`home-berry-circuit-375x667.png` — full card visible with headroom to spare), so this is
specific to the 320×568 (iPhone SE-class) viewport.

The script's own metric did not catch this because the Home screen's primary control is
the "Add entry" button (fixed in the tab bar itself, always reachable) — the card that
overflows is not the control the script checks. This is exactly the class of defect the
brief called out visual spot-checking to find.

## Excluded script artifacts

| Screen | Theme | Viewport | Why excluded |
| ------ | ----- | -------- | ------------ |
| settings-budget | all 4 themes | both | Script's primary selector `{ role: 'button', name: /Save\|Back/ }` never matches. `BudgetSettings.tsx:149` passes `backLabel="Settings"` to `SettingsHeader`, not "Save" or "Back" — the real back control renders as "‹ Settings". Screenshots confirm the screen renders correctly with a visible, reachable back control; this is a script selector bug, not a defect. |
| settings-appearance | all 4 themes | both | Same root cause: `AppearanceSettings.tsx:12` passes `backLabel="Settings"`, not matching the script's `/Back/` selector. Screenshots confirm the back control ("‹ Settings") is visible and reachable. |
| settings-data | all 4 themes | both | Same root cause: `DataSettings.tsx:122` passes `backLabel="Settings"`, not matching `/Back/`. Screenshots confirm the back control is visible and reachable. |

That is 3 screens × 4 themes × 2 viewports = 24 of the script's 24 raw findings — every
raw finding from the metric pass was this one selector bug (only `AutomaticCaptureSettings.tsx:38`
uses `backLabel="Back"`, which is why `settings-automatic` produced no findings). None of
the 24 raw findings were visual defects.

## Conclusion

**3 defect(s)** qualify for CSS fixes under the M6 rule: the Home-screen "Safe to spend
today" card overlapping the fixed tab bar at 320×568, present in the `deep-sea`,
`copper-current`, and `berry-circuit` themes (not `original-dark`, which has no such
card). All other findings (24 raw script findings) were a single selector artifact and
are excluded with reasons above. Task 4 should add a regression guard for the Home
screen's total content height vs. tab-bar-safe viewport height at 320×568 across the
three affected themes, and a CSS fix (e.g., reserve tab-bar-height bottom padding on the
Home scroll container, or shrink/reflow the "Safe to spend today" card at narrow
viewports).
