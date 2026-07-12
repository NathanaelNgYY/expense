# Settings Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the flat Settings screen into an iOS-style hub with three focused subscreens (Budget & Categories, Appearance, Data & Backup), two levels deep, preserving every existing feature.

**Architecture:** `Settings.tsx` becomes a thin shell holding a `subscreen` state (`'hub' | 'budget' | 'appearance' | 'data'`) and rendering the hub + danger zone; each subscreen is its own component under `src/screens/settings/` owning its own state, reading `useEntries()` / `useSharedBudgets()` / `useTheme()` directly. Each subscreen renders its own header via a shared `SettingsHeader`. Spec: `docs/superpowers/specs/2026-07-12-settings-redesign-design.md`.

**Tech Stack:** React 19, TypeScript, Vitest (raw-DOM test style — no RTL; match `Settings.test.tsx` conventions), lucide-react icons, existing CSS tokens in `src/index.css`.

## Global Constraints

- Repo root is `budget-tracker/`; run all commands there.
- Never break these element ids (tests + a11y depend on them): `budget-monthly-income`, `budget-<key>`, `custom-<id>`, `edit-cat-name`, `new-cat-name`, `new-cat-budget`, `shared-monthly-limit`, `shared-cat-<id>`, `shared-new-cat-name`, `shared-new-cat-budget`, `paste-import-box`.
- Preserve `id` + `dedupeKey` semantics on entries; no storage/sync/back-end changes.
- Use existing CSS custom properties only (`--primary`, `--text-secondary`, etc.); no raw hex in components.
- All new UI copy verbatim from the spec (e.g. `CSV — entries only`, `Duplicates are skipped automatically on import.`). The dash is an em dash.
- CSV import success **no longer** calls `onBack()`; it shows the count message in place. Shared-budget save returns to the hub, not out of Settings.
- Commit after every task with a conventional-commit message.

---

### Task 1: `SettingsHeader` + `CategoryEditorForm` shared components

**Files:**
- Create: `src/screens/settings/SettingsHeader.tsx`
- Create: `src/screens/settings/CategoryEditorForm.tsx`
- Test: `src/screens/settings/CategoryEditorForm.test.tsx`

**Interfaces:**
- Produces: `SettingsHeader({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void })` — default export.
- Produces: `CategoryEditorForm({ idPrefix, initialLabel?, initialIcon?, withBudget?, doneLabel, busy?, onDone, onCancel })` — default export; `onDone` receives `{ label: string; icon: string; budget: string }` with `label` already trimmed and non-empty.

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/settings/CategoryEditorForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import CategoryEditorForm from './CategoryEditorForm'

