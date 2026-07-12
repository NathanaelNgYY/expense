# Vercel Hosting Move + Prod Supabase Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the budget-tracker PWA on Vercel against the production Supabase project, with a JSON export/import feature so all 3 users carry their origin-locked data across, and merge everything to `main`.

**Architecture:** Vercel is a pure static host (Vite build → `dist/`); the client talks to Supabase directly and ingest is a Supabase Edge Function, so no host-side functions exist. Data crosses the origin change via export (bookmarklet on the old origin / button on the new app) → import (file or pasted JSON) which upserts through the existing idempotent bulk APIs.

**Tech Stack:** React 19 + Vite + TypeScript, Vitest, supabase-js, Supabase CLI, Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-07-12-vercel-prod-cutover-design.md`

## Global Constraints

- Never clear or shrink localStorage — import/export only *copies* data (spec C2).
- Preserve `id` and `dedupeKey` on every upload; re-import must be a no-op (`onConflict: 'id', ignoreDuplicates: true` semantics already in `bulkUpsertEntries`).
- **Netlify is read-only**: zero deploys remain on the plan. Never run `netlify deploy`. The old site keeps running untouched as fallback.
- Prod Supabase project: **igsjhpfymspbyzqzpzme** ("Budget"). Staging (rjwzzsocxykbfellsihr) is deleted only in the final task, after cutover verification.
- All commands run from the `budget-tracker/` git repo root (NOT the `BudgetTracking/` wrapper).
- Personal data (Blobs backups, real export files) is never committed to git.
- Run the working directory's existing test suite before and after each task: `npm test` must stay green.
- Windows/PowerShell environment; Bash tool available. `npx vercel` v55 and `npx supabase` v2.109 are available.

## Execution model

- Tasks 1–6 are code/git work → dispatch to subagents (Sonnet).
- Tasks 7–9 are infrastructure + runbook: they need interactive logins (`supabase login`, `vercel login`) and the owner's phone — the orchestrator runs these with the user, not a subagent.

---

### Task 1: Clean scratch files and commit the existing Supabase-migration working tree

The working tree holds the finished Netlify→Supabase code migration (uncommitted). Commit it in logical pieces so the branch is reviewable, then the repo is clean for feature work.

**Files:**
- Delete: `dev-output.txt`, `dev-theme.err`, `dev-theme.out` (scratch capture files)
- Modify: `.gitignore` (already modified in tree — verify it covers `.agents/` and `.superpowers/`; add if missing)
- Commit everything else listed by `git status` (see steps)

**Interfaces:**
- Produces: a clean `git status` on branch `improvement/production-readiness` with all migration work committed. Later tasks build on `src/api.ts` exports (`bulkUpsertEntries(entries: Entry[]): Promise<void>`, `bulkUpsertPokerSessions(sessions: PokerSession[]): Promise<void>`) and `src/storage.ts` getters, all committed here.

- [ ] **Step 1: Verify baseline is green**

Run: `npm test`
Expected: all Vitest suites PASS. If anything fails, STOP and report — do not commit a red tree.

- [ ] **Step 2: Delete scratch files**

```bash
rm dev-output.txt dev-theme.err dev-theme.out
```

- [ ] **Step 3: Ensure agent-scratch dirs are ignored**

Check `.gitignore` contains lines `.agents/` and `.superpowers/`. If not, append them.

- [ ] **Step 4: Commit the Supabase backend (schema + Edge Function + scripts)**

```bash
git add supabase/ scripts/mint-ingest-token.mjs scripts/seed-localstorage.js
git commit -m "feat: Supabase schema, ingest Edge Function and token/seed scripts"
```

- [ ] **Step 5: Commit the client transport swap**

```bash
git add src/api.ts src/api.test.ts src/supabaseSync.ts src/supabaseSync.test.ts \
  src/EntriesContext.tsx src/EntriesContext.test.tsx \
  src/components/SyncStatus.tsx src/components/SyncStatus.test.tsx \
  src/shared/category.ts package.json package-lock.json .env.example .gitignore
