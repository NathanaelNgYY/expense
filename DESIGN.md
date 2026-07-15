# Design

Visual system captured from the live code (`src/index.css`, `src/themes.css`). Tokens are
CSS custom properties on `:root`; alternate themes override them via `[data-theme='…']`.
When styling anything, use the tokens — never raw hex — so all four themes keep working.

## Theme

Dark, always. The default "Wallet" theme is a deep felt-green with gold-foil accents —
money as leather, felt, and gilt. Three alternate themes (Deep Sea, Copper Current, Berry
Circuit) restyle the same tokens; they may change radius (`--theme-card-radius`,
`--theme-control-radius`) and display font but never the component vocabulary.

## Color (default "Wallet" theme)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0a120f` | App background (felt green-black) |
| `--bg-elev` | `#0f1b16` | Grouped lists, cards |
| `--bg-elev-2` | `#15251e` | Inputs, nested surfaces |
| `--text` | `#f1ece0` | Primary text (warm ivory) |
| `--text-secondary` | `rgba(241,236,224,.58)` | Labels, section headers |
| `--text-tertiary` | `rgba(241,236,224,.34)` | Hints, chevrons |
| `--primary` | `#d4af6a` | Gold accent: interactive color, replaces iOS blue |
| `--green` | `#6fae7a` | On-budget / positive |
| `--warning` / `--yellow` | `#d9a441` | Approaching limit |
| `--red` | `#c96a5a` | Over budget / destructive |
| `--blue` | `#7fb3c9` | Informational |
| `--separator` | `rgba(212,175,106,.18)` | Hairline row separators (gold-tinted) |
| `--fill` | `rgba(212,175,106,.08)` | Subtle gold-tinted fills (segmented control track) |

Semantic colors communicate budget state only; gold is the sole interactive accent.
Borders are gold-tinted alphas (`rgba(212,175,106,.16–.4)`), never gray.

## Typography

- `--font-display`: Georgia / Palatino serif — hero money numerals and display titles only.
  Theme-overridable (Copper Current swaps to Arial Narrow).
- `--font-body`: system sans stack (`-apple-system, …`) — everything else.
- Scale (fixed px, iOS-flavored): 17px row labels/buttons (600 for emphasis), 15px dense
  rows, 13px uppercase section headers (`letter-spacing .04–.05em`, `--text-secondary`),
  11–13px captions. `font-variant-numeric: tabular-nums` wherever digits align.

## Layout

- Single column, max-width 430px, centered; the `.app` shell owns the viewport and each
  `.screen` scrolls independently (scrollbars hidden), `gap: 12px`, 20px side padding,
  safe-area insets respected (`env(safe-area-inset-top)`).
- iOS grouped-list grammar: `.section-title` header above an `.ios-list` container
  (`--bg-elev`, 14px radius, 1px gold-tinted border, rows padded `14px 16px`, 0.5px
  separators between rows).
- Bottom tab bar for primary navigation; Settings is a pushed screen with back chevron.

## Components

- **Rows** (`.settings-row`, `.entry-row`): flex space-between, ≥50px tall, icon+label left
  (icons take `--primary`), value/control right.
- **Pills** (full-width, 999px radius, ≥50px, 17px/600): `.save-btn` gold gradient
  (`#b6924f → #e8cd8f → #b6924f`, dark ink text) for the primary action; `.export-btn`
  dashed gold outline, transparent, for secondary actions; `.danger-btn` red outline for
  destructive. One gold gradient pill per screen, max.
- **Segmented control** (`.scope-switch`): gold-tinted track, 14px radius, active segment
  lifts to `--bg-elev`.
- **Cards** (`.card`): green gradient (`155deg, #163b2c → #0a1611`), 18px radius, gold
  border, soft drop shadow.
- **Dashboard passes** (`.pass`): flat `--bg-elev` surfaces so stacked personal/shared
  budgets recede behind the amount; themes vary shape and shadow, not surface decoration.
- **Inputs** (`.settings-input`): borderless on `--bg-elev-2`, 10px radius, 17px text,
  right-aligned numerics, `inputMode="decimal"`.
- Every interactive element has an `:active` state; feedback is immediate.

## Motion

Minimal and physical: press feedback is `transform: scale(.96)` + `opacity: .8` on
`:active` (cards `scale(.99)`); no orchestrated entrances, no decorative animation.
Anything added must honor `prefers-reduced-motion` with an instant/crossfade fallback.

## Iconography

`lucide-react`, 16–21px, `strokeWidth 2.2–2.4`, colored `--primary` in labels and
`--text-tertiary` for chevrons/affordances. Category icons via `BudgetIcon`.