function changeInput(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickButton(container: HTMLElement, predicate: (b: HTMLButtonElement) => boolean): void {
  const button = [...container.querySelectorAll('button')].find(predicate)
  if (!button) throw new Error('Button not found')
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('CategoryEditorForm', () => {
  let root: Root | null = null
  let container: HTMLElement

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
  })

  it('disables Done until the label is non-empty and reports trimmed values', () => {
    const onDone = vi.fn()
    root = createRoot(container)
    act(() => {
      root!.render(
        <CategoryEditorForm idPrefix="edit-cat" doneLabel="Done" onDone={onDone} onCancel={() => undefined} />,
      )
    })

    const done = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Done')!
    expect(done.disabled).toBe(true)

    changeInput(container.querySelector<HTMLInputElement>('#edit-cat-name')!, '  Food  ')
    clickButton(container, b => b.getAttribute('aria-label') === 'Icon Heart')
    expect(done.disabled).toBe(false)
    clickButton(container, b => b.textContent?.trim() === 'Done')

    expect(onDone).toHaveBeenCalledWith({ label: 'Food', icon: 'Heart', budget: '' })
  })

  it('renders the budget field only when withBudget is set', () => {
    const onDone = vi.fn()
    root = createRoot(container)
    act(() => {
      root!.render(
        <CategoryEditorForm idPrefix="new-cat" withBudget doneLabel="Add" onDone={onDone} onCancel={() => undefined} />,
      )
    })

    changeInput(container.querySelector<HTMLInputElement>('#new-cat-name')!, 'Gym')
    changeInput(container.querySelector<HTMLInputElement>('#new-cat-budget')!, '120')
    clickButton(container, b => b.textContent?.trim() === 'Add')

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ label: 'Gym', budget: '120' }))
  })

  it('calls onCancel from the Cancel button', () => {
    const onCancel = vi.fn()
    root = createRoot(container)
    act(() => {
      root!.render(
        <CategoryEditorForm idPrefix="edit-cat" doneLabel="Done" onDone={() => undefined} onCancel={onCancel} />,
      )
    })
    clickButton(container, b => b.textContent?.trim() === 'Cancel')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/settings/CategoryEditorForm.test.tsx`
Expected: FAIL — cannot resolve `./CategoryEditorForm`.

- [ ] **Step 3: Write the components**

```tsx
// src/screens/settings/SettingsHeader.tsx
import { ChevronLeft } from 'lucide-react'

interface Props {
  title: string
  backLabel: string
  onBack: () => void
}

export default function SettingsHeader({ title, backLabel, onBack }: Props) {
  return (
    <div className="settings-header">
      <button className="back-btn" type="button" onClick={onBack}>
        <ChevronLeft aria-hidden="true" size={21} strokeWidth={2.4} />
        {backLabel}
      </button>
      <h2 className="settings-title">{title}</h2>
      <div className="settings-header-spacer" />
    </div>
  )
}
```

```tsx
// src/screens/settings/CategoryEditorForm.tsx
import { useState } from 'react'
import BudgetIcon from '../../components/BudgetIcon'
import { CUSTOM_ICON_NAMES } from '../../components/budgetIcons'

export interface CategoryEditorResult {
  label: string
  icon: string
  budget: string
}

interface Props {
  idPrefix: string
  initialLabel?: string
  initialIcon?: string
  withBudget?: boolean
  doneLabel: string
  busy?: boolean
  onDone: (result: CategoryEditorResult) => void
  onCancel: () => void
}

export default function CategoryEditorForm({
  idPrefix,
  initialLabel = '',
  initialIcon = CUSTOM_ICON_NAMES[0],
  withBudget = false,
  doneLabel,
  busy = false,
  onDone,
  onCancel,
}: Props) {
  const [label, setLabel] = useState(initialLabel)
  const [icon, setIcon] = useState(initialIcon)
  const [budget, setBudget] = useState('')

  return (
    <div className="ios-list category-add-form">
      <div className="settings-row">
        <label className="settings-label" htmlFor={`${idPrefix}-name`}>Category name</label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          className="settings-input"
          value={label}
          onChange={event => setLabel(event.target.value)}
        />
      </div>
      {withBudget && (
        <div className="settings-row">
          <label className="settings-label" htmlFor={`${idPrefix}-budget`}>Category budget</label>
          <input
            id={`${idPrefix}-budget`}
            type="number"
            className="settings-input"
            value={budget}
            placeholder="Optional"
            min="0"
            step="1"
            inputMode="decimal"
            onChange={event => setBudget(event.target.value)}
          />
        </div>
      )}
      <div className="icon-picker" role="group" aria-label="Choose an icon">
        {CUSTOM_ICON_NAMES.map(name => (
          <button
            key={name}
            type="button"
            className={`icon-picker-btn ${icon === name ? 'icon-picker-btn--selected' : ''}`}
            aria-label={`Icon ${name}`}
            aria-pressed={icon === name}
            onClick={() => setIcon(name)}
          >
            <BudgetIcon name={name} />
          </button>
        ))}
      </div>
      <div className="category-add-actions">
        <button
          type="button"
          className="save-btn"
          disabled={busy || !label.trim()}
          onClick={() => onDone({ label: label.trim(), icon, budget })}
        >
          {doneLabel}
        </button>
        <button type="button" className="export-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/settings/CategoryEditorForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/
git commit -m "feat: add SettingsHeader and CategoryEditorForm subscreen building blocks"
```

---

### Task 2: `DataSettings` subscreen

**Files:**
- Create: `src/screens/settings/DataSettings.tsx`
- Test: `src/screens/settings/DataSettings.test.tsx` (ports the `Settings JSON backup` describe block and the CSV import test out of `src/screens/Settings.test.tsx` — do **not** delete them from `Settings.test.tsx` yet; that happens in Task 5)

**Interfaces:**
- Consumes: `SettingsHeader` from Task 1; `useEntries()` (`entries`, `addEntry`, `refresh`); `entriesToCsv`, `parseEntriesCsv` from `../../csvEntries`; `buildExportPayload`, `parseImportPayload`, `applyImport` from `../../dataTransfer`.
- Produces: `DataSettings({ onDone }: { onDone: () => void })` — default export. Renders header (title `Data & Backup`, back `Settings`), Export group (2 rows), Import group (3 rows), inline paste area, hint, feedback line. CSV input is the **first** `input[type="file"]` in the DOM.

- [ ] **Step 1: Write the failing test**

Port the helpers (`changeTextarea`, `waitForText`, `clickButton`, `importCsv`, fetch stub) from `Settings.test.tsx` and render `DataSettings` directly. New/renamed behaviors under test:

```tsx
// src/screens/settings/DataSettings.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import DataSettings from './DataSettings'
import { EntriesProvider } from '../../EntriesContext'
import * as dataTransfer from '../../dataTransfer'

vi.mock('../../dataTransfer', async importOriginal => {
  const actual = await importOriginal<typeof import('../../dataTransfer')>()
  return { ...actual, applyImport: vi.fn().mockResolvedValue({ newEntries: 2, newPokerSessions: 1 }) }
})

function renderData(entries: unknown[] = []) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        try {
          const body = JSON.parse(init.body as string) as Record<string, unknown>
          return Promise.resolve(
            new Response(JSON.stringify({ id: crypto.randomUUID(), ...body, source: 'manual' }), { status: 200 }),
          )
        } catch {
          return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
        }
      }
      return Promise.resolve(new Response(JSON.stringify(entries), { status: 200 }))
    }),
  )
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <EntriesProvider>
        <DataSettings onDone={() => undefined} />
      </EntriesProvider>,
    )
  })
  return { container, root }
}