git commit -m "feat: swap entries transport to supabase-js with one-time localStorage migration"
```

- [ ] **Step 6: Commit docs and remaining files**

```bash
git add AGENTS.md docs/ 
git commit -m "docs: Supabase migration spec, staging TDD notes, mockups"
```

- [ ] **Step 7: Verify clean tree**

Run: `git status`
Expected: `nothing to commit, working tree clean` (untracked leftovers like `graphify-out/` are gitignored). Run `npm test` once more — PASS.

---

### Task 2: `dataTransfer` module — export payload + import parsing (TDD)

Pure logic for the JSON export/import format. No UI, no network — that comes in Tasks 3–4.

**Files:**
- Create: `src/dataTransfer.ts`
- Test: `src/dataTransfer.test.ts`
- Modify: `src/storage.ts` (add `savePokerSessions` bulk setter)

**Interfaces:**
- Consumes: `src/storage.ts` getters (`getCachedEntries(): Entry[]`, `getPokerSessions(): PokerSession[]`, `getBudgetConfig(): BudgetConfig`, `getCustomCategories(): CustomCategory[]`, `getCategoryOverrides(): CategoryOverrides`, `getCustomStakes(): string[]`), `THEME_STORAGE_KEY` from `src/theme/themeRegistry.ts` (value `'budget-tracker-theme-v2'`), types from `src/types.ts`.
- Produces (used by Tasks 3–4):

```ts
export interface ExportPayloadV1 {
  schemaVersion: 1
  exportedAt: string // ISO 8601
  entries: Entry[]
  pokerSessions: PokerSession[]
  settings: {
    budgetConfig?: BudgetConfig
    customCategories?: CustomCategory[]
    categoryOverrides?: CategoryOverrides
    customStakes?: string[]
    theme?: string
  }
}
export function buildExportPayload(): ExportPayloadV1
export function parseImportPayload(text: string): ExportPayloadV1 // throws Error with user-facing message
```
- Also produces in `src/storage.ts`: `export function savePokerSessions(sessions: PokerSession[]): void`

- [ ] **Step 1: Write failing tests for `buildExportPayload`**

Create `src/dataTransfer.test.ts`. Note `src/test-setup.ts` already configures jsdom + localStorage for Vitest (same as `storage.test.ts` relies on):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { buildExportPayload, parseImportPayload } from './dataTransfer'
import type { Entry, PokerSession } from './types'

const entry: Entry = {
  id: 'e1', amount: 12.5, category: 'lunch', note: 'kopi', date: '2026-07-01',
  source: 'manual', dedupeKey: 'manual|2026-07-01|12.5|kopi|e1',
}
const poker: PokerSession = {
  id: 'p1', date: '2026-07-02', startTime: '20:00', endTime: '23:00',
  stakes: '0.1/0.2', buyIn: 20, result: 'win', amount: 35,
}

beforeEach(() => localStorage.clear())

describe('buildExportPayload', () => {
  it('captures entries, poker sessions and all settings keys', () => {
    localStorage.setItem('budget_entries', JSON.stringify([entry]))
    localStorage.setItem('poker_sessions', JSON.stringify([poker]))
    localStorage.setItem('budget_config', JSON.stringify({ monthlyIncome: 1500, lunch: 264, transport: 50, savings: 400, investments: 250, others: 236, buffer: 236 }))
    localStorage.setItem('budget_custom_categories', JSON.stringify([{ id: 'cat_x_1', label: 'X', budget: null, icon: 'Coffee' }]))
    localStorage.setItem('budget_category_overrides', JSON.stringify({ lunch: { label: 'Food' } }))
    localStorage.setItem('poker_custom_stakes', JSON.stringify(['0.5/1']))
    localStorage.setItem('budget-tracker-theme-v2', 'copper-current')

    const payload = buildExportPayload()

    expect(payload.schemaVersion).toBe(1)
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(payload.entries).toEqual([entry])
    expect(payload.pokerSessions).toEqual([poker])
    expect(payload.settings.budgetConfig?.monthlyIncome).toBe(1500)
    expect(payload.settings.customCategories).toHaveLength(1)
    expect(payload.settings.categoryOverrides).toEqual({ lunch: { label: 'Food' } })
    expect(payload.settings.customStakes).toEqual(['0.5/1'])
    expect(payload.settings.theme).toBe('copper-current')
  })

  it('exports empty arrays and omits absent settings on a fresh browser', () => {
    const payload = buildExportPayload()
    expect(payload.entries).toEqual([])
    expect(payload.pokerSessions).toEqual([])
    expect(payload.settings.theme).toBeUndefined()
  })
})

describe('parseImportPayload', () => {
  it('round-trips a built payload', () => {
    localStorage.setItem('budget_entries', JSON.stringify([entry]))
    const parsed = parseImportPayload(JSON.stringify(buildExportPayload()))
    expect(parsed.entries).toEqual([entry])
  })

  it('rejects non-JSON text', () => {
    expect(() => parseImportPayload('not json')).toThrow(/valid JSON/i)
  })

  it('rejects unknown schema versions', () => {
    expect(() => parseImportPayload(JSON.stringify({ schemaVersion: 2, entries: [], pokerSessions: [], settings: {} })))
      .toThrow(/version/i)
  })

  it('rejects entries with missing or malformed fields', () => {
    const bad = { schemaVersion: 1, exportedAt: 'x', entries: [{ id: '', amount: 'NaN', date: '01/07/2026' }], pokerSessions: [], settings: {} }
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrow(/entr/i)
  })

  it('rejects poker sessions with invalid result values', () => {
    const bad = { schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [{ ...poker, result: 'push' }], settings: {} }
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrow(/poker/i)
  })

  it('tolerates a missing settings object', () => {
    const minimal = { schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [] }
    const parsed = parseImportPayload(JSON.stringify(minimal))
    expect(parsed.settings).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dataTransfer.test.ts`
Expected: FAIL — `Cannot find module './dataTransfer'` (or equivalent).

- [ ] **Step 3: Implement `src/dataTransfer.ts` (build + parse only; `applyImport` arrives in Task 3)**

