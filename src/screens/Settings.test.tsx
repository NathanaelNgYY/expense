import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Settings from './Settings'
import { EntriesProvider } from '../EntriesContext'
import { ThemeProvider } from '../theme/ThemeContext'
import type { ActiveBudgetData, SharedBudget } from '../sharedBudgets/types'

// Settings is now a navigation shell: it owns the hub, the subscreen switch and the month reset.
// Everything each subscreen does (budgets, categories, shared budgets, export/import, the theme
// picker) is covered by that subscreen's own suite — those behaviours are not re-tested here.
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

interface Seed {
  id: string
  amount: number
  category: string
  note: string
  date: string
  dedupeKey?: string
}

function renderSettings(entries: Seed[] = [], onBack: () => void = () => undefined) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(entries), { status: 200 }))),
  )
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <ThemeProvider>
        <EntriesProvider>
          <Settings onBack={onBack} />
        </EntriesProvider>
      </ThemeProvider>,
    )
  })

  return { container, root }
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(element =>
    element.textContent?.includes(text),
  )
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

function click(button: HTMLButtonElement): void {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function openSubscreen(container: HTMLElement, rowLabel: string): void {
  click(findButton(container, rowLabel))
}

function goBack(container: HTMLElement): void {
  const back = container.querySelector<HTMLButtonElement>('.back-btn')
  if (!back) throw new Error('Back button was not found')
  click(back)
}

function readCachedEntries(): Seed[] {
  return JSON.parse(localStorage.getItem('budget_entries') ?? '[]')
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
  }
}

