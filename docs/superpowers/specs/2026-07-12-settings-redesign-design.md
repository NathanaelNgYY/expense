# Settings Redesign — iOS Hub + Subscreens

**Date:** 2026-07-12
**Status:** implemented (approved direction: `two-levels-only`)
**Owner:** Settings screen only. No backend, storage, or sync changes.

## Problem

`src/screens/Settings.tsx` is one flat scroll mixing daily-use budget editing with
once-a-year data transfer at equal visual weight. Five near-identical pill buttons
(Export CSV / Import CSV / Export JSON / Import JSON / Paste import) force users to parse
text to tell export from import. Inline expanding editors shove the page around, and save
semantics are inconsistent on a single surface (budgets need explicit Save; imports and
theme apply instantly).

## Design

iOS-style hub + subscreens, **two levels deep, never more**. No action sheets, no modals
(the user explicitly rejected a depth-2 sheet layer). Every existing feature survives —
relocated, not cut. All styling uses existing tokens and component vocabulary
(`.ios-list`, `.section-title`, pills, segmented control) per `DESIGN.md`.

### Navigation model

- `type SettingsSubscreen = 'hub' | 'budget' | 'appearance' | 'data'` — plain `useState`
  in `Settings.tsx`, matching the app's existing `showSettings` boolean pattern in
  `App.tsx`. No router.
- Header is shared: back chevron + centered title.
  - Hub: back label **Back** (exits Settings via `onBack`), title **Settings**.
  - Subscreens: back label **Settings** (returns to hub), titles **Budget** /
    **Appearance** / **Data & Backup**.
- Leaving the Budget subscreen with unsaved edits triggers the existing
  `confirm('You have unsaved budget changes. Leave without saving?')` guard. The hub
  itself can never be dirty.

### Depth 0 — Hub

One `.ios-list` of three tappable nav rows (full-width buttons, trailing chevron,
gold leading icon, two-line label):

| Row | Subtitle | Icon (lucide) |
|---|---|---|
| Budget & Categories | Income, monthly budgets, custom categories | `Wallet` |
| Appearance | *current theme name* (from `useTheme()` + `THEMES` registry) | `Palette` |
| Data & Backup | Export, import, restore | `Database` |

Below, pushed to the bottom (`margin-top: auto`): the existing danger zone (title, body
copy, red `Reset This Month's Data` pill + `confirm()`), unchanged behavior. The
Personal/Shared scope toggle does **not** appear on the hub.

### Depth 1 — Budget & Categories

Everything money, nothing else:

- **Scope toggle** (Personal/Shared segmented control) at top — only rendered when
  `shared.budgets.length > 0`. Shared mode keeps today's behavior exactly: budget picker
  when >1 shared budget, owner-only editing, per-category budgets, add/remove category,
  `Save Shared Budget`. After a successful shared save, return to the **hub** (today it
  exits Settings entirely).
- **Personal mode:** Income row → Monthly Budgets list (basic categories with pencil
  rename/re-icon editors, Buffer fixed) → custom categories (edit/remove) → Add category
  (inline form, unchanged) → remove-error message → Total with income-mismatch warning →
  sticky `Unsaved changes / Save changes` bar (dirty only).
- Budget form state (config, custom categories, overrides, dirty snapshot) lives inside
  this subscreen component and unmounts with it; the dirty guard runs on its Back tap.

### Depth 1 — Appearance

`ThemePicker` unchanged, plus a hint line: *"Applies immediately. No save needed."* —
stating the instant-save behavior instead of leaving it implicit.

### Depth 1 — Data & Backup

All five operations visible inline as list rows — no extra taps, no sheets. Two grouped
lists with `.section-title` headers:

**Export**
- `CSV — entries only` · sub: *Opens in Excel, Sheets, Numbers* → existing CSV download.
- `JSON — full backup` · sub: *Entries, budgets, categories, poker sessions* → existing
  JSON download.

**Import**
- `CSV file` · sub: *Entries exported from this app* → hidden file input, unchanged
  parse/dedupe. **Behavior change:** on success, stay on this screen and show the count
  message (today it exits Settings via `onBack`), consistent with JSON import.
- `JSON backup file` · sub: *Restores entries, budgets and poker sessions* → hidden file
  input; disabled while an import is in flight (`jsonBusy`).
- `Paste from clipboard` · sub: *For exports shared as text* → toggles today's inline
  textarea + Import button below the list.

Hint line under the lists: *"Duplicates are skipped automatically on import."* Import
feedback (`importMessage`, success or error styling) renders beneath, exactly as today.

Rows are buttons styled as action rows: gold label, secondary sub-line, trailing
download/upload glyph. Same row anatomy as hub nav rows minus the chevron.

## File structure

`Settings.tsx` (~870 lines) splits by subscreen; each unit has one purpose and its own
state:

```
src/screens/Settings.tsx                     — shell: header, subscreen state, hub, danger zone
src/screens/settings/BudgetSettings.tsx      — scope toggle + personal budget editing
src/screens/settings/SharedBudgetSettings.tsx— shared budget editing (owner gating, picker)
src/screens/settings/CategoryEditorForm.tsx  — name + icon-picker form (edit/add, both scopes)
src/screens/settings/AppearanceSettings.tsx  — ThemePicker + hint
src/screens/settings/DataSettings.tsx        — export/import/paste, feedback state
```

Subscreens read `useEntries()` / `useSharedBudgets()` / `useTheme()` directly (existing
contexts); the shell passes only navigation callbacks. New CSS in `index.css`:
`.settings-nav-row`, `.settings-row-sub`, `.settings-action-row`, `.settings-hint`
— composed from existing tokens.

## Error handling

Unchanged paths preserved verbatim: CSV parse errors and JSON validation errors render in
the feedback line with error styling; category-removal blocking (entries still tagged)
shows the existing message; failed post-import refresh keeps the "saved — list will
update on next sync" caveat; shared-context errors render via `shared.error`.

## Testing

`Settings.test.tsx` updates to the new navigation (tests are colocated, raw-DOM style —
keep that convention):

- New: hub renders the three nav rows + reset pill and no budget inputs; tapping a row
  opens its subscreen; Back returns to hub; dirty Budget back-tap fires the confirm guard.
- Updated: existing budget/category/shared tests first navigate to Budget & Categories;
  CSV/JSON/paste tests navigate to Data & Backup; CSV import success asserts the count
  message renders in place (no `onBack`).
- Unchanged: `ThemePicker` tests; storage/compute layers untouched.

## Out of scope

Backend/Supabase migration work, Dashboard/History/Poker screens, the ingest token flow,
any change to storage keys or entry semantics, App Store plan (on hold).