```ts
// src/dataTransfer.ts
// JSON export/import for moving a user's origin-locked data (localStorage) to a new
// origin. Export copies; import upserts idempotently — nothing is ever cleared (C2).
import type { BudgetConfig, CategoryOverrides, CustomCategory, Entry, PokerSession } from './types'
import {
  getBudgetConfig,
  getCachedEntries,
  getCategoryOverrides,
  getCustomCategories,
  getCustomStakes,
  getPokerSessions,
} from './storage'
import { THEME_STORAGE_KEY } from './theme/themeRegistry'

export interface ExportPayloadV1 {
  schemaVersion: 1
  exportedAt: string
  entries: Entry[]
  pokerSessions: PokerSession[]
  settings: {
    budgetConfig?: BudgetConfig
    customCategories?: CustomCategory[]
    categoryOverrides?: CategoryOverrides
    customStakes?: string[]
    theme?: string
  }
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export function buildExportPayload(): ExportPayloadV1 {
  const theme = localStorage.getItem(THEME_STORAGE_KEY) ?? undefined
  const customCategories = getCustomCategories()
  const customStakes = getCustomStakes()
  const categoryOverrides = getCategoryOverrides()
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    entries: getCachedEntries(),
    pokerSessions: getPokerSessions(),
    settings: {
      // budget_config falls back to defaults when unset; only export it when the user saved one
      budgetConfig: readJson<BudgetConfig>('budget_config') ? getBudgetConfig() : undefined,
      customCategories: customCategories.length > 0 ? customCategories : undefined,
      categoryOverrides: Object.keys(categoryOverrides).length > 0 ? categoryOverrides : undefined,
      customStakes: customStakes.length > 0 ? customStakes : undefined,
      theme,
    },
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(raw: unknown, index: number): Entry {
  if (!isRecord(raw)) throw new Error(`Entry ${index + 1} is not an object.`)
  const { id, amount, category, note, date } = raw
  if (typeof id !== 'string' || id.length === 0) throw new Error(`Entry ${index + 1} is missing an id.`)
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error(`Entry ${index + 1} has an invalid amount.`)
  if (typeof date !== 'string' || !DATE_RE.test(date)) throw new Error(`Entry ${index + 1} has an invalid date (expected YYYY-MM-DD).`)
  if (category !== null && category !== undefined && typeof category !== 'string') throw new Error(`Entry ${index + 1} has an invalid category.`)
  const entry: Entry = {
    id,
    amount,
    category: typeof category === 'string' ? category : null,
    note: typeof note === 'string' ? note : '',
    date,
  }
  if (typeof raw.source === 'string') entry.source = raw.source as Entry['source']
  if (typeof raw.merchant === 'string') entry.merchant = raw.merchant
  if (typeof raw.occurredAt === 'string') entry.occurredAt = raw.occurredAt
  if (typeof raw.currency === 'string') entry.currency = raw.currency
  if (typeof raw.importKey === 'string') entry.importKey = raw.importKey
  if (typeof raw.dedupeKey === 'string') entry.dedupeKey = raw.dedupeKey
  return entry
}

function parsePokerSession(raw: unknown, index: number): PokerSession {
  if (!isRecord(raw)) throw new Error(`Poker session ${index + 1} is not an object.`)
  const { id, date, startTime, endTime, stakes, buyIn, result, amount } = raw
  if (typeof id !== 'string' || id.length === 0) throw new Error(`Poker session ${index + 1} is missing an id.`)
  if (typeof date !== 'string' || !DATE_RE.test(date)) throw new Error(`Poker session ${index + 1} has an invalid date.`)
  if (typeof startTime !== 'string' || typeof endTime !== 'string' || typeof stakes !== 'string')
    throw new Error(`Poker session ${index + 1} has invalid time or stakes fields.`)
  if (typeof buyIn !== 'number' || !Number.isFinite(buyIn) || typeof amount !== 'number' || !Number.isFinite(amount))
    throw new Error(`Poker session ${index + 1} has invalid amounts.`)
  if (result !== 'win' && result !== 'loss') throw new Error(`Poker session ${index + 1} has an invalid result.`)
  return { id, date, startTime, endTime, stakes, buyIn, result, amount }
}

export function parseImportPayload(text: string): ExportPayloadV1 {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This is not a valid JSON export file.')
  }
  if (!isRecord(raw)) throw new Error('This is not a valid JSON export file.')
  if (raw.schemaVersion !== 1) throw new Error('Unsupported export version — expected version 1.')
  if (!Array.isArray(raw.entries)) throw new Error('The export has no entries list.')
  if (!Array.isArray(raw.pokerSessions)) throw new Error('The export has no poker sessions list.')
  const settings = isRecord(raw.settings) ? raw.settings : {}
  return {
    schemaVersion: 1,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    entries: raw.entries.map(parseEntry),
    pokerSessions: raw.pokerSessions.map(parsePokerSession),
    settings: {
      budgetConfig: isRecord(settings.budgetConfig) ? (settings.budgetConfig as unknown as BudgetConfig) : undefined,
      customCategories: Array.isArray(settings.customCategories) ? (settings.customCategories as CustomCategory[]) : undefined,
      categoryOverrides: isRecord(settings.categoryOverrides) ? (settings.categoryOverrides as CategoryOverrides) : undefined,
      customStakes: Array.isArray(settings.customStakes) ? (settings.customStakes as string[]).filter(s => typeof s === 'string') : undefined,
      theme: typeof settings.theme === 'string' ? settings.theme : undefined,
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/dataTransfer.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Add `savePokerSessions` to `src/storage.ts` (failing test first)**

Append to `src/storage.test.ts`:

```ts
describe('savePokerSessions', () => {
  it('replaces the stored poker session list', () => {
    const a: PokerSession = { id: 'p1', date: '2026-07-01', startTime: '20:00', endTime: '21:00', stakes: '0.1/0.2', buyIn: 20, result: 'win', amount: 5 }
    const b: PokerSession = { ...a, id: 'p2' }
    savePokerSessions([a, b])
    expect(getPokerSessions()).toEqual([a, b])
  })
})
```

(Import `savePokerSessions`, `getPokerSessions` and the `PokerSession` type at the top of the test file if not present.) Run `npx vitest run src/storage.test.ts` — expect FAIL (not exported).

Then add to `src/storage.ts` next to `savePokerSession`:

```ts
export function savePokerSessions(sessions: PokerSession[]): void {
  localStorage.setItem(POKER_SESSIONS_KEY, JSON.stringify(sessions))
}
```

Run `npx vitest run src/storage.test.ts` — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add src/dataTransfer.ts src/dataTransfer.test.ts src/storage.ts src/storage.test.ts
git commit -m "feat: JSON export payload builder and import parser for origin transfer"
```

