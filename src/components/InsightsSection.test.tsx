import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '../test-utils'
import InsightsSection from './InsightsSection'
import type { CustomCategory, Entry } from '../types'

const groceries: CustomCategory = {
  id: 'cat_groceries',
  label: 'Groceries',
  budget: 300,
  icon: 'ShoppingBasket',
}

function entry(id: string, amount: number, category: string, day: number): Entry {
  return {
    id,
    amount,
    category,
    note: '',
    date: `2026-05-${String(day).padStart(2, '0')}`,
  }
}

describe('InsightsSection analytics', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders a custom category as the most expensive category for the selected month', () => {
    const entries = [
      entry('groceries', 120, groceries.id, 1),
      ...Array.from({ length: 14 }, (_, index) =>
        entry(`transport-${index}`, 1, 'transport', index + 2),
      ),
    ]

    render(
      <InsightsSection
        entries={entries}
        year={2026}
        month={4}
        customCategories={[groceries]}
      />,
    )

    expect(screen.getByText(/Groceries.*S\$120\.00/)).toBeInTheDocument()
  })

  it('renders total highest-day spend and a weekday pattern scoped to the selected month', () => {
    const currentMonth = [
      entry('largest', 400, 'savings', 5), // Tuesday
      ...Array.from({ length: 8 }, (_, index) =>
        entry(`tuesday-${index}`, 5, 'lunch', index % 2 === 0 ? 12 : 19),
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        entry(`other-${index}`, 1, 'transport', index + 6),
      ),
    ]
    const previousMonth: Entry[] = [
      { ...entry('april-monday', 900, 'transport', 1), date: '2026-04-06' },
      { ...entry('april-tuesday', 1, 'transport', 1), date: '2026-04-07' },
      { ...entry('april-wednesday', 1, 'transport', 1), date: '2026-04-08' },
    ]

    render(
      <InsightsSection
        entries={[...previousMonth, ...currentMonth]}
        year={2026}
        month={4}
        customCategories={[]}
      />,
    )

    expect(screen.getByText(/Tue May 5.*S\$400\.00/)).toBeInTheDocument()
    expect(screen.getByText('Mostly Tuesdays')).toBeInTheDocument()
  })

  it('explains when the selected month has no entries', () => {
    render(
      <InsightsSection entries={[]} year={2026} month={4} customCategories={[]} />,
    )

    expect(screen.getByText('No spending logged this month yet.')).toBeInTheDocument()
  })

  it('uses singular copy when one more entry is needed for insights', () => {
    const entries = Array.from({ length: 14 }, (_, index) =>
      entry(`entry-${index}`, 1, 'transport', index + 1),
    )

    render(
      <InsightsSection entries={entries} year={2026} month={4} customCategories={[]} />,
    )

    expect(screen.getByText('1 more entry and your spending patterns show up here.')).toBeInTheDocument()
  })
})
