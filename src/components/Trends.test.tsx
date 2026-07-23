import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '../test-utils'
import Trends from './Trends'
import type { CustomCategory, Entry } from '../types'

const REFERENCE = new Date(2026, 6, 23) // 23 July 2026

function entry(id: string, amount: number, date: string, category: string = 'lunch'): Entry {
  return { id, amount, category, note: '', date }
}

function monthOf(monthIndex: number, amount: number, category = 'lunch'): Entry {
  const mm = String(monthIndex + 1).padStart(2, '0')
  return entry(`${category}-${mm}`, amount, `2026-${mm}-05`, category)
}

function renderTrends(entries: Entry[], month = 6, customCategories: CustomCategory[] = []) {
  return render(
    <Trends
      entries={entries}
      year={2026}
      month={month}
      referenceDate={REFERENCE}
      customCategories={customCategories}
    />,
  )
}

describe('Trends', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('withholds the chart until two complete months exist', () => {
    renderTrends([monthOf(5, 500), monthOf(6, 60)]) // June complete, July running

    expect(screen.getByText(/One more full month/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('counts down from two when nothing is complete yet', () => {
    renderTrends([monthOf(6, 60)])

    expect(screen.getByText(/Two full months of tracking/)).toBeInTheDocument()
  })

  it('draws a bar per month once the chart is earned', () => {
    const { container } = renderTrends([monthOf(4, 400), monthOf(5, 500), monthOf(6, 60)])

    expect(container.querySelectorAll('.trend-bar')).toHaveLength(3)
    expect(container.querySelectorAll('.trend-bar--partial')).toHaveLength(1)
  })

  it('describes the whole series for screen readers instead of the geometry', () => {
    renderTrends([monthOf(4, 400), monthOf(5, 500), monthOf(6, 60)])

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Six-month spending: May S$400.00, June S$500.00, July S$60.00 so far.',
    )
  })

  it('states the average month and marks the running month as unfinished', () => {
    renderTrends([monthOf(4, 400), monthOf(5, 500), monthOf(6, 60)])

    expect(screen.getByText('Average month S$450 · July S$60.00 so far')).toBeInTheDocument()
  })

  it('compares the selected month against the average of the others', () => {
    renderTrends([monthOf(4, 400), monthOf(5, 500), monthOf(6, 60)])

    expect(screen.getByText('vs your average')).toBeInTheDocument()
    expect(screen.getByText(/-S\$390\.00 so far/)).toBeInTheDocument()
  })

  it('names the leanest and heaviest complete months', () => {
    renderTrends([monthOf(4, 400), monthOf(5, 500), monthOf(6, 60)])

    expect(screen.getByText('May — S$400.00')).toBeInTheDocument()
    expect(screen.getByText('June — S$500.00')).toBeInTheDocument()
  })

  it('reports the daily pace against the usual rate', () => {
    renderTrends([monthOf(4, 400), monthOf(5, 500), monthOf(6, 60)])

    expect(screen.getByText('Daily pace')).toBeInTheDocument()
    expect(screen.getByText(/vs usual/)).toBeInTheDocument()
  })

  it('lists a sparkline row per spent category and leaves untouched ones out', () => {
    const groceries: CustomCategory = {
      id: 'cat_groceries',
      label: 'Groceries',
      budget: 300,
      icon: 'ShoppingBasket',
    }
    const entries = [
      monthOf(4, 400),
      monthOf(5, 500),
      monthOf(5, 80, groceries.id),
      monthOf(6, 60),
    ]

    const { container } = renderTrends(entries, 6, [groceries])

    expect(screen.getByText('Category trends')).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.queryByText('Transport')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.trend-spark')).toHaveLength(2)
  })

  it('pairs every delta with a sign so colour is never the only signal', () => {
    const { container } = renderTrends([monthOf(4, 400), monthOf(5, 500), monthOf(6, 60)])

    for (const delta of container.querySelectorAll('.trend-delta--up, .trend-delta--down')) {
      expect(delta.textContent).toMatch(/[+-]/)
    }
  })
})
