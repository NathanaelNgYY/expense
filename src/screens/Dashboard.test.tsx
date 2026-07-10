import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Dashboard from './Dashboard'
import { EntriesProvider } from '../EntriesContext'
import type { Entry } from '../types'
import type { ActiveBudgetData, SharedBudget } from '../sharedBudgets/types'

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

let nextId = 0

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: `entry-${nextId++}`,
    amount: 10,
    category: 'lunch',
    note: '',
    date: '2026-05-04',
    ...overrides,
  }
}

function renderWithEntries(entries: unknown[] = []) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(entries), { status: 200 })))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EntriesProvider>
        <Dashboard onSettings={() => undefined} onAddEntry={() => undefined} />
      </EntriesProvider>,
    )
  })

  return { container, root }
}

function clickCategory(container: HTMLElement, label: string): void {
  const button = [...container.querySelectorAll('button, [role="button"]')].find(element =>
    element.textContent?.includes(label),
  )

  if (!button) throw new Error(`Category button ${label} was not found`)

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

describe('Dashboard category expense history', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-07T12:00:00'))
    localStorage.clear()
    nextId = 0
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
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows current-month expenses after clicking a category', () => {
    const rendered = renderWithEntries([
      entry({ amount: 12.5, category: 'lunch', date: '2026-05-04' }),
      entry({ amount: 8, category: 'lunch', date: '2026-04-30' }),
      entry({ amount: 4, category: 'transport', date: '2026-05-05' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Lunch')

    const list = rendered.container.querySelector('#category-expenses-lunch')
    expect(list).toHaveTextContent('Lunch Expenses')
    expect(list).toHaveTextContent('Mon, May 4')
    expect(list).toHaveTextContent('S$12.50')
    expect(list).not.toHaveTextContent('Thu, Apr 30')
    expect(list).not.toHaveTextContent('S$4.00')
  })

  it('shows notes for others expenses', () => {
    const rendered = renderWithEntries([
      entry({
        amount: 100,
        category: 'others',
        note: 'clothes',
        date: '2026-05-06',
      }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Others')

    const list = rendered.container.querySelector('#category-expenses-others')
    expect(list).toHaveTextContent('Others Expenses')
    expect(list).toHaveTextContent('clothes')
    expect(list).toHaveTextContent('S$100.00')
  })

  it('limits category dropdown expenses to the past two weeks', () => {
    vi.setSystemTime(new Date('2026-05-25T12:00:00'))
    const rendered = renderWithEntries([
      entry({ amount: 7, category: 'lunch', date: '2026-05-10' }),
      entry({ amount: 9, category: 'lunch', date: '2026-05-11' }),
      entry({ amount: 14, category: 'lunch', date: '2026-05-24' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Lunch')

    const list = rendered.container.querySelector('#category-expenses-lunch')
    expect(list).toHaveTextContent('Mon, May 11')
    expect(list).toHaveTextContent('Sun, May 24')
    expect(list).not.toHaveTextContent('Sun, May 10')
    expect(list).not.toHaveTextContent('S$7.00')
  })

  it('deletes an entry after confirming with the red minus button', () => {
    // A second entry keeps the dashboard populated, so this exercises the delete itself
    // rather than the empty state (covered below).
    const rendered = renderWithEntries([
      entry({ amount: 12.5, category: 'lunch', date: '2026-05-04' }),
      entry({ id: 'keeper', amount: 2.4, category: 'transport', date: '2026-05-04' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Lunch')

    const list = rendered.container.querySelector('#category-expenses-lunch') as HTMLElement
    expect(list).toHaveTextContent('S$12.50')

    const deleteBtn = list.querySelector('[aria-label="Delete entry"]') as HTMLElement
    act(() => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(list).toHaveTextContent('Delete this entry?')

    const confirmBtn = list.querySelector('[aria-label="Confirm delete"]') as HTMLElement
    act(() => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const after = rendered.container.querySelector('#category-expenses-lunch') as HTMLElement
    expect(after).not.toHaveTextContent('S$12.50')
    expect(after).toHaveTextContent('No lunch entries in the past 2 weeks.')
  })

  it('falls back to the first-run prompt once the last entry is deleted', () => {
    const rendered = renderWithEntries([
      entry({ amount: 12.5, category: 'lunch', date: '2026-05-04' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Lunch')
    const list = rendered.container.querySelector('#category-expenses-lunch') as HTMLElement
    act(() => {
      ;(list.querySelector('[aria-label="Delete entry"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    act(() => {
      ;(list.querySelector('[aria-label="Confirm delete"]') as HTMLElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })

    // No entries left means no budget breakdown to show — offer the one useful action.
    expect(rendered.container).toHaveTextContent('Log your first expense')
    expect(rendered.container.querySelector('#category-expenses-lunch')).toBeNull()
  })

  it('keeps the entry when the delete confirmation is cancelled', () => {
    const rendered = renderWithEntries([
      entry({ amount: 12.5, category: 'lunch', date: '2026-05-04' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Lunch')

    const list = rendered.container.querySelector('#category-expenses-lunch') as HTMLElement
    const deleteBtn = list.querySelector('[aria-label="Delete entry"]') as HTMLElement
    act(() => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const cancelBtn = list.querySelector('[aria-label="Cancel delete"]') as HTMLElement
    act(() => {
      cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(list).not.toHaveTextContent('Delete this entry?')
    expect(list).toHaveTextContent('S$12.50')
  })

  it('lists entries with no category in an Uncategorized section', () => {
    const rendered = renderWithEntries([
      entry({ amount: 18.5, category: null, note: 'PayNow · AH HUAT', date: '2026-05-06' }),
      entry({ amount: 12.5, category: 'lunch', date: '2026-05-04' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Uncategorized')

    const list = rendered.container.querySelector('#category-expenses-uncategorized')
    expect(list).toHaveTextContent('PayNow · AH HUAT')
    expect(list).toHaveTextContent('S$18.50')
  })

  it('shows uncategorized entries from earlier in the month, not just the past two weeks', () => {
    vi.setSystemTime(new Date('2026-05-25T12:00:00'))
    const rendered = renderWithEntries([
      entry({ amount: 30, category: null, note: 'old import', date: '2026-05-02' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Uncategorized')

    const list = rendered.container.querySelector('#category-expenses-uncategorized')
    expect(list).toHaveTextContent('old import')
    expect(list).toHaveTextContent('S$30.00')
  })

  it('hides the Uncategorized section when every entry has a category', () => {
    const rendered = renderWithEntries([
      entry({ amount: 12.5, category: 'lunch', date: '2026-05-04' }),
    ])
    root = rendered.root

    expect(rendered.container).not.toHaveTextContent('Uncategorized')
  })

  it('uses the configured monthly income in the summary', () => {
    localStorage.setItem(
      'budget_config',
      JSON.stringify({
        lunch: 264,
        transport: 50,
        savings: 400,
        investments: 250,
        buffer: 236,
        monthlyIncome: 1800,
      }),
    )

    const rendered = renderWithEntries([])
    root = rendered.root

    expect(rendered.container).toHaveTextContent('S$1,800 / month')
  })

  it('shows a card for a budgeted custom category and its spend', () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_groc_1', label: 'Groceries', budget: 100, icon: 'ShoppingBag' }]),
    )
    const rendered = renderWithEntries([
      entry({ amount: 40, category: 'cat_groc_1', date: '2026-05-04' }),
    ])
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Groceries')
    expect(rendered.container).toHaveTextContent('S$40.00')
    // budgeted custom category shows its remaining budget (100 - 40)
    expect(rendered.container).toHaveTextContent('S$60.00 left')
  })

  it('shows a no-budget custom category card with its spend', () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]),
    )
    const rendered = renderWithEntries([
      entry({ amount: 25, category: 'cat_gym_1', date: '2026-05-04' }),
    ])
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Gym')
    expect(rendered.container).toHaveTextContent('S$25.00')
    expect(rendered.container).toHaveTextContent('No budget set')
    // a no-budget category must not be reported as "over"
    expect(rendered.container).not.toHaveTextContent('S$25.00 over')
  })

  it('shows the selected shared budget from the Home shared view', () => {
    const budget: SharedBudget = {
      id: 'b1',
      name: 'Family',
      monthlyLimit: 100,
      currency: 'SGD',
      inviteCode: 'ABC123',
      ownerId: 'u1',
      createdAt: '2026-05-01T00:00:00Z',
    }
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = {
      budget,
      categories: [{ id: 'c1', budgetId: 'b1', label: 'Groceries', budgetAmount: 60, icon: 'ShoppingBag' }],
      entries: [
        {
          id: 'e1',
          budgetId: 'b1',
          userId: 'u1',
          amount: 20,
          categoryId: 'c1',
          note: 'kopi',
          date: '2026-05-06',
          createdAt: '2026-05-06T00:00:00Z',
          updatedAt: '2026-05-06T00:00:00Z',
        },
      ],
      members: [{ userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-05-01T00:00:00Z' }],
    }

    const rendered = renderWithEntries([])
    root = rendered.root

    clickButton(rendered.container, b => b.getAttribute('aria-label') === 'Switch to Family')

    expect(rendered.container).toHaveTextContent('Family')
    expect(rendered.container).toHaveTextContent('S$20.00 of S$100.00')
    expect(rendered.container).toHaveTextContent('Nat')
    expect(rendered.container).toHaveTextContent('kopi')
  })
})
