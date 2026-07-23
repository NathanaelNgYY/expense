import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntriesProvider } from '../EntriesContext'
import { BudgetConfigProvider } from '../BudgetConfigContext'
import Insights from './Insights'
import { DEFAULT_BUDGET } from '../types'
import { saveActiveCurrency, saveWalletMap } from '../storage'

describe('Insights', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T12:00:00'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })))
  })

  afterEach(() => {
    act(() => root?.unmount())
    document.body.replaceChildren()
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('owns the monthly category, weekly and pattern analysis', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <BudgetConfigProvider>
          <EntriesProvider>
            <Insights />
          </EntriesProvider>
        </BudgetConfigProvider>,
      )
    })

    expect(container.querySelector('h1')).toHaveTextContent('Insights')
    expect(container).toHaveTextContent('Category Breakdown')
    expect(container).toHaveTextContent('Weekly Spending')
    expect(container).toHaveTextContent('Month Review')
  })

  it('scopes boundary weeks to the selected month and exposes an accessible spending summary', async () => {
    localStorage.setItem('budget_entries', JSON.stringify([
      { id: 'april-lunch', amount: 100, category: 'lunch', note: '', date: '2026-04-30' },
      { id: 'may-lunch', amount: 10, category: 'lunch', note: '', date: '2026-05-01' },
    ]))
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <BudgetConfigProvider>
          <EntriesProvider><Insights /></EntriesProvider>
        </BudgetConfigProvider>,
      )
    })

    const firstWeek = container.querySelector<HTMLElement>('.week-bar')
    if (!firstWeek) throw new Error('First weekly spending card was not found')
    expect(firstWeek).toHaveTextContent('S$10.00')
    expect(firstWeek).not.toHaveTextContent('S$110.00')
    expect(firstWeek).toHaveAccessibleDescription(
      'Total S$10.00 of S$116.13 target. Lunch S$10.00 of S$25.55 target.',
    )
  })

  it('shows the largest variable envelope as the weekly pace sub-bar, not a hard-coded Lunch', async () => {
    saveWalletMap({
      SGD: { config: { ...DEFAULT_BUDGET, lunch: 100, others: 400 }, customCategories: [], overrides: {} },
    })
    saveActiveCurrency('SGD')
    localStorage.setItem('budget_entries', JSON.stringify([
      { id: 'may-others', amount: 12, category: 'others', note: '', date: '2026-05-01' },
    ]))
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <BudgetConfigProvider>
          <EntriesProvider><Insights /></EntriesProvider>
        </BudgetConfigProvider>,
      )
    })

    const paceLabel = container.querySelector('.week-bar .week-bar-lunch .muted')
    expect(paceLabel?.textContent).toMatch(/^Others/)
    expect(paceLabel?.textContent).not.toMatch(/Lunch/)
  })

  it('only analyzes entries in the active currency wallet', async () => {
    saveWalletMap({
      SGD: { config: DEFAULT_BUDGET, customCategories: [], overrides: {} },
      MYR: { config: { ...DEFAULT_BUDGET, monthlyIncome: 3000 }, customCategories: [], overrides: {} },
    })
    saveActiveCurrency('MYR')
    localStorage.setItem('budget_entries', JSON.stringify([
      { id: 'sgd', amount: 90, category: 'lunch', note: '', date: '2026-05-01', currency: 'SGD' },
      { id: 'myr', amount: 25, category: 'lunch', note: '', date: '2026-05-01', currency: 'MYR' },
    ]))
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<BudgetConfigProvider><EntriesProvider><Insights /></EntriesProvider></BudgetConfigProvider>))

    expect(container).toHaveTextContent('RM25.00')
    expect(container).not.toHaveTextContent('S$90.00')
  })
})
