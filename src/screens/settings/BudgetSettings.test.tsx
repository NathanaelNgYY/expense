import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import BudgetSettings from './BudgetSettings'
import { EntriesProvider } from '../../EntriesContext'
import { ThemeProvider } from '../../theme/ThemeContext'
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

function makeSharedBudget(): SharedBudget {
  return {
    id: 'b1',
    name: 'Family',
    monthlyLimit: 100,
    currency: 'SGD',
    inviteCode: 'ABC123',
    ownerId: 'u1',
    createdAt: '2026-07-01T00:00:00Z',
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

function renderBudget(entries: unknown[] = [], onDone: () => void = () => undefined) {
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
          <BudgetSettings onDone={onDone} />
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

function clickButton(container: HTMLElement, predicate: (b: HTMLButtonElement) => boolean): void {
  const button = [...container.querySelectorAll('button')].find(predicate)
  if (!button) throw new Error('Button not found')
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

// The save control is a sticky bar that only exists while the form is dirty.
function clickSave(container: HTMLElement): void {
  const button = [...container.querySelectorAll('button')].find(element =>
    element.textContent?.includes('Save changes'),
  )

  if (!button) throw new Error('Save changes button was not found — is the form dirty?')

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function readCustom(): Array<{ label: string; budget: number | null; icon: string }> {
  return JSON.parse(localStorage.getItem('budget_custom_categories') ?? '[]')
}

describe('BudgetSettings', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
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
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('saves an edited monthly income', () => {
    const rendered = renderBudget()
    root = rendered.root

    const input = rendered.container.querySelector<HTMLInputElement>('#budget-monthly-income')
    expect(input).not.toBeNull()

    changeInput(input!, '1800')
    clickSave(rendered.container)

    expect(JSON.parse(localStorage.getItem('budget_config') ?? '{}')).toMatchObject({
      monthlyIncome: 1800,
    })
  })

  it('warns when the category totals no longer match the income', () => {
    const rendered = renderBudget()
    root = rendered.root
    const { container } = rendered

    // The seeded default budget adds up to the default income, so no warning yet.
    expect(container.querySelector('.settings-total-warning')).toBeNull()

    changeInput(container.querySelector<HTMLInputElement>('#budget-monthly-income')!, '1800')

    expect(container.querySelector('.settings-total-warning')).not.toBeNull()
    expect(container).toHaveTextContent('Total: S$1,200.00')
  })

  it('adds a custom category with a budget and persists on save', () => {
    const rendered = renderBudget()
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
    const rendered = renderBudget()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.trim() === 'Add category')
    changeInput(container.querySelector<HTMLInputElement>('#new-cat-name')!, 'Gym')
    clickButton(container, b => b.textContent?.trim() === 'Add')
    clickSave(container)

    expect(readCustom()[0]).toMatchObject({ label: 'Gym', budget: null })
  })

  it('edits the budget of an existing custom category', () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]),
    )
    const rendered = renderBudget()
    root = rendered.root
    const { container } = rendered

    changeInput(container.querySelector<HTMLInputElement>('#custom-cat_gym_1')!, '45')
    clickSave(container)

    expect(readCustom()[0]).toMatchObject({ label: 'Gym', budget: 45 })
  })

  it('removes a category with no entries', () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]),
    )
    const rendered = renderBudget()
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
    const rendered = renderBudget([
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
    const rendered = renderBudget()
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
    const rendered = renderBudget()
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
    const rendered = renderBudget()
    root = rendered.root
    const { container } = rendered

    const editButtons = [...container.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))
    expect(editButtons).toContain('Edit Lunch')
    expect(editButtons).not.toContain('Edit Buffer')
  })

  it('hides the scope switch when there are no shared budgets', () => {
    const rendered = renderBudget()
    root = rendered.root

    expect(rendered.container.querySelector('.scope-switch')).toBeNull()
  })

  it('shows shared budget settings after switching scope, and not before', () => {
    const budget = makeSharedBudget()
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = makeActive(budget)

    const rendered = renderBudget()
    root = rendered.root
    const { container } = rendered

    // Personal scope: the shared subscreen must not be mounted, so it must not have
    // asked the context to open a shared budget.
    expect(container.querySelector('#shared-monthly-limit')).toBeNull()
    expect(sharedCtx.value.openBudget).not.toHaveBeenCalled()

    clickButton(container, b => b.textContent?.trim() === 'Shared')

    expect(container.querySelector('#shared-monthly-limit')).not.toBeNull()
    expect(container).toHaveTextContent('Shared Categories')
    // Personal fields are gone while in shared scope.
    expect(container.querySelector('#budget-monthly-income')).toBeNull()
  })

  it('guards Back when the form is dirty', () => {
    const onDone = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const rendered = renderBudget([], onDone)
    root = rendered.root

    changeInput(rendered.container.querySelector<HTMLInputElement>('#budget-monthly-income')!, '1800')
    clickButton(rendered.container, b => b.textContent?.includes('Settings') ?? false)

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(onDone).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('leaves when the dirty guard is confirmed', () => {
    const onDone = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const rendered = renderBudget([], onDone)
    root = rendered.root

    changeInput(rendered.container.querySelector<HTMLInputElement>('#budget-monthly-income')!, '1800')
    clickButton(rendered.container, b => b.textContent?.includes('Settings') ?? false)

    expect(onDone).toHaveBeenCalledOnce()
    confirmSpy.mockRestore()
  })

  it('goes back without confirm when clean', () => {
    const onDone = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    const rendered = renderBudget([], onDone)
    root = rendered.root

    clickButton(rendered.container, b => b.textContent?.includes('Settings') ?? false)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledOnce()
    confirmSpy.mockRestore()
  })
})
