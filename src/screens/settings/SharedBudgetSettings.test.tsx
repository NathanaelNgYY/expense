import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SharedBudgetSettings from './SharedBudgetSettings'
import type { ActiveBudgetData, SharedBudget } from '../../sharedBudgets/types'

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

vi.mock('../../sharedBudgets/SharedBudgetsContext', () => ({
  useSharedBudgets: () => sharedCtx.value,
}))

function makeBudget(overrides: Partial<SharedBudget> = {}): SharedBudget {
  return {
    id: 'b1',
    name: 'Family',
    monthlyLimit: 100,
    currency: 'SGD',
    inviteCode: 'ABC123',
    ownerId: 'u1',
    createdAt: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function makeActive(budget: SharedBudget): ActiveBudgetData {
  return {
    budget,
    categories: [{ id: 'c1', budgetId: budget.id, label: 'Groceries', budgetAmount: 40, icon: 'ShoppingBag' }],
    entries: [],
    members: [{ userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' }],
  }
}

function renderShared(onSaved: () => void = () => undefined) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<SharedBudgetSettings onSaved={onSaved} />)
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

function clickButton(container: HTMLElement, predicate: (b: HTMLButtonElement) => boolean): void {
  const button = [...container.querySelectorAll('button')].find(predicate)
  if (!button) throw new Error('Button not found')
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function clickButtonAsync(container: HTMLElement, predicate: (b: HTMLButtonElement) => boolean): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(predicate)
  if (!button) throw new Error('Button not found')
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('SharedBudgetSettings', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    sharedCtx.value.session = { user: { id: 'u1' } }
    sharedCtx.value.budgets = []
    sharedCtx.value.active = null
    sharedCtx.value.error = null
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
  })

  it('edits the selected shared budget limit and categories, then returns to the hub', async () => {
    const budget = makeBudget()
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = makeActive(budget)
    sharedCtx.value.updateActiveBudget.mockResolvedValue(undefined)
    sharedCtx.value.addCategory.mockResolvedValue(undefined)
    const onSaved = vi.fn()

    const rendered = renderShared(onSaved)
    root = rendered.root
    const { container } = rendered

    changeInput(container.querySelector<HTMLInputElement>('#shared-monthly-limit')!, '250')
    clickButton(container, b => b.textContent?.trim() === 'Add category')
    changeInput(container.querySelector<HTMLInputElement>('#shared-new-cat-name')!, 'Snacks')
    changeInput(container.querySelector<HTMLInputElement>('#shared-new-cat-budget')!, '25')
    await clickButtonAsync(container, b => b.textContent?.trim() === 'Add')
    await clickButtonAsync(container, b => b.textContent?.includes('Save Shared Budget') ?? false)

    expect(sharedCtx.value.addCategory).toHaveBeenCalledWith({
      label: 'Snacks',
      budgetAmount: 25,
      icon: expect.any(String),
    })
    expect(sharedCtx.value.updateActiveBudget).toHaveBeenCalledWith({ monthlyLimit: 250 })
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('saves a changed category budget for the active budget', async () => {
    const budget = makeBudget()
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = makeActive(budget)
    sharedCtx.value.updateActiveBudget.mockResolvedValue(undefined)
    sharedCtx.value.updateCategory.mockResolvedValue(undefined)

    const rendered = renderShared()
    root = rendered.root
    const { container } = rendered

    // Seeded from the active snapshot, then edited.
    const categoryInput = container.querySelector<HTMLInputElement>('#shared-cat-c1')
    expect(categoryInput?.value).toBe('40')
    changeInput(categoryInput!, '75')
    await clickButtonAsync(container, b => b.textContent?.includes('Save Shared Budget') ?? false)

    expect(sharedCtx.value.updateCategory).toHaveBeenCalledWith('c1', { budgetAmount: 75 })
  })

  it('removes a shared category', () => {
    const budget = makeBudget()
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = makeActive(budget)

    const rendered = renderShared()
    root = rendered.root

    clickButton(rendered.container, b => b.getAttribute('aria-label') === 'Remove Groceries')

    expect(sharedCtx.value.removeCategory).toHaveBeenCalledWith('c1')
  })

  it('lets a non-owner view nothing but an explanation', () => {
    const budget = makeBudget({ ownerId: 'someone-else' })
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = makeActive(budget)

    const rendered = renderShared()
    root = rendered.root
    const { container } = rendered

    expect(container).toHaveTextContent('Only the budget owner can change shared budget settings.')
    expect(container.querySelector('#shared-monthly-limit')).toBeNull()
  })

  it('offers a budget picker when more than one shared budget exists and opens the picked one', () => {
    const family = makeBudget()
    const flat = makeBudget({ id: 'b2', name: 'Flat' })
    sharedCtx.value.budgets = [family, flat]
    sharedCtx.value.active = makeActive(family)
    sharedCtx.value.openBudget.mockResolvedValue(undefined)

    const rendered = renderShared()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.trim() === 'Flat')

    // The picked budget is not the active snapshot yet, so the component asks for it
    // and shows a loading state until it arrives.
    expect(sharedCtx.value.openBudget).toHaveBeenCalledWith('b2')
    expect(container).toHaveTextContent('Loading shared budget settings')
  })

  it('surfaces a shared-context error', () => {
    const budget = makeBudget()
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = makeActive(budget)
    sharedCtx.value.error = 'Network unreachable'

    const rendered = renderShared()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Network unreachable')
  })
})
