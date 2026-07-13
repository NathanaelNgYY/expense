import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