// ...changeTextarea, waitForText, clickButton, importCsv copied verbatim from Settings.test.tsx...

describe('DataSettings', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('groups the five operations under Export and Import headers', () => {
    const rendered = renderData()
    root = rendered.root
    const { container } = rendered
    const sections = [...container.querySelectorAll('.section-title')].map(h => h.textContent)
    expect(sections).toContain('Export')
    expect(sections).toContain('Import')
    expect(container).toHaveTextContent('CSV — entries only')
    expect(container).toHaveTextContent('JSON — full backup')
    expect(container).toHaveTextContent('CSV file')
    expect(container).toHaveTextContent('JSON backup file')
    expect(container).toHaveTextContent('Paste from clipboard')
    expect(container).toHaveTextContent('Duplicates are skipped automatically on import.')
  })

  it('imports CSV entries, deduplicates, reports in place, and does not navigate', async () => {
    const existingEntry = { id: 'entry-1', amount: 3.5, category: 'transport', note: 'Train', date: '2026-05-10' }
    const rendered = renderData([existingEntry])
    root = rendered.root
    await importCsv(
      rendered.container,
      [
        '"id","amount","category","note","date"',
        '"entry-1","3.5","transport","Train","2026-05-10"',
        '"entry-2","12.5","lunch","Chicken rice","2026-05-11"',
      ].join('\n'),
    )
    expect(rendered.container).toHaveTextContent('Imported 1 entr')
  })

  it('downloads a JSON export from the JSON — full backup row', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:x')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const rendered = renderData()
    root = rendered.root
    clickButton(rendered.container, b => b.textContent?.includes('JSON — full backup') ?? false)
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toContain('application/json')
  })

  // Port these four tests from Settings.test.tsx, changing only the row-finder text:
  // - 'imports pasted JSON and reports the result'            → open via 'Paste from clipboard'
  // - 'reports import counts with a sync caveat…'             → waitForText(container, 'Export') before stubbing the failing fetch
  // - 'disables the JSON backup file trigger while in flight' → trigger text 'JSON backup file'
  // - 'shows the validation error for malformed pasted JSON'  → open via 'Paste from clipboard'
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/settings/DataSettings.test.tsx`
Expected: FAIL — cannot resolve `./DataSettings`.

- [ ] **Step 3: Write the component**

Port `handleExport`, `handleImportFile`, `handleExportJson`, `importJsonText`, `handleImportJsonFile` and the `importMessage/importError/showPasteImport/pasteText/jsonBusy` state from `Settings.tsx` **unchanged except**: `handleImportFile` no longer calls `onBack()` on success (delete the `if (newEntries.length > 0) { onBack() }` block).

```tsx
// src/screens/settings/DataSettings.tsx
import { useRef, useState, type ChangeEvent } from 'react'
import { Braces, Clipboard, Download, FileText, Upload } from 'lucide-react'
import SettingsHeader from './SettingsHeader'
import { entriesToCsv, parseEntriesCsv } from '../../csvEntries'
import { buildExportPayload, parseImportPayload, applyImport } from '../../dataTransfer'
import { useEntries } from '../../EntriesContext'

