import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HistoryLedgerFilters from './HistoryLedgerFilters'

function renderFilters(overrides: Partial<React.ComponentProps<typeof HistoryLedgerFilters>> = {}) {
  const props: React.ComponentProps<typeof HistoryLedgerFilters> = {
    searchQuery: '',
    onSearchQueryChange: vi.fn(),
    showFilters: false,
    onShowFiltersChange: vi.fn(),
    activeFilterCount: 0,
    categoryFilter: 'all',
    onCategoryFilterChange: vi.fn(),
    sourceFilter: 'all',
    onSourceFilterChange: vi.fn(),
    dateFrom: '',
    onDateFromChange: vi.fn(),
    dateTo: '',
    onDateToChange: vi.fn(),
    dateMin: '2026-07-01',
    dateMax: '2026-07-18',
    categoryOptions: [{ id: 'lunch', label: 'Lunch' }],
    filteredCount: 2,
    totalCount: 4,
    onClearFilters: vi.fn(),
    ...overrides,
  }

  render(<HistoryLedgerFilters {...props} />)
  return props
}

describe('HistoryLedgerFilters', () => {
  it('publishes search input and exposes the filtered result count', () => {
    const props = renderFilters()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search transactions' }), {
      target: { value: 'coffee' },
    })

    expect(props.onSearchQueryChange).toHaveBeenCalledWith('coffee')
    expect(screen.getByRole('status')).toHaveTextContent('2 of 4 transactions')
  })

  it('opens the filter panel and reports active filters', () => {
    const props = renderFilters({ activeFilterCount: 2 })

    fireEvent.click(screen.getByRole('button', { name: 'Show transaction filters' }))

    expect(props.onShowFiltersChange).toHaveBeenCalledWith(true)
    expect(screen.getByText('2')).toHaveClass('history-filter-count')
  })

  it('clears an existing query', () => {
    const props = renderFilters({ searchQuery: 'taxi' })

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(props.onSearchQueryChange).toHaveBeenCalledWith('')
  })
})