describe('Settings hub', () => {
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

  it('shows four nav rows and the reset action, and no budget fields', () => {
    const rendered = renderSettings()
    root = rendered.root
    const { container } = rendered

    expect(container).toHaveTextContent('Budget & Categories')
    expect(container).toHaveTextContent('Appearance')
    expect(container).toHaveTextContent('Data & Backup')
    expect(container).toHaveTextContent('Automatic Tracking')
    expect(container).toHaveTextContent('Reset This Month')
    expect(container.querySelectorAll('.settings-nav-row')).toHaveLength(4)
    // The hub only navigates — the editable budget fields live one level down.
    expect(container.querySelector('#budget-monthly-income')).toBeNull()
  })

  it('shows the current theme name on the Appearance row', () => {
    const rendered = renderSettings()
    root = rendered.root

    const row = findButton(rendered.container, 'Appearance')
    expect(row.textContent).toContain('Original Dark')
  })

  it('navigates to Budget & Categories and back to the hub', () => {
    const rendered = renderSettings()
    root = rendered.root
    const { container } = rendered

    openSubscreen(container, 'Budget & Categories')
    expect(container.querySelector('#budget-monthly-income')).not.toBeNull()

    goBack(container)
    expect(container.querySelectorAll('.settings-nav-row')).toHaveLength(4)
    expect(container.querySelector('#budget-monthly-income')).toBeNull()
  })

  it('navigates to Appearance and shows the theme picker', () => {
    const rendered = renderSettings()
    root = rendered.root
    const { container } = rendered

    openSubscreen(container, 'Appearance')
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull()
    expect(container).toHaveTextContent('Applies immediately')

    goBack(container)
    expect(container.querySelectorAll('.settings-nav-row')).toHaveLength(4)
  })

  it('navigates to Data & Backup and back to the hub', () => {
    const rendered = renderSettings()
    root = rendered.root
    const { container } = rendered

    openSubscreen(container, 'Data & Backup')
    expect(container).toHaveTextContent('CSV — entries only')

    goBack(container)
    expect(container.querySelectorAll('.settings-nav-row')).toHaveLength(4)
  })

  it('navigates to Automatic Tracking and back to the hub', () => {
    const rendered = renderSettings()
    root = rendered.root
    const { container } = rendered

    openSubscreen(container, 'Automatic Tracking')
    expect(container).toHaveTextContent('PayNow has no native Shortcuts trigger')
    expect(container.querySelector('a[href="shortcuts://"]')).toHaveTextContent('Open Shortcuts')

    goBack(container)
    expect(container.querySelectorAll('.settings-nav-row')).toHaveLength(4)
  })

  it('exits Settings from the hub back button', () => {
    const onBack = vi.fn()
    const rendered = renderSettings([], onBack)
    root = rendered.root

    goBack(rendered.container)

    expect(onBack).toHaveBeenCalledOnce()
  })

  it('resets only the current month after confirming the number of affected entries', async () => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const thisMonth: Seed = { id: 'now-1', amount: 12, category: 'lunch', note: 'Rice', date: `${month}-05` }
    const alsoThisMonth: Seed = { id: 'now-2', amount: 8, category: 'transport', note: 'Bus', date: `${month}-06` }
    const lastYear: Seed = { id: 'old-1', amount: 8, category: 'lunch', note: 'Noodles', date: '2020-01-05' }
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))

    const rendered = renderSettings([thisMonth, alsoThisMonth, lastYear])
    root = rendered.root

    await act(async () => {
      findButton(rendered.container, 'Reset This Month').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    await waitFor(() => readCachedEntries().every(entry => !entry.id.startsWith('now-')))

    expect(confirm).toHaveBeenCalledWith(
      'Delete 2 entries from this month? You can undo this while Settings remains open.',
    )
    expect(readCachedEntries().map(entry => entry.id)).toEqual(['old-1'])
    expect(rendered.container).toHaveTextContent('Deleted 2 entries')
    expect(findButton(rendered.container, 'Undo')).toBeEnabled()
  })

  it('undoes a month reset with every original id and dedupe key intact', async () => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const first: Seed = {
      id: 'wallet-1',
      amount: 12,
      category: 'lunch',
      note: 'Rice',
      date: `${month}-05`,
      dedupeKey: 'apple-pay:transaction-1',
    }
    const second: Seed = {
      id: 'wallet-2',
      amount: 8,
      category: 'transport',
      note: 'Bus',
      date: `${month}-06`,
      dedupeKey: 'apple-pay:transaction-2',
    }
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))

    const rendered = renderSettings([first, second])
    root = rendered.root

    await act(async () => {
      findButton(rendered.container, 'Reset This Month').click()
    })
    await waitFor(() => readCachedEntries().length === 0)

    await act(async () => {
      findButton(rendered.container, 'Undo').click()
    })
    await waitFor(() => readCachedEntries().length === 2)

    expect(readCachedEntries()).toEqual([first, second])
    expect(rendered.container).toHaveTextContent('Restored 2 entries')
    expect([...rendered.container.querySelectorAll('button')].some(button =>
      button.textContent?.includes('Undo'),
    )).toBe(false)
  })

  it('keeps the current month when the reset confirmation is declined', () => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const thisMonth: Seed = { id: 'now-1', amount: 12, category: 'lunch', note: 'Rice', date: `${month}-05` }
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))

    const rendered = renderSettings([thisMonth])
    root = rendered.root

    click(findButton(rendered.container, 'Reset This Month'))

    expect(readCachedEntries().map(entry => entry.id)).toEqual(['now-1'])
  })

  it('does not ask for confirmation when there are no entries this month', () => {
    const oldEntry: Seed = {
      id: 'old-1',
      amount: 8,
      category: 'lunch',
      note: 'Noodles',
      date: '2020-01-05',
    }
    vi.stubGlobal('confirm', vi.fn())

    const rendered = renderSettings([oldEntry])
    root = rendered.root

    click(findButton(rendered.container, 'Reset This Month'))

    expect(confirm).not.toHaveBeenCalled()
    expect(rendered.container).toHaveTextContent('No entries to reset this month')
    expect(readCachedEntries()).toEqual([oldEntry])
  })
})