---

### Task 3: `applyImport` — push imported data to Supabase and merge caches (TDD)

**Files:**
- Modify: `src/dataTransfer.ts` (add `applyImport`)
- Test: `src/dataTransfer.test.ts` (add suite)

**Interfaces:**
- Consumes: `bulkUpsertEntries(entries: Entry[]): Promise<void>` and `bulkUpsertPokerSessions(sessions: PokerSession[]): Promise<void>` from `src/api.ts` (both batch 500, `onConflict: 'id', ignoreDuplicates: true`, and compute `dedupe_key` when absent via `entryToRow`); storage setters `setCachedEntries`, `savePokerSessions`, `saveBudgetConfig`, `saveCustomCategories`, `saveCategoryOverrides`, `saveCustomStakes`.
- Produces (used by Task 4):

```ts
export interface ImportResult { newEntries: number; newPokerSessions: number }
export async function applyImport(payload: ExportPayloadV1): Promise<ImportResult>
```

Behavior contract: settings restored first (only keys present in the payload) and only when the corresponding local key is absent (fill-only-if-empty, owner decision 2026-07-12); then server upserts (throws on network/auth failure — caller shows the error, nothing is lost, retry-safe); then local caches merged by id (existing local entries win; imported ones are appended). Never removes anything local.

- [ ] **Step 1: Write failing tests**

Add to `src/dataTransfer.test.ts`. Mock the api module the same way `supabaseSync.test.ts` mocks it (`vi.mock('./api', …)`):

```ts
import { applyImport } from './dataTransfer'
import * as api from './api'

vi.mock('./api', () => ({
  bulkUpsertEntries: vi.fn().mockResolvedValue(undefined),
  bulkUpsertPokerSessions: vi.fn().mockResolvedValue(undefined),
}))

function payloadWith(overrides: Partial<ExportPayloadV1>): ExportPayloadV1 {
  return { schemaVersion: 1, exportedAt: '2026-07-12T00:00:00Z', entries: [], pokerSessions: [], settings: {}, ...overrides }
}

describe('applyImport', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('upserts entries and poker sessions to the server', async () => {
    await applyImport(payloadWith({ entries: [entry], pokerSessions: [poker] }))
    expect(api.bulkUpsertEntries).toHaveBeenCalledWith([entry])
    expect(api.bulkUpsertPokerSessions).toHaveBeenCalledWith([poker])
  })

  it('merges into local caches without removing existing local data', async () => {
    const local: Entry = { ...entry, id: 'local1', note: 'existing' }
    localStorage.setItem('budget_entries', JSON.stringify([local]))
    const result = await applyImport(payloadWith({ entries: [entry] }))
    const cached = JSON.parse(localStorage.getItem('budget_entries')!) as Entry[]
    expect(cached.map(e => e.id).sort()).toEqual(['e1', 'local1'])
    expect(result.newEntries).toBe(1)
  })

  it('keeps the local copy when ids collide and counts it as not new', async () => {
    localStorage.setItem('budget_entries', JSON.stringify([{ ...entry, note: 'local wins' }]))
    const result = await applyImport(payloadWith({ entries: [entry] }))
    const cached = JSON.parse(localStorage.getItem('budget_entries')!) as Entry[]
    expect(cached).toHaveLength(1)
    expect(cached[0].note).toBe('local wins')
    expect(result.newEntries).toBe(0)
  })

  it('restores only the settings present in the payload', async () => {
    localStorage.setItem('poker_custom_stakes', JSON.stringify(['9/9']))
    await applyImport(payloadWith({ settings: { theme: 'copper-current' } }))
    expect(localStorage.getItem('budget-tracker-theme-v2')).toBe('copper-current')
    expect(JSON.parse(localStorage.getItem('poker_custom_stakes')!)).toEqual(['9/9']) // untouched
  })

  it('does not touch local caches when the server upsert fails', async () => {
    vi.mocked(api.bulkUpsertEntries).mockRejectedValueOnce(new Error('offline'))
    await expect(applyImport(payloadWith({ entries: [entry] }))).rejects.toThrow('offline')
    expect(localStorage.getItem('budget_entries')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/dataTransfer.test.ts`
