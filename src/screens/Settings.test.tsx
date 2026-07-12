import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Settings from './Settings'
import { EntriesProvider } from '../EntriesContext'
import { ThemeProvider } from '../theme/ThemeContext'
import type { ActiveBudgetData, SharedBudget } from '../sharedBudgets/types'
import * as dataTransfer from '../dataTransfer'

const sharedCtx = vi.hoisted(() => ({
  value: {
    configured: true,
    authReady: true,
    session: { user: { id: 'u1' } },
    profile: { id: 'u1', displayName: 'Nat' },
    budgets: [] as SharedBudget[],
    active: null as ActiveBudgetData | null,
    error: null as string | null,
    refreshProfile: vi.fn(),
    createBudget: vi.fn(),
    joinBudget: vi.fn(),
    openBudget: vi.fn(),
    closeBudget: vi.fn(),
    addEntry: vi.fn(),
    editEntry: vi.fn(),
    removeEntry: vi.fn(),
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    removeCategory: vi.fn(),
    updateActiveBudget: vi.fn(),
    regenerateCode: vi.fn(),
    removeMember: vi.fn(),
    leaveActiveBudget: vi.fn(),
    deleteActiveBudget: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock('../sharedBudgets/SharedBudgetsContext', () => ({
  useSharedBudgets: () => sharedCtx.value,
}))

vi.mock('../dataTransfer', async importOriginal => {
  const actual = await importOriginal<typeof import('../dataTransfer')>()
  return { ...actual, applyImport: vi.fn().mockResolvedValue({ newEntries: 2, newPokerSessions: 1 }) }
})

function renderWithEntries(entries: unknown[] = []) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  // Default stub: returns the seeded entries for fetchEntries (GET /api/entries)
  // and echoes back a created entry for POST (createEntryApi)
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
      <ThemeProvider>
        <EntriesProvider>
          <Settings onBack={() => undefined} />
        </EntriesProvider>
      </ThemeProvider>,
    )
  })

  return { container, root }
}