interface Props {
  onDone: () => void
}

interface ActionRowProps {
  icon: React.ReactNode
  label: string
  sub: string
  trailing: React.ReactNode
  disabled?: boolean
  onClick: () => void
}

function ActionRow({ icon, label, sub, trailing, disabled = false, onClick }: ActionRowProps) {
  return (
    <button type="button" className="settings-action-row" disabled={disabled} onClick={onClick}>
      {icon}
      <span className="settings-row-text">
        <span className="settings-action-label">{label}</span>
        <span className="settings-row-sub">{sub}</span>
      </span>
      {trailing}
    </button>
  )
}

export default function DataSettings({ onDone }: Props) {
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState(false)
  const [showPasteImport, setShowPasteImport] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [jsonBusy, setJsonBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const jsonFileInputRef = useRef<HTMLInputElement>(null)
  const { entries, addEntry, refresh } = useEntries()

  function handleExport() { /* ported verbatim from Settings.tsx */ }
  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) { /* ported; no onBack() */ }
  function handleExportJson() { /* ported verbatim */ }
  async function importJsonText(text: string) { /* ported verbatim */ }
  async function handleImportJsonFile(event: ChangeEvent<HTMLInputElement>) { /* ported verbatim */ }

  const downloadGlyph = <Download className="ui-icon settings-row-trailing-icon" aria-hidden="true" strokeWidth={2.2} />
  const uploadGlyph = <Upload className="ui-icon settings-row-trailing-icon" aria-hidden="true" strokeWidth={2.2} />

  return (
    <>
      <SettingsHeader title="Data & Backup" backLabel="Settings" onBack={onDone} />

      <h3 className="section-title">Export</h3>
      <div className="ios-list">
        <ActionRow
          icon={<FileText className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="CSV — entries only"
          sub="Opens in Excel, Sheets, Numbers"
          trailing={downloadGlyph}
          onClick={handleExport}
        />
        <ActionRow
          icon={<Braces className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="JSON — full backup"
          sub="Entries, budgets, categories, poker sessions"
          trailing={downloadGlyph}
          onClick={handleExportJson}
        />
      </div>

      <h3 className="section-title">Import</h3>
      <input ref={importInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleImportFile} />
      <input ref={jsonFileInputRef} type="file" accept=".json,application/json" hidden onChange={handleImportJsonFile} />
      <div className="ios-list">
        <ActionRow
          icon={<FileText className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="CSV file"
          sub="Entries exported from this app"
          trailing={uploadGlyph}
          onClick={() => importInputRef.current?.click()}
        />
        <ActionRow
          icon={<Braces className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="JSON backup file"
          sub="Restores entries, budgets and poker sessions"
          trailing={uploadGlyph}
          disabled={jsonBusy}
          onClick={() => jsonFileInputRef.current?.click()}
        />
        <ActionRow
          icon={<Clipboard className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="Paste from clipboard"
          sub="For exports shared as text"
          trailing={uploadGlyph}
          onClick={() => setShowPasteImport(v => !v)}
        />
      </div>

      {showPasteImport && (
        <div className="settings-row settings-row--stacked">
          <label className="settings-label" htmlFor="paste-import-box">Pasted export</label>
          <textarea
            id="paste-import-box"
            className="settings-input settings-input--wide"
            rows={4}
            value={pasteText}
            onChange={event => setPasteText(event.target.value)}
          />
          <button
            className="export-btn"
            type="button"
            disabled={jsonBusy || pasteText.trim() === ''}
            onClick={() => void importJsonText(pasteText)}
          >
            Import
          </button>
        </div>
      )}

      <p className="settings-hint">Duplicates are skipped automatically on import.</p>

      {importMessage && (
        <p className={`save-feedback ${importError ? 'save-feedback--error' : ''}`} role="status">
          {importMessage}
        </p>
      )}
    </>
  )
}
```

The `/* ported */` bodies are the exact function bodies currently at `Settings.tsx:263-348`; copy them verbatim, then delete the `onBack()` call inside `handleImportFile`'s success branch.

- [ ] **Step 4: Add the new CSS to `src/index.css`** (after the `.settings-input` block in the Settings section):

```css
/* ─── Settings hub & subscreen rows ──────────────────────── */

.settings-nav-row,
.settings-action-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 17px;
  min-height: 58px;
}

.settings-nav-row:active,
.settings-action-row:active {
  opacity: 0.7;
}

.settings-action-row:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-nav-row > .ui-icon,
.settings-action-row > .ui-icon {
  color: var(--primary);
}

.settings-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-row-sub {
  color: var(--text-secondary);
  font-size: 12px;
}

.settings-action-label {
  color: var(--primary);
  font-weight: 500;
}

.settings-nav-chevron,
.settings-row-trailing-icon {
  color: var(--text-tertiary);
  flex: 0 0 auto;
}

.settings-hint {
  color: var(--text-secondary);
  font-size: 12px;
  padding: 0 4px;
}

.settings-danger--push {
  margin-top: auto;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/screens/settings/DataSettings.test.tsx`
Expected: PASS. Also run `npx vitest run src/screens/Settings.test.tsx` — still PASS (old screen untouched).

- [ ] **Step 6: Commit**

```bash
git add src/screens/settings/DataSettings.tsx src/screens/settings/DataSettings.test.tsx src/index.css
git commit -m "feat: add Data & Backup subscreen with grouped export/import rows"
```

---

### Task 3: `SharedBudgetSettings` subscreen section

**Files:**
- Create: `src/screens/settings/SharedBudgetSettings.tsx`
- Test: `src/screens/settings/SharedBudgetSettings.test.tsx` (ports the `edits the selected shared budget…` test, rendering the component directly with the mocked shared context)

**Interfaces:**
- Consumes: `useSharedBudgets()`; `CategoryEditorForm` (`idPrefix="shared-new-cat"`, `withBudget`, `doneLabel="Add"`); `BudgetIcon`.
- Produces: `SharedBudgetSettings({ onSaved }: { onSaved: () => void })` — default export. No header (rendered inside `BudgetSettings` below the scope switch). Calls `onSaved()` after a successful save.

- [ ] **Step 1: Write the failing test** — port the shared-budget test from `Settings.test.tsx:360-401` with the same `sharedCtx` mock, rendering `<SharedBudgetSettings onSaved={onSaved} />` directly (no scope-switch click needed), and additionally assert `onSaved` was called after `Save Shared Budget`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/settings/SharedBudgetSettings.test.tsx`
Expected: FAIL — cannot resolve `./SharedBudgetSettings`.

- [ ] **Step 3: Write the component** — port from `Settings.tsx` verbatim: state (`selectedBudgetId`, `sharedLimit`, `sharedCategoryBudgets`, `showSharedAdd`, `sharedBusy`, `syncedActive` render-time re-seed block at lines 98-112), the `openBudget` effect (lines 90-93), `parseOptionalBudget`, `handleAddSharedCategory` (now delegating label/icon/budget to `CategoryEditorForm`'s `onDone`), `handleSaveShared` (replace `onBack()` with `onSaved()`), and the entire `settingsScope === 'shared'` JSX branch (lines 421-591) minus the scope switch itself. The add-category form becomes:

```tsx
{showSharedAdd ? (
  <CategoryEditorForm
    idPrefix="shared-new-cat"
    withBudget
    doneLabel="Add"
    busy={sharedBusy}
    onDone={result => void handleAddSharedCategory(result)}
    onCancel={() => setShowSharedAdd(false)}
  />
) : (
  <button type="button" className="export-btn" onClick={() => setShowSharedAdd(true)}>
    <Plus aria-hidden="true" size={18} strokeWidth={2.3} />
    Add category
  </button>
)}
```

with `handleAddSharedCategory({ label, icon, budget }: CategoryEditorResult)` calling `shared.addCategory({ label, budgetAmount: parseOptionalBudget(budget), icon })` and closing the form on success.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/settings/SharedBudgetSettings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/SharedBudgetSettings.tsx src/screens/settings/SharedBudgetSettings.test.tsx
git commit -m "feat: extract shared budget editing into its own settings section"
```

---

### Task 4: `BudgetSettings` subscreen (personal + scope switch)

**Files:**
- Create: `src/screens/settings/BudgetSettings.tsx`
- Test: `src/screens/settings/BudgetSettings.test.tsx` (ports the `Settings monthly income` income test and the whole `Settings custom categories` describe from `Settings.test.tsx`, rendering `BudgetSettings` directly)

**Interfaces:**
- Consumes: `SettingsHeader`, `CategoryEditorForm`, `SharedBudgetSettings`; storage helpers (`getBudgetConfig` … `makeCustomCategoryId`); `categoryLabel/categoryIcon`; `countEntriesForCategory`; `useEntries()`; `useSharedBudgets()` (for `budgets.length` and the scope switch).
- Produces: `BudgetSettings({ onDone }: { onDone: () => void })` — default export. Header title `Budget`, back `Settings`. Back tap runs the dirty guard (`confirm('You have unsaved budget changes. Leave without saving?')`) before `onDone()` — personal scope only.

- [ ] **Step 1: Write the failing test** — port the tests listed above with `renderWithEntries` rendering:

```tsx
<ThemeProvider>
  <EntriesProvider>
    <BudgetSettings onDone={onDone} />
  </EntriesProvider>
</ThemeProvider>
```

plus two new tests:

```tsx
it('guards Back when the form is dirty', () => {
  const onDone = vi.fn()
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const rendered = renderBudget({ onDone })
  root = rendered.root
  changeInput(rendered.container.querySelector<HTMLInputElement>('#budget-monthly-income')!, '1800')
  clickButton(rendered.container, b => b.textContent?.includes('Settings') ?? false)
  expect(confirmSpy).toHaveBeenCalledOnce()
  expect(onDone).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

it('goes back without confirm when clean', () => {
  const onDone = vi.fn()
  const confirmSpy = vi.spyOn(window, 'confirm')
  const rendered = renderBudget({ onDone })
  root = rendered.root
  clickButton(rendered.container, b => b.textContent?.includes('Settings') ?? false)
  expect(confirmSpy).not.toHaveBeenCalled()
  expect(onDone).toHaveBeenCalledOnce()
  confirmSpy.mockRestore()
})
```

The shared-budget scope test moves here too (click `Shared`, then assert `SharedBudgetSettings` content appears — reuse the ported shared test's mock).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/settings/BudgetSettings.test.tsx`
Expected: FAIL — cannot resolve `./BudgetSettings`.

- [ ] **Step 3: Write the component** — port from `Settings.tsx` verbatim: `BUDGET_FIELDS`, `EDITABLE_BASICS`, config/customCategories/overrides state, `handleChange`, saved-snapshot dirty tracking (lines 126-136), `startEditBasic`/`startEditCustom` collapse into `editingId` state only (the form now owns label/icon via `CategoryEditorForm` `initialLabel`/`initialIcon`), `saveBasicEdit`/`saveCustomEdit` take the form result, `handleAddCategory` takes the form result, `handleCustomBudgetChange`, `handleRemoveCategory`, total/mismatch, save bar. Structure:

```tsx
export default function BudgetSettings({ onDone }: Props) {
  const shared = useSharedBudgets()
  const [scope, setScope] = useState<'personal' | 'shared'>('personal')
  // …personal state as ported…

  function handleBack() {
    if (scope === 'personal' && isDirty && !confirm('You have unsaved budget changes. Leave without saving?')) return
    onDone()
  }

  return (
    <>
      <SettingsHeader title="Budget" backLabel="Settings" onBack={handleBack} />
      {shared.budgets.length > 0 && (
        /* scope-switch markup ported verbatim from Settings.tsx:396-417, driving setScope */
      )}
      {scope === 'shared' ? (
        <SharedBudgetSettings onSaved={onDone} />
      ) : (
        /* personal JSX ported from Settings.tsx:594-767 + save bar 859-867,
           with renderCategoryEditor replaced by CategoryEditorForm:
           - basic edit:  <CategoryEditorForm idPrefix="edit-cat" initialLabel={categoryLabel(key, overrides)}
                            initialIcon={categoryIcon(key, overrides)} doneLabel="Done"
                            onDone={r => saveBasicEdit(key as Category, r)} onCancel={() => setEditingId(null)} />
           - custom edit: same with initialLabel={cat.label} initialIcon={cat.icon}
                            onDone={r => saveCustomEdit(cat, r)}
           - add:         <CategoryEditorForm idPrefix="new-cat" withBudget doneLabel="Add"
                            onDone={handleAddCategory} onCancel={() => setShowAdd(false)} /> */
      )}
    </>
  )
}
```

`saveBasicEdit(key: Category, { label, icon }: CategoryEditorResult)` keeps the existing only-store-diffs logic (`label !== CATEGORY_LABELS[key]`, `icon !== key`). `handleAddCategory({ label, icon, budget })` parses budget with the existing empty→null rule.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/settings/BudgetSettings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/BudgetSettings.tsx src/screens/settings/BudgetSettings.test.tsx
git commit -m "feat: add Budget & Categories subscreen with scope switch and dirty guard"
```

---

### Task 5: Settings shell — hub, AppearanceSettings, rewrite `Settings.tsx`, migrate tests

**Files:**
- Create: `src/screens/settings/AppearanceSettings.tsx`
- Rewrite: `src/screens/Settings.tsx`
- Rewrite: `src/screens/Settings.test.tsx` (delete the ported describes; keep only shell/hub tests)

**Interfaces:**
- Consumes: everything produced by Tasks 1-4; `useTheme()` from `../theme/ThemeContext`; `THEMES` from `../theme/themeRegistry`; `useEntries()` for the month reset.
- Produces: `Settings({ onBack }: { onBack: () => void })` — unchanged public interface (App.tsx untouched).

- [ ] **Step 1: Write the failing tests** — rewrite `Settings.test.tsx` to cover the shell only (keep the existing mock/setup helpers):

```tsx
it('shows the hub with three nav rows and the reset action, no budget inputs', () => { /* assert
  'Budget & Categories', 'Appearance', 'Data & Backup', 'Reset This Month' present;
  container.querySelector('#budget-monthly-income') is null */ })

it('shows the current theme name on the Appearance row', () => { /* assert 'Original Dark' */ })

it('navigates to Budget & Categories and back', () => { /* click row → #budget-monthly-income
  exists; click back 'Settings' → hub rows again */ })

it('navigates to Appearance and shows the theme picker', () => { /* click row →
  container.textContent includes 'Applies immediately' and the radiogroup renders */ })

it('navigates to Data & Backup', () => { /* click row → 'CSV — entries only' visible */ })

it('exits Settings from the hub back button', () => { /* onBack spy called */ })

it('resets the current month from the hub danger zone', () => { /* port the confirm-mock reset
  pattern: seed one current-month entry, confirm → removeEntry path; assert fetch DELETE or
  entries list refresh — mirror how handleReset works today (confirm mocked true) */ })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/screens/Settings.test.tsx`
Expected: FAIL — hub markup does not exist yet.

- [ ] **Step 3: Write `AppearanceSettings` and the new `Settings.tsx`**

```tsx
// src/screens/settings/AppearanceSettings.tsx
import SettingsHeader from './SettingsHeader'
import ThemePicker from '../../theme/ThemePicker'

interface Props {
  onDone: () => void
}

export default function AppearanceSettings({ onDone }: Props) {
  return (
    <>
      <SettingsHeader title="Appearance" backLabel="Settings" onBack={onDone} />
      <ThemePicker />
      <p className="settings-hint">Applies immediately. No save needed.</p>
    </>
  )
}
```

```tsx
// src/screens/Settings.tsx (complete replacement)
import { useState } from 'react'
import { ChevronRight, Database, Palette, Trash2, Wallet } from 'lucide-react'
import SettingsHeader from './settings/SettingsHeader'
import BudgetSettings from './settings/BudgetSettings'
import AppearanceSettings from './settings/AppearanceSettings'
import DataSettings from './settings/DataSettings'
import { useEntries } from '../EntriesContext'
import { useTheme } from '../theme/ThemeContext'
import { THEMES } from '../theme/themeRegistry'

interface Props {
  onBack: () => void
}

type SettingsSubscreen = 'hub' | 'budget' | 'appearance' | 'data'

function isEntryInMonth(date: string, year: number, month: number): boolean {
  const [entryYear, entryMonth] = date.split('-').map(Number)
  return entryYear === year && entryMonth === month + 1
}

interface NavRowProps {
  icon: React.ReactNode
  label: string
  sub: string
  onClick: () => void
}

function NavRow({ icon, label, sub, onClick }: NavRowProps) {
  return (
    <button type="button" className="settings-nav-row" onClick={onClick}>
      {icon}
      <span className="settings-row-text">
        <span>{label}</span>
        <span className="settings-row-sub">{sub}</span>
      </span>
      <ChevronRight className="ui-icon settings-nav-chevron" aria-hidden="true" strokeWidth={2.4} />
    </button>
  )
}

export default function Settings({ onBack }: Props) {
  const [subscreen, setSubscreen] = useState<SettingsSubscreen>('hub')
  const { entries, removeEntry } = useEntries()
  const { theme } = useTheme()
  const themeName = THEMES.find(option => option.id === theme)?.name ?? THEMES[0].name

  async function handleReset() {
    if (!confirm("Delete all entries for the current month? This can't be undone.")) return
    const now = new Date()
    const toRemove = entries.filter(entry => isEntryInMonth(entry.date, now.getFullYear(), now.getMonth()))
    for (const entry of toRemove) {
      await removeEntry(entry.id)
    }
  }

  const goHub = () => setSubscreen('hub')

  return (
    <div className="screen settings">
      {subscreen === 'budget' && <BudgetSettings onDone={goHub} />}
      {subscreen === 'appearance' && <AppearanceSettings onDone={goHub} />}
      {subscreen === 'data' && <DataSettings onDone={goHub} />}
      {subscreen === 'hub' && (
        <>
          <SettingsHeader title="Settings" backLabel="Back" onBack={onBack} />
          <div className="ios-list">
            <NavRow
              icon={<Wallet className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Budget & Categories"
              sub="Income, monthly budgets, custom categories"
              onClick={() => setSubscreen('budget')}
            />
            <NavRow
              icon={<Palette className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Appearance"
              sub={themeName}
              onClick={() => setSubscreen('appearance')}
            />
            <NavRow
              icon={<Database className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Data & Backup"
              sub="Export, import, restore"
              onClick={() => setSubscreen('data')}
            />
          </div>

          <section className="danger-zone settings-danger--push" aria-labelledby="danger-zone-title">
            <h3 id="danger-zone-title" className="danger-zone__title">Danger zone</h3>
            <p className="danger-zone__body">
              Deletes every entry logged this month. Exported CSVs are unaffected.
            </p>
            <button className="danger-btn" type="button" onClick={() => void handleReset()}>
              <Trash2 aria-hidden="true" size={18} strokeWidth={2.3} />
              Reset This Month&apos;s Data
            </button>
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Delete the describes that moved** (`Settings JSON backup`, CSV import test, custom categories, shared budget, monthly income) from `Settings.test.tsx`, leaving the shell tests from Step 1 plus the shared setup helpers they need.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/screens/`
Expected: PASS across Settings.test.tsx and all four subscreen test files.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Settings.tsx src/screens/Settings.test.tsx src/screens/settings/AppearanceSettings.tsx
git commit -m "feat: restructure Settings into iOS-style hub with focused subscreens"
```

---

### Task 6: Full verification sweep

**Files:**
- Modify: none expected; fix regressions if found.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all files PASS, including untouched screens (Dashboard/History/Poker) and `appShellLayout.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean. Remove any now-unused imports/exports flagged in `Settings.tsx` neighbors.

- [ ] **Step 3: Type-check + production build**

Run: `npm run build`
Expected: `tsc -b` clean, Vite build succeeds.

- [ ] **Step 4: Manual smoke via dev server** (visual check only)

Run: `npm run dev` and open `http://localhost:5173` → Settings: hub shows three rows + danger pill; each row opens its subscreen; Back returns; budget edit → dirty guard on back; theme switch on Appearance applies instantly; Data & Backup shows Export/Import groups.

- [ ] **Step 5: Final commit (only if fixes were needed)**

```bash
git add -A src/
git commit -m "fix: settings hub verification fixes"
```

---

## Self-Review Notes

- Spec coverage: hub (Task 5), Budget+scope toggle+dirty guard (Task 4), shared save→hub (Task 3), Appearance+hint (Task 5), Data groups + no-onBack CSV + hint + feedback (Task 2), CSS vocabulary (Task 2 Step 4), test migration (Tasks 2-5), out-of-scope untouched.
- Ids preserved per Global Constraints; `CategoryEditorForm` idPrefix mapping keeps `edit-cat-name` / `new-cat-name` / `shared-new-cat-name` intact.
- Type consistency: `CategoryEditorResult { label; icon; budget: string }` is the single form contract consumed by Tasks 3-4; `onDone`/`onSaved` navigation callbacks all `() => void`.
