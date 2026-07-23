import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '../test-utils'
import CategoryDeltas from './CategoryDeltas'
import { BudgetConfigProvider } from '../BudgetConfigContext'
import type { CustomCategory, Entry } from '../types'

const REFERENCE = new Date(2026, 6, 23) // 23 July 2026

const groceries: CustomCategory = {
  id: 'cat_groceries',
  label: 'Groceries',
  budget: 300,
  icon: 'ShoppingBasket',
}

function entry(id: string, amount: number, monthIndex: number, category = 'lunch'): Entry {
  const mm = String(monthIndex + 1).padStart(2, '0')
  return { id, amount, category, note: '', date: `2026-${mm}-05` }
}

function renderDeltas(entries: Entry[], month = 6, customCategories: CustomCategory[] = []) {
  return render(
    <CategoryDeltas
      entries={entries}
      year={2026}
      month={month}
      referenceDate={REFERENCE}
      customCategories={customCategories}
    />,
  )
}

describe('CategoryDeltas', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists one row per spent category and leaves untouched ones out', () => {
    const { container } = renderDeltas([
      entry('a', 400, 4),
      entry('b', 500, 5),
      entry('c', 80, 5, groceries.id),
      entry('d', 60, 6),
    ], 6, [groceries])

    expect(screen.getByRole('heading', { name: 'By category' })).toBeVisible()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.queryByText('Transport')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.trend-spark')).toHaveLength(2)
  })

  it('names the baseline it is using instead of leaving the reader to guess', () => {
    renderDeltas([entry('a', 400, 4), entry('b', 500, 5), entry('c', 60, 6)])

    expect(screen.getByText('Compared with your six-month average')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'vs June' }))
    expect(screen.getByText('Compared with June')).toBeInTheDocument()
  })

  it('recomputes every delta against the chosen baseline', () => {
    // Lunch: 400 (May), 500 (June), 60 (July). Six-month average of the two
    // complete months is 450; last month alone is 500.
    renderDeltas([entry('a', 400, 4), entry('b', 500, 5), entry('c', 60, 6)])

    expect(screen.getByText('-S$390.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'vs June' }))
    expect(screen.getByText('-S$440.00')).toBeInTheDocument()
    expect(screen.queryByText('-S$390.00')).not.toBeInTheDocument()
  })

  it('offers no switch when only one baseline exists', () => {
    // May is the first logged month, so July has a previous month but no
    // six-month average to compare against.
    renderDeltas([entry('a', 400, 5), entry('b', 60, 6)])

    expect(screen.queryByRole('group', { name: 'Comparison baseline' })).not.toBeInTheDocument()
    expect(screen.getByText('Compared with June')).toBeInTheDocument()
  })

  it('falls back to an available baseline when the preferred one disappears', () => {
    const entries = [entry('a', 400, 4), entry('b', 500, 5), entry('c', 60, 6)]
    const { rerender } = renderDeltas(entries)

    fireEvent.click(screen.getByRole('button', { name: 'vs June' }))
    expect(screen.getByText('Compared with June')).toBeInTheDocument()

    // Paging back to June leaves only May behind it: no six-month average, and
    // "vs June" is no longer a baseline either — the list must not go blank.
    rerender(
      <BudgetConfigProvider>
        <CategoryDeltas
          entries={entries}
          year={2026}
          month={5}
          referenceDate={REFERENCE}
          customCategories={[]}
        />
      </BudgetConfigProvider>,
    )
    expect(screen.getByText('Compared with May')).toBeInTheDocument()
  })

  it('renders nothing when there is no baseline at all', () => {
    const { container } = renderDeltas([entry('a', 60, 6)])
    expect(container).toBeEmptyDOMElement()
  })

  it('marks the pressed baseline for assistive technology', () => {
    renderDeltas([entry('a', 400, 4), entry('b', 500, 5), entry('c', 60, 6)])

    const average = screen.getByRole('button', { name: 'vs 6-month avg' })
    const previous = screen.getByRole('button', { name: 'vs June' })
    expect(average).toHaveAttribute('aria-pressed', 'true')
    expect(previous).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(previous)
    expect(previous).toHaveAttribute('aria-pressed', 'true')
    expect(average).toHaveAttribute('aria-pressed', 'false')
  })
})
