# Daylight Ledger — Light Theme Design (U2)

**Date:** 2026-07-23
**Status:** implemented
**Product:** Budget Tracker
**Audit item:** U2 (`docs/PRODUCT_AUDIT_2026-07-19.md` §2–3), roadmap v1.5

## Goal

Ship one true light theme. Today both surviving themes (`original-dark`, `deep-sea`) are dark —
U3 cut the count from four but every option is still dark-first. The actual usage context of this
app is a Singapore lunch queue outdoors at noon, where dark UI legibility drops hard. This is the
highest-value remaining appearance work; it is worth more than another dark alternate.

Non-goals: no new screen composition, no per-theme layout, no system `prefers-color-scheme`
auto-switching (the user picks explicitly, and the pick persists — same contract as today).

## The theme

**Daylight Ledger** (`daylight`) — warm paper and ink. It is the light sibling of Original Dark,
not a different product: same serif display face, same copper accent role, same geometry. Only the
palette inverts.

Palette (all values verified against WCAG AA — see "Contrast contract"):

| Token | Value | Role |
|---|---|---|
| `--carbon-canvas` | `#f4f1ea` | warm paper page |
| `--carbon-surface` | `#fdfcf9` | cards, rows |
| `--carbon-surface-raised` | `#ffffff` | raised/active surfaces |
| `--carbon-chrome` | `#efeae0` | tab bar |
| `--carbon-text` | `#1c1a17` | primary ink |
| `--carbon-text-secondary` | `#4a453e` | secondary ink |
| `--carbon-text-tertiary` | `#6b655c` | muted ink, tab labels, placeholders |
| `--carbon-separator` | `#ded8cd` | hairlines |
| `--carbon-copper` | `#8a5a34` | primary accent |
| `--carbon-copper-pressed` | `#6d4526` | pressed accent |
| `--carbon-sage` | `#2f6d46` | positive / under budget |
| `--carbon-amber` | `#8a6212` | warning |
| `--carbon-brick` | `#a83a2c` | danger / over budget |

`color-scheme: light` is set on the theme block so native controls — most visibly the Add-screen
date input and its picker — render light instead of forcing a dark widget onto a light page.

## Architecture

No new mechanism. The theme system already works by redefining the `--carbon-*` token layer:
`carbon-ledger.css` holds every component rule in terms of those tokens, and each
`[data-theme]` block in `themes.css` re-points them. `deep-sea` proves the pattern; `daylight`
follows it exactly and adds nothing to the runtime.

Two pre-existing leaks had to be closed for this to hold, and both are fixes in their own right:

1. **`.tab-bar` hardcoded `#181a1b`** in `carbon-ledger.css`. The single hardcoded surface color in
   an otherwise fully tokenized file. Extracted to `--carbon-chrome`, which every theme now sets.
2. **Raw accent-tinted colors in `index.css`** — 34 `rgba(212, 175, 106, α)` borders/fills (the
   Original Dark gold, written literally), plus literal sage and brick tints. These leak into any
   theme whose rule is not re-declared in `carbon-ledger.css`, which is why `deep-sea` renders
   gold-tinted hairlines on a teal page today. Replaced with
   `color-mix(in srgb, var(--primary) N%, transparent)` (and the `--green` / `--red` equivalents) —
   the pattern `carbon-ledger.css` already uses. This is a latent-bug fix that `deep-sea` gets for
   free, not new indirection.

Three hardcoded *foreground* colors sat on accent backgrounds (`#16110a` on the gold gradient,
`#06280f` on green, `#ffffff` on primary). They now read `var(--theme-primary-contrast, <old>)` and
`var(--theme-on-accent, <old>)`, so the fallback preserves today's dark rendering byte-for-byte and
only `daylight` changes.

## Contrast contract

Every foreground token clears WCAG AA (4.5:1) against all three light surfaces, and every accent
clears AA as a button background carrying canvas-colored text. Measured:

| Foreground | on canvas | on surface | on raised |
|---|---|---|---|
| text | 15.39 | 16.92 | 17.36 |
| text-secondary | 8.42 | 9.25 | 9.49 |
| text-tertiary | 5.11 | 5.62 | 5.77 |
| copper | 5.18 | 5.70 | 5.85 |
| sage | 5.48 | 6.03 | 6.18 |
| amber | 4.85 | 5.34 | 5.47 |
| brick | 5.63 | 6.19 | 6.35 |

Canvas-on-copper 5.18, canvas-on-sage 5.48, canvas-on-brick 5.63.

`src/lightTheme.test.ts` asserts these ratios from the CSS itself, so a future palette edit that
drops a token under 4.5:1 fails the suite rather than shipping. This is deliberately stricter than
the axe E2E pass, which only samples rendered screens.

## Accessibility & behavior

Unchanged: selection is a radio in the existing Appearance subscreen, applies immediately, persists
under `budget-tracker-theme-v2`, and announces "Theme applied and saved" through the existing status
region. Invalid or missing stored values still fall back to `original-dark`, which remains the
default — this adds an option, it does not change what new users see.

The desktop backdrop (M5) keeps working: it derives from
`color-mix(in srgb, var(--bg) 82%, black)`, so on paper it renders as a slightly deeper paper tone
and body still differs from the app column, which is what the M5 E2E assertion checks.

## Trade-offs

- **Three themes again, not two.** U3 argued theme count is a maintenance liability, and it is —
  but U2 ranks above U3 in the audit precisely because a light option is a different *capability*,
  not another skin. Cost is bounded: `daylight` adds one token block, no bespoke layout, and the
  contrast test is automated.
- **No auto light/dark by system preference.** Deferred deliberately. Auto-switching interacts with
  the explicit picker (which wins? does the pick pin or track?) and deserves its own decision; the
  token work here is exactly what a future `prefers-color-scheme` default would build on.
- **`color-mix` browser support.** Safari 16.2+/Chrome 111+. The app already ships `color-mix` in
  `carbon-ledger.css` and `index.css`, and targets installed iOS PWAs on 16.4+ for other reasons,
  so this widens no support floor.
