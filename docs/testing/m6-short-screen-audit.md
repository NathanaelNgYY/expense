# M6 short-screen audit — 2026-07-17

**Method:** Playwright chromium; 9 primary screens × 4 themes × {320×568, 375×667};
seeded one lunch entry; metrics = horizontal overflow + primary-control reachability
(≥44px, fits above viewport bottom after scroll); every metric finding verified by
reading the screenshot; every theme spot-checked visually at 320×568 across all 9
screens (36 screenshots). Three screenshot-based Home-screen observations were further
re-checked programmatically against the app's actual scroll container (`.screen`, which
has `overflow-y: auto`; the outer `.app` is `overflow: hidden` — see `src/index.css`) to
confirm reachability rather than relying on the screenshot's single static frame; see
"Investigated, not defects" below.

## Defects

None. 0 qualifying defects at 320×568 or 375×667 across all 9 screens × 4 themes.

## Investigated, not defects

Three Home-screen observations initially looked like clipped/hidden content in the raw
screenshots and were investigated further before being ruled out:

| Screen | Theme | Viewport | What the screenshot showed | Why it is not a defect |
| ------ | ----- | -------- | --------------------------- | ----------------------- |
| home | deep-sea | 320×568 | "Safe to spend today" card's bottom edge extends past the visible frame, appearing to sit under the tab bar | `.screen` (the actual scroll container) has `scrollHeight=1368` vs `clientHeight=503` — scrollable. `.screen`'s client area ends exactly at the tab bar's top (`503===503`); `.screen` and `.tab-bar` are stacked flex siblings, not overlapping layers. After scrolling `.screen` to its end, the card clears the tab bar completely (`cardFullyVisibleAfterScroll: true`). Below-the-fold, not hidden. |
| home | copper-current | 320×568 | Same card, more of it below the visible frame | `.screen` scrollHeight=1383 vs clientHeight=503 — scrollable; same reachable-after-scroll result confirmed. |
| home | berry-circuit | 320×568 | Same card, most of it below the visible frame (worst-looking of the three in the static screenshot) | `.screen` scrollHeight=1443 vs clientHeight=503 — scrollable; same reachable-after-scroll result confirmed. |

**Root cause of my original mis-classification:** my first verification script probed
`document.body.scrollHeight` / `window.scrollY`, not the actual scroll container. This
app's layout keeps `.app` as `overflow: hidden` and scrolls only inside `.screen`
(`src/index.css`), so `document.body.scrollHeight === window.innerHeight` is true
*regardless of reachability* — it was the wrong element to measure and made unreachable
content look identical to reachable content. Re-probing the correct container
(`.superpowers/sdd/m6-probe-controller.mjs`, throwaway/gitignored) gives, at 320×568:

```
berry-circuit  {"screenScrollable":true,"screenScrollHeight":1443,"screenClientHeight":503,"cardBottom":598,"tabBarTop":503,"cardOverlapsTabBarBeforeScroll":true,"cardFullyVisibleAfterScroll":true}
deep-sea       {"screenScrollable":true,"screenScrollHeight":1368,"screenClientHeight":503,"cardBottom":523,"tabBarTop":503,"cardOverlapsTabBarBeforeScroll":true,"cardFullyVisibleAfterScroll":true}
copper-current {"screenScrollable":true,"screenScrollHeight":1383,"screenClientHeight":503,"cardBottom":538,"tabBarTop":503,"cardOverlapsTabBarBeforeScroll":true,"cardFullyVisibleAfterScroll":true}
```

`cardOverlapsTabBarBeforeScroll: true` is expected and harmless — it just means the card
isn't fully within the *initial* viewport frame, exactly like the "Category (optional)"
text peeking at the bottom edge of the Add screen or the "1 transaction" search field on
History. `cardFullyVisibleAfterScroll: true` in all three themes is what rules out a
defect: the content is reachable by the ordinary scroll gesture a user would make, it is
never rendered behind the fixed tab bar, and `.screen`'s scrollable area is bounded
exactly by the tab bar's top edge (503px = 503px), i.e. the layout correctly reserves
space for the tab bar. Per the M6 defect definition (content trapped under the tab bar
*with no scroll available*, horizontal overflow, or a primary control clipped/<44px),
below-the-fold-but-scrollable content does not qualify.

The audit script's own metric never flagged these (0 findings for `home` in any
theme/viewport) because its Home primary control is the "Add entry" button, which is
part of the tab bar itself and always reachable — consistent with there being no real
defect here.

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

**0 defect(s)** qualify for CSS fixes under the M6 rule. The script's 24 raw findings
were entirely one selector artifact (excluded above with reasons), and the three
Home-screen observations that looked suspicious in static screenshots are below-the-fold
content that is fully reachable by scrolling the app's actual scroll container
(`.screen`) — confirmed programmatically, not just by eye. Task 4 should add only the
regression guard called for by the brief; it should pass as written, since there is
nothing here to fix.