Expected: FAIL — `applyImport` not exported.

- [ ] **Step 3: Implement `applyImport` in `src/dataTransfer.ts`**

Add imports at the top:

```ts
import { bulkUpsertEntries, bulkUpsertPokerSessions } from './api'
import {
  saveBudgetConfig,
  saveCategoryOverrides,
  saveCustomCategories,
  saveCustomStakes,
  savePokerSessions,
  setCachedEntries,
} from './storage'
```

(Merge these into the existing `./storage` import.) Then:

```ts
export interface ImportResult {
  newEntries: number
  newPokerSessions: number
}

export async function applyImport(payload: ExportPayloadV1): Promise<ImportResult> {
  const { settings } = payload
  if (settings.budgetConfig) saveBudgetConfig(settings.budgetConfig)
  if (settings.customCategories) saveCustomCategories(settings.customCategories)
  if (settings.categoryOverrides) saveCategoryOverrides(settings.categoryOverrides)
  if (settings.customStakes) saveCustomStakes(settings.customStakes)
  if (settings.theme) localStorage.setItem(THEME_STORAGE_KEY, settings.theme)

  // Server first: if this throws (offline/auth), local caches are untouched and a retry is safe.
  if (payload.entries.length > 0) await bulkUpsertEntries(payload.entries)
  if (payload.pokerSessions.length > 0) await bulkUpsertPokerSessions(payload.pokerSessions)

  const cachedEntries = getCachedEntries()
  const knownEntryIds = new Set(cachedEntries.map(e => e.id))
  const newEntries = payload.entries.filter(e => !knownEntryIds.has(e.id))
  if (newEntries.length > 0) setCachedEntries([...cachedEntries, ...newEntries])

  const cachedSessions = getPokerSessions()
  const knownSessionIds = new Set(cachedSessions.map(s => s.id))
  const newSessions = payload.pokerSessions.filter(s => !knownSessionIds.has(s.id))
  if (newSessions.length > 0) savePokerSessions([...cachedSessions, ...newSessions])

  return { newEntries: newEntries.length, newPokerSessions: newSessions.length }
}
```

