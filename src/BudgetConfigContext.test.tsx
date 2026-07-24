import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BudgetConfigProvider, useBudgetConfig } from './BudgetConfigContext'
import {
  getBudgetConfig,
  getCategoryOverrides,
  getCustomCategories,
  saveBudgetConfig,
  saveCategoryOverrides,
  saveCustomCategories,
} from './storage'
import { DEFAULT_BUDGET, type BudgetConfig, type CategoryOverrides, type CustomCategory } from './types'
import { activateUserStorage } from './userStorage'

const storedConfig: BudgetConfig = {
  monthlyIncome: 2400,
  lunch: 300,
  transport: 120,
  savings: 800,
  investments: 500,
  buffer: 680,
  others: 680,
  trackByCategory: true,
}

const storedCategories: CustomCategory[] = [
  { id: 'cat_groceries', label: 'Groceries', budget: 200, icon: 'shopping-cart' },
]

const storedOverrides: CategoryOverrides = {
  lunch: { label: 'Meals', icon: 'utensils' },
}

function Probe() {
  const budget = useBudgetConfig()
  return (
    <>
      <output aria-label="active-currency">{budget.activeCurrency}</output>
      <output aria-label="wallet-count">{budget.currencies.length}</output>
      <output aria-label="config">{JSON.stringify(budget.config)}</output>
      <output aria-label="categories">{JSON.stringify(budget.customCategories)}</output>
      <output aria-label="overrides">{JSON.stringify(budget.overrides)}</output>
      <button type="button" onClick={() => budget.saveConfig(storedConfig)}>Save config</button>
      <button type="button" onClick={() => budget.saveCustomCategories(storedCategories)}>Save categories</button>
      <button type="button" onClick={() => budget.saveOverrides(storedOverrides)}>Save overrides</button>
      <button
        type="button"
        onClick={() => budget.saveBudgets({
          config: storedConfig,
          customCategories: storedCategories,
          overrides: storedOverrides,
        })}
      >
        Save all
      </button>
      <button type="button" onClick={budget.reload}>Reload</button>
      <button
        type="button"
        onClick={() => budget.createWallet('MYR', {
          config: { ...storedConfig, monthlyIncome: 3600 },
          customCategories: [],
          overrides: {},
        })}
      >
        Create MYR
      </button>
      <button type="button" onClick={() => budget.setActiveCurrency('SGD')}>Switch SGD</button>
    </>
  )
}

function renderProbe() {
  return render(
    <BudgetConfigProvider>
      <Probe />
    </BudgetConfigProvider>,
  )
}

describe('BudgetConfigProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('seeds all reactive values from storage on mount', () => {
    saveBudgetConfig(storedConfig)
    saveCustomCategories(storedCategories)
    saveCategoryOverrides(storedOverrides)

    renderProbe()

    expect(screen.getByLabelText('config')).toHaveTextContent(JSON.stringify(storedConfig))
    expect(screen.getByLabelText('categories')).toHaveTextContent(JSON.stringify(storedCategories))
    expect(screen.getByLabelText('overrides')).toHaveTextContent(JSON.stringify(storedOverrides))
  })

  it('individual setters persist and re-render consumers', () => {
    renderProbe()

    act(() => screen.getByRole('button', { name: 'Save config' }).click())
    act(() => screen.getByRole('button', { name: 'Save categories' }).click())
    act(() => screen.getByRole('button', { name: 'Save overrides' }).click())

    expect(getBudgetConfig()).toEqual(storedConfig)
    expect(getCustomCategories()).toEqual(storedCategories)
    expect(getCategoryOverrides()).toEqual(storedOverrides)
    expect(screen.getByLabelText('config')).toHaveTextContent(JSON.stringify(storedConfig))
    expect(screen.getByLabelText('categories')).toHaveTextContent(JSON.stringify(storedCategories))
    expect(screen.getByLabelText('overrides')).toHaveTextContent(JSON.stringify(storedOverrides))
  })

  it('saveBudgets persists and publishes one complete snapshot', () => {
    const observed: string[] = []

    function SnapshotProbe() {
      const budget = useBudgetConfig()
      observed.push(JSON.stringify({
        config: budget.config,
        customCategories: budget.customCategories,
        overrides: budget.overrides,
      }))
      return <button type="button" onClick={() => budget.saveBudgets({
        config: storedConfig,
        customCategories: storedCategories,
        overrides: storedOverrides,
      })}>Save snapshot</button>
    }

    render(<BudgetConfigProvider><SnapshotProbe /></BudgetConfigProvider>)
    act(() => screen.getByRole('button', { name: 'Save snapshot' }).click())

    expect(observed).toHaveLength(2)
    expect(JSON.parse(observed[1])).toEqual({
      config: storedConfig,
      customCategories: storedCategories,
      overrides: storedOverrides,
    })
  })

  it('reload picks up storage writes made outside the context', () => {
    renderProbe()
    saveBudgetConfig(storedConfig)
    saveCustomCategories(storedCategories)
    saveCategoryOverrides(storedOverrides)

    act(() => screen.getByRole('button', { name: 'Reload' }).click())

    expect(screen.getByLabelText('config')).toHaveTextContent(JSON.stringify(storedConfig))
    expect(screen.getByLabelText('categories')).toHaveTextContent(JSON.stringify(storedCategories))
    expect(screen.getByLabelText('overrides')).toHaveTextContent(JSON.stringify(storedOverrides))
  })

  it('reloads the new namespace when the active user changes', () => {
    activateUserStorage('user-a')
    saveBudgetConfig(DEFAULT_BUDGET)
    activateUserStorage('user-b')
    saveBudgetConfig(storedConfig)
    activateUserStorage('user-a')
    renderProbe()

    act(() => {
      activateUserStorage('user-b')
    })

    expect(screen.getByLabelText('config')).toHaveTextContent(JSON.stringify(storedConfig))
  })

  it('creates and switches isolated wallet snapshots', () => {
    renderProbe()

    act(() => screen.getByRole('button', { name: 'Create MYR' }).click())

    expect(screen.getByLabelText('active-currency')).toHaveTextContent('MYR')
    expect(screen.getByLabelText('wallet-count')).toHaveTextContent('2')
    expect(screen.getByLabelText('config')).toHaveTextContent('"monthlyIncome":3600')

    act(() => screen.getByRole('button', { name: 'Switch SGD' }).click())

    expect(screen.getByLabelText('active-currency')).toHaveTextContent('SGD')
    expect(screen.getByLabelText('config')).toHaveTextContent(JSON.stringify(DEFAULT_BUDGET))
  })
})