function changeInput(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

  act(() => {
    valueSetter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

// The JSON import handler awaits the real EntriesContext refresh() (network + queue drain),
// which can take a few extra event-loop turns in tests depending on what earlier tests left
// running in the background. Poll with real macrotask boundaries instead of a single flush.
async function waitForText(container: HTMLElement, text: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!container.textContent?.includes(text)) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for text: ${text}`)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
  }
}

// The save control is now a sticky bar that only exists while the form is dirty, and it
// persists in place rather than navigating back.
function clickSave(container: HTMLElement): void {
  const button = [...container.querySelectorAll('button')].find(element =>
    element.textContent?.includes('Save changes'),
  )

  if (!button) throw new Error('Save changes button was not found — is the form dirty?')

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function clickButton(container: HTMLElement, predicate: (b: HTMLButtonElement) => boolean): void {
  const button = [...container.querySelectorAll('button')].find(predicate)
  if (!button) throw new Error('Button not found')
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function importCsv(container: HTMLElement, csv: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')

  if (!input) throw new Error('Import CSV input was not found')

  const file = new File([csv], 'budget-entries.csv', { type: 'text/csv' })

  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  })

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Settings monthly income', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.clearAllMocks()
    sharedCtx.value.budgets = []
    sharedCtx.value.active = null
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

  it('saves an edited monthly income', () => {
    const rendered = renderWithEntries()
    root = rendered.root

    const input = rendered.container.querySelector<HTMLInputElement>('#budget-monthly-income')
    expect(input).not.toBeNull()

    changeInput(input!, '1800')
    clickSave(rendered.container)

    expect(JSON.parse(localStorage.getItem('budget_config') ?? '{}')).toMatchObject({
      monthlyIncome: 1800,
    })
  })

  it('imports CSV entries, deduplicates, and reports the count', async () => {
    const existingEntry = {
      id: 'entry-1',
      amount: 3.5,
      category: 'transport',
      note: 'Train',
      date: '2026-05-10',
    }
    const rendered = renderWithEntries([existingEntry])
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Import CSV')

    await importCsv(
      rendered.container,
      [
        '"id","amount","category","note","date"',
        '"entry-1","3.5","transport","Train","2026-05-10"',
        '"entry-2","12.5","lunch","Chicken rice","2026-05-11"',
      ].join('\n'),
    )

    // The import deduplicates entry-1 (already exists) and adds entry-2.
    // Because onBack() is called after import, the settings screen navigates
    // away before showing a message. Verify that no error is displayed.
    // (The onBack prop is a no-op in this test so the screen stays mounted.)
    // The status message "Imported 1 entry." should be rendered.
    // Note: onBack is a no-op here so the component stays mounted long enough
    // to assert the message before unmount.
    expect(rendered.container).toHaveTextContent('Imported 1 entr')
  })
})

describe('Settings custom categories', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.clearAllMocks()
    sharedCtx.value.budgets = []
    sharedCtx.value.active = null
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

  function readCustom(): Array<{ label: string; budget: number | null }> {
    return JSON.parse(localStorage.getItem('budget_custom_categories') ?? '[]')
  }

  it('adds a custom category with a budget and persists on save', () => {
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.trim() === 'Add category')
    changeInput(container.querySelector<HTMLInputElement>('#new-cat-name')!, 'Groceries')
    changeInput(container.querySelector<HTMLInputElement>('#new-cat-budget')!, '120')
    clickButton(container, b => b.textContent?.trim() === 'Add')
    clickSave(container)

    const saved = readCustom()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ label: 'Groceries', budget: 120 })
  })

  it('allows an empty budget (null)', () => {
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.trim() === 'Add category')
    changeInput(container.querySelector<HTMLInputElement>('#new-cat-name')!, 'Gym')
    clickButton(container, b => b.textContent?.trim() === 'Add')
    clickSave(container)

    expect(readCustom()[0]).toMatchObject({ label: 'Gym', budget: null })
  })

  it('removes a category with no entries', () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]),
    )
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.getAttribute('aria-label') === 'Remove Gym')
    clickSave(container)

    expect(readCustom()).toEqual([])
  })

  it('blocks removal when entries use the category', () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]),
    )
    const rendered = renderWithEntries([
      { id: 'g1', amount: 10, category: 'cat_gym_1', note: '', date: '2026-05-04' },
    ])
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.getAttribute('aria-label') === 'Remove Gym')

    // Removal blocked: the category survives and an error is shown.
    expect(readCustom()).toHaveLength(1)
    expect(container).toHaveTextContent(/use "Gym"/)
    // Nothing changed, so there is nothing to save — the save bar must stay away.
    expect(container).not.toHaveTextContent('Save changes')
  })

  it('renames a basic category and persists the override on save', () => {
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.getAttribute('aria-label') === 'Edit Lunch')
    changeInput(container.querySelector<HTMLInputElement>('#edit-cat-name')!, 'Food')
    clickButton(container, b => b.textContent?.trim() === 'Done')
    clickSave(container)

    expect(JSON.parse(localStorage.getItem('budget_category_overrides') ?? '{}')).toEqual({
      lunch: { label: 'Food' },
    })
  })

  it('edits a custom category name and icon and persists on save', () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: 30, icon: 'Dumbbell' }]),
    )
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.getAttribute('aria-label') === 'Edit Gym')
    changeInput(container.querySelector<HTMLInputElement>('#edit-cat-name')!, 'Fitness')
    clickButton(container, b => b.getAttribute('aria-label') === 'Icon Heart')
    clickButton(container, b => b.textContent?.trim() === 'Done')
    clickSave(container)

    const saved = readCustom()
    expect(saved[0]).toMatchObject({ label: 'Fitness', icon: 'Heart', budget: 30 })
  })

  it('does not offer rename/delete for the Buffer basic category', () => {
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    const editButtons = [...container.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))
    expect(editButtons).toContain('Edit Lunch')
    expect(editButtons).not.toContain('Edit Buffer')
  })

  it('edits the selected shared budget limit and categories from Settings', async () => {
    const budget: SharedBudget = {
      id: 'b1',
      name: 'Family',
      monthlyLimit: 100,
      currency: 'SGD',
      inviteCode: 'ABC123',
      ownerId: 'u1',
      createdAt: '2026-07-01T00:00:00Z',
    }
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = {
      budget,
      categories: [{ id: 'c1', budgetId: 'b1', label: 'Groceries', budgetAmount: 40, icon: 'ShoppingBag' }],
      entries: [],
      members: [{ userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' }],
    }
    sharedCtx.value.updateActiveBudget.mockResolvedValue(undefined)
    sharedCtx.value.addCategory.mockResolvedValue(undefined)
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.trim() === 'Shared')
    changeInput(container.querySelector<HTMLInputElement>('#shared-monthly-limit')!, '250')
    clickButton(container, b => b.textContent?.trim() === 'Add category')
    changeInput(container.querySelector<HTMLInputElement>('#shared-new-cat-name')!, 'Snacks')
    changeInput(container.querySelector<HTMLInputElement>('#shared-new-cat-budget')!, '25')
    const addButton = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Add')
    if (!addButton) throw new Error('Add button was not found')
    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    clickButton(container, b => b.textContent?.includes('Save Shared Budget') ?? false)

    expect(sharedCtx.value.addCategory).toHaveBeenCalledWith({
      label: 'Snacks',
      budgetAmount: 25,
      icon: expect.any(String),
    })
    expect(sharedCtx.value.updateActiveBudget).toHaveBeenCalledWith({ monthlyLimit: 250 })
  })
})

describe('Settings JSON backup', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.clearAllMocks()
    sharedCtx.value.budgets = []
    sharedCtx.value.active = null
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

  it('downloads a JSON export when Export JSON is pressed', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:x')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const rendered = renderWithEntries()
    root = rendered.root

    clickButton(rendered.container, b => b.textContent?.toLowerCase().includes('export json') ?? false)

    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toContain('application/json')
  })

  it('imports pasted JSON and reports the result', async () => {
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.toLowerCase().includes('paste import') ?? false)
    const box = container.querySelector<HTMLTextAreaElement>('#paste-import-box')
    if (!box) throw new Error('Paste import textarea was not found')
    changeTextarea(
      box,
      JSON.stringify({ schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [], settings: {} }),
    )

    const importButton = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Import')
    if (!importButton) throw new Error('Import button was not found')
    await act(async () => {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitForText(container, 'Imported 2 entries and 1 poker session')

    expect(dataTransfer.applyImport).toHaveBeenCalledOnce()
  })

  it('shows the validation error for malformed pasted JSON', async () => {
    const rendered = renderWithEntries()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.toLowerCase().includes('paste import') ?? false)
    const box = container.querySelector<HTMLTextAreaElement>('#paste-import-box')
    if (!box) throw new Error('Paste import textarea was not found')
    changeTextarea(box, 'nope')

    const importButton = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Import')
    if (!importButton) throw new Error('Import button was not found')
    await act(async () => {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitForText(container, 'not a valid JSON export')
  })
})