Note the settings-before-server order differs from the test `does not touch local caches when the server upsert fails` only for *settings* — settings are deliberately restored even if the upsert later fails (they're local-only and harmless to re-apply). The test asserts entry caches specifically.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/dataTransfer.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` — expect PASS.

```bash
git add src/dataTransfer.ts src/dataTransfer.test.ts
git commit -m "feat: applyImport pushes imported data to Supabase and merges local caches"
```

---

### Task 4: Settings UI — Export JSON / Import JSON (file or pasted text)

Wire the feature into the existing **Data** section of Settings, following the CSV export/import pattern already there. Paste-import matters because on the old origin users export via a bookmarklet that copies JSON to the clipboard (no file involved on iPhone).

**Files:**
- Modify: `src/screens/Settings.tsx` (Data section, ~line 716; handlers near `handleExport` ~line 258)
- Test: `src/screens/Settings.test.tsx`

**Interfaces:**
- Consumes: `buildExportPayload`, `parseImportPayload`, `applyImport`, `ImportResult` from `../dataTransfer`; `refresh` from `useEntries()` (already destructured in the component — check the existing `const { entries, addEntry, removeEntry, refresh } = useEntries()` line and add `refresh` if absent).
- Produces: UI only — no new exports.

- [ ] **Step 1: Write failing tests**

Add to `src/screens/Settings.test.tsx`, following the file's existing render helpers and the `importCsv` pattern (~line 112). Mock `../dataTransfer`:

```tsx
import * as dataTransfer from '../dataTransfer'

vi.mock('../dataTransfer', async importOriginal => {
  const actual = await importOriginal<typeof import('../dataTransfer')>()
  return { ...actual, applyImport: vi.fn().mockResolvedValue({ newEntries: 2, newPokerSessions: 1 }) }
})

describe('JSON backup', () => {
  it('downloads a JSON export when Export JSON is pressed', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:x')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const { getByRole } = renderSettings() // use this file's existing render helper name
    fireEvent.click(getByRole('button', { name: /export json/i }))
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toContain('application/json')
    vi.unstubAllGlobals()
  })

  it('imports pasted JSON and reports the result', async () => {
    const { getByRole, findByText } = renderSettings()
    fireEvent.click(getByRole('button', { name: /paste import/i }))
    const box = getByRole('textbox', { name: /pasted export/i })
    fireEvent.change(box, { target: { value: JSON.stringify({ schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [], settings: {} }) } })
    fireEvent.click(getByRole('button', { name: /^import$/i }))
    expect(await findByText(/imported 2 entries and 1 poker session/i)).toBeInTheDocument()
    expect(dataTransfer.applyImport).toHaveBeenCalledOnce()
  })

  it('shows the validation error for malformed pasted JSON', async () => {
    const { getByRole, findByText } = renderSettings()
    fireEvent.click(getByRole('button', { name: /paste import/i }))
    fireEvent.change(getByRole('textbox', { name: /pasted export/i }), { target: { value: 'nope' } })
    fireEvent.click(getByRole('button', { name: /^import$/i }))
    expect(await findByText(/not a valid JSON export/i)).toBeInTheDocument()
  })
})
```

Adapt the render call and imports to the helpers this test file already uses (read the top of the file first). Run: `npx vitest run src/screens/Settings.test.tsx` — expect FAIL (buttons don't exist).

- [ ] **Step 2: Implement the handlers in `Settings.tsx`**

State (next to the CSV import state):

```tsx
const [showPasteImport, setShowPasteImport] = useState(false)
const [pasteText, setPasteText] = useState('')
const [jsonBusy, setJsonBusy] = useState(false)
```

Handlers (next to `handleExport`):

```tsx
function handleExportJson() {
  const payload = buildExportPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `budget-export-${payload.exportedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

async function importJsonText(text: string) {
  setJsonBusy(true)
  try {
    const result = await applyImport(parseImportPayload(text))
    await refresh()
    setImportError(false)
    setImportMessage(
      `Imported ${result.newEntries} entr${result.newEntries === 1 ? 'y' : 'ies'} and ` +
      `${result.newPokerSessions} poker session${result.newPokerSessions === 1 ? '' : 's'}.`,
    )
    setShowPasteImport(false)
    setPasteText('')
  } catch (error) {
    setImportError(true)
    setImportMessage(error instanceof Error ? error.message : 'Could not import this data.')
  } finally {
    setJsonBusy(false)
  }
}

async function handleImportJsonFile(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0]
  event.currentTarget.value = ''
  if (!file) return
  await importJsonText(await file.text())
}
```

Reuse the existing `importError`/`importMessage` state so messages render where CSV messages already do.

- [ ] **Step 3: Add the UI to the Data section**

In the Data section (after the CSV buttons, before the danger zone), following the section's existing button markup/classes exactly:

```tsx
<button type="button" className="settings-action" onClick={handleExportJson}>
  <Download size={16} aria-hidden /> Export JSON (full backup)
</button>
<button type="button" className="settings-action" onClick={() => jsonFileInputRef.current?.click()}>
  <Upload size={16} aria-hidden /> Import JSON file
</button>
<input
  ref={jsonFileInputRef}
  type="file"
  accept=".json,application/json"
  onChange={handleImportJsonFile}
  hidden
/>
<button type="button" className="settings-action" onClick={() => setShowPasteImport(v => !v)}>
  <Upload size={16} aria-hidden /> Paste import
</button>
{showPasteImport && (
  <div className="settings-row">
    <label className="settings-label" htmlFor="paste-import-box">Pasted export</label>
    <textarea
      id="paste-import-box"
      className="settings-input"
      rows={4}
      value={pasteText}
      onChange={event => setPasteText(event.target.value)}
    />
    <button type="button" className="settings-action" disabled={jsonBusy || pasteText.trim() === ''} onClick={() => void importJsonText(pasteText)}>
      Import
    </button>
  </div>
)}
```

Match the *actual* class names and button structure used by the existing CSV export/import controls in this section (read them first; the snippet above is the shape, the file is the style authority). Add `const jsonFileInputRef = useRef<HTMLInputElement>(null)` beside existing refs, and imports from `../dataTransfer`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/screens/Settings.test.tsx`
Expected: PASS (new and pre-existing tests).

- [ ] **Step 5: Full gate + commit**

Run: `npm test` and `npm run lint` — expect PASS/clean.

```bash
git add src/screens/Settings.tsx src/screens/Settings.test.tsx
git commit -m "feat: JSON export/import in Settings for cross-origin data transfer"
```

---

### Task 5: `vercel.json` + docs (headers port, AGENTS.md, spec addendum)

**Files:**
- Create: `vercel.json` (repo root)
- Modify: `AGENTS.md` (Commands + Planned direction sections)
- Modify: `docs/superpowers/specs/2026-07-12-vercel-prod-cutover-design.md` (export-path addendum)

**Interfaces:**
- Consumes: header values from `netlify.toml` (authoritative source — copy verbatim).
- Produces: `vercel.json` used by Task 8's deploy.

- [ ] **Step 1: Create `vercel.json`**

Port every header from `netlify.toml` exactly (CSP string verbatim — it already allows `https://*.supabase.co` and `wss://*.supabase.co`):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    },
    { "source": "/", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/registerSW.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }
  ]
}
```

No `functions`, no `rewrites` (the app has no client-side URL routing; screens are component state).

- [ ] **Step 2: Verify the build works and the JSON parses**

Run: `npm run build` — expect `tsc -b && vite build` success producing `dist/`.
Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"` — expect `ok`.

- [ ] **Step 3: Update `AGENTS.md`**

In the **Commands** section, replace the `npx netlify dev` line's role as "full stack" with a note that the backend is now Supabase, and add the Vercel deploy command. Concretely: add after the `npm run preview` line:

```
npx vercel --prod  # deploy to Vercel (production). Never deploy to Netlify — no deploys remain.
```

And in **Planned direction**, append one sentence: hosting moved to Vercel per `docs/superpowers/specs/2026-07-12-vercel-prod-cutover-design.md`; the Netlify site is a frozen fallback, never redeployed.

- [ ] **Step 4: Spec addendum for the deploy-free export path**

In `docs/superpowers/specs/2026-07-12-vercel-prod-cutover-design.md`, in the "Cutover runbook" section, replace the phrase describing users exporting "on the old URL" with: the old origin never gets the export button (no Netlify deploys remain), so users run a **bookmarklet** on the old URL that copies their localStorage as an ExportPayloadV1 JSON string to the clipboard, then use **Paste import** on the new app. The bookmarklet source lives in the implementation plan (Task 9).

- [ ] **Step 5: Commit**

```bash
git add vercel.json AGENTS.md docs/superpowers/specs/2026-07-12-vercel-prod-cutover-design.md
git commit -m "feat: vercel.json static-host config; docs for Vercel-only deploys"
```

---

### Task 6: Full gate and merge to `main`

**Files:** none created — git only.

- [ ] **Step 1: Full verification gate**

```bash
npm test && npm run lint && npm run build
```
Expected: tests PASS, lint clean, build succeeds. Fix anything red before proceeding (dispatch build-error-resolver if the build fails).

- [ ] **Step 2: Merge**

```bash
git checkout main
git pull origin main
git merge improvement/production-readiness
```
Expected: merge succeeds (likely fast-forward). If conflicts appear, STOP and report — do not force anything.

- [ ] **Step 3: Verify main and push**

```bash
npm test
git push origin main
```
Expected: tests PASS on main; push succeeds to `NathanaelNgYY/expense`.

---

### Task 7: Prod Supabase setup (orchestrator + user — interactive)

Run from `budget-tracker/`. Needs Supabase auth: if `npx supabase projects list` fails with a login error, have the user run `! npx supabase login` (opens browser).

- [ ] **Step 1: Link to the prod project**

```bash
npx supabase link --project-ref igsjhpfymspbyzqzpzme
```
(It may prompt for the database password — user provides it.)

- [ ] **Step 2: Apply schema migrations**

```bash
npx supabase db push
```
Expected: applies `20260711120000_personal_entries.sql` and `20260711130000_text_entry_ids.sql`. Verify with `npx supabase migration list` — both show as applied remotely.

- [ ] **Step 3: Enable anonymous sign-ins (user, dashboard)**

User opens https://supabase.com/dashboard/project/igsjhpfymspbyzqzpzme/auth/providers → Auth settings → enable **Allow anonymous sign-ins** → Save. (Without this, the app's `ensureSession()` fails and the app runs cache-only.)

- [ ] **Step 4: Deploy the ingest Edge Function**

```bash
npx supabase functions deploy ingest --no-verify-jwt
```
Expected: deployed to `https://igsjhpfymspbyzqzpzme.supabase.co/functions/v1/ingest`. `--no-verify-jwt` is required — the function does its own bearer-token auth against `ingest_tokens`.

- [ ] **Step 5: Smoke-test the function's auth rejection**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://igsjhpfymspbyzqzpzme.supabase.co/functions/v1/ingest -H "Authorization: Bearer wrong" -H "Content-Type: application/json" -d '{"sourceKind":"apple_pay"}'
```
Expected: `401`. (Token seeding happens in Task 9 after the owner's prod user exists.)

---

### Task 8: Vercel project + production deploy (orchestrator + user — interactive)

- [ ] **Step 1: Login and link**

If `npx vercel whoami` errors, user runs `! npx vercel login`. Then from `budget-tracker/`:

```bash
npx vercel link
```
Answers: set up new project, name `budget-tracker`, no framework overrides (Vercel auto-detects Vite: build `npm run build`, output `dist`). This writes `.vercel/` — add `.vercel/` to `.gitignore` and commit that one-liner.

- [ ] **Step 2: Set production env vars**

Get the prod anon key: `npx supabase projects api-keys --project-ref igsjhpfymspbyzqzpzme` (or dashboard → Settings → API). Then:

```bash
npx vercel env add VITE_SUPABASE_URL production        # value: https://igsjhpfymspbyzqzpzme.supabase.co
npx vercel env add VITE_SUPABASE_ANON_KEY production   # value: the anon key
npx vercel env add VITE_EXPECTED_SUPABASE_PROJECT_REF production  # value: igsjhpfymspbyzqzpzme
```

- [ ] **Step 3: Deploy to production**

```bash
npx vercel --prod
```
Expected: build succeeds; note the production URL (e.g. `https://budget-tracker-<hash>.vercel.app` / assigned alias).

- [ ] **Step 4: Verify the deployment**

- `curl -sI https://<prod-url>/ | grep -i content-security-policy` → CSP header present.
- Open the URL in a browser: app loads, Settings shows **Export JSON / Import JSON / Paste import**, and (after a moment) sync status is healthy — meaning anonymous sign-in against prod worked. Check the Supabase dashboard → Authentication → Users: one new anonymous user.
- Confirm the production URL is publicly reachable in an incognito window (no Vercel SSO/protection screen). If a protection screen appears: Vercel dashboard → project → Settings → Deployment Protection → disable for production.

---

### Task 9: Cutover runbook (owner-driven; orchestrator assists)

- [ ] **Step 1: Back up the owner's Netlify Blobs data (no deploy involved)**

```bash
curl -s https://creative-alfajores-ae54bd.netlify.app/api/entries -H "Authorization: Bearer <owner API token>" -o "$HOME/budget-blobs-backup-2026-07-12.json"
```
Saved OUTSIDE the repo. Verify it parses and note the entry count:
`node -e "const d=require(process.env.HOME+'/budget-blobs-backup-2026-07-12.json'); console.log(Array.isArray(d)?d.length:Object.keys(d))"`

- [ ] **Step 2: Owner exports on the old origin (iPhone)**

On the iPhone, in Safari (not the PWA icon) open `https://creative-alfajores-ae54bd.netlify.app`. Add a bookmark, then edit its URL to the bookmarklet below; tapping it while on the page copies the export JSON to the clipboard:

```
javascript:(()=>{const g=k=>{try{return JSON.parse(localStorage.getItem(k))??undefined}catch{return undefined}};const p={schemaVersion:1,exportedAt:new Date().toISOString(),entries:g('budget_entries')||[],pokerSessions:g('poker_sessions')||[],settings:{budgetConfig:g('budget_config'),customCategories:g('budget_custom_categories'),categoryOverrides:g('budget_category_overrides'),customStakes:g('poker_custom_stakes'),theme:localStorage.getItem('budget-tracker-theme-v2')||undefined}};const t=JSON.stringify(p);navigator.clipboard.writeText(t).then(()=>alert('Copied '+p.entries.length+' entries + '+p.pokerSessions.length+' poker sessions'),()=>prompt('Copy this manually:',t))})();
```

IMPORTANT (iOS): the PWA and Safari may have **separate localStorage**. If the app was used from the home-screen icon, the data lives in the PWA's storage — the bookmarklet must run there instead. In that case use the in-PWA fallback: since iOS home-screen PWAs can't run bookmarklets, on the OLD app go to Settings → Export CSV if present, or (most reliable) open the old URL in Safari and check the entry count the bookmarklet reports — if it says 0 entries, the data is in the PWA container and the owner should instead use the old app's existing CSV export from inside the PWA (entries only; poker/settings for the owner also exist in the Blobs backup from Step 1). Report what happened either way.

- [ ] **Step 3: Owner imports on the new origin**

Open the Vercel URL in Safari → Settings → **Paste import** → paste → Import. Verify the reported counts and that Dashboard/History show the data. Then verify against the Step 1 backup count. Add the new app to the home screen; confirm the PWA icon opens with data (same origin, shared via the import having synced to Supabase — if the home-screen container starts empty, the app pulls from Supabase on first load because the anonymous session… is per-container. If the PWA container shows NO data: run Paste import once more inside the installed PWA — it is idempotent).

- [ ] **Step 4: Seed the owner's ingest token and re-point Shortcuts**

Find the owner's prod user id: Supabase dashboard → Authentication → Users (the newest anonymous user, created by Step 3's import inside the container the owner will actually use — the installed PWA's). Then:

```powershell
$env:SUPABASE_URL = "https://igsjhpfymspbyzqzpzme.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key from dashboard>"
node scripts/mint-ingest-token.mjs <owner-user-id> ios-shortcuts
```
The script prints a NEW bearer token once. Owner edits BOTH iOS Shortcuts (Apple Pay + DBS email): URL → `https://igsjhpfymspbyzqzpzme.supabase.co/functions/v1/ingest`, Authorization header → `Bearer <new token>` (keep the `Bearer ` prefix). Fire a test through each Shortcut; expect `{"status":"saved"}` then `{"status":"duplicate"}` on repeat, and the entry appears in the app.

CAUTION: if the owner ends up with TWO anonymous users (Safari + PWA containers both imported), the token must map to the user id of the container the owner keeps using (the installed PWA). Verify by checking which user's `entries` row count grows after the test ingest.

- [ ] **Step 5: The two other users migrate**

Send each user: the new URL + the bookmarklet + instructions (same as Steps 2–3: old URL in Safari → bookmarklet → new URL → Settings → Paste import → add to home screen). Same PWA-container caveat applies. Verify with each user that their entry counts look right, and in the Supabase dashboard that `entries` now shows rows under 3 distinct `user_id`s (`select user_id, count(*) from entries group by user_id`).

- [ ] **Step 6: Delete the staging Supabase project (destructive — confirm with user first)**

Only after Steps 1–5 are all verified. User confirms, then: Supabase dashboard → project `rjwzzsocxykbfellsihr` → Settings → General → Delete project. (Dashboard deletion is safer than CLI here; it forces the type-the-name confirmation.)

- [ ] **Step 7: Update memory/docs**

Update the project memory (`supabase-migration-status.md`, `budget-tracker-prod-url.md`) with: new Vercel prod URL, prod Supabase live, staging deleted, Netlify frozen (no deploys remain), new ingest token location (Shortcuts only). Fold the "hosting moved to Vercel" design intent into the Obsidian vault component note for the Serverless Backend / deployment.
