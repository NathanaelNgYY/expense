import { Search, SlidersHorizontal, X } from 'lucide-react'

export type CategoryFilter = 'all' | 'uncategorized' | string
export type SourceFilter = 'all' | 'manual' | 'apple-pay' | 'dbs-email'

interface CategoryOption {
  id: string
  label: string
}

interface Props {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  showFilters: boolean
  onShowFiltersChange: (value: boolean) => void
  activeFilterCount: number
  categoryFilter: CategoryFilter
  onCategoryFilterChange: (value: CategoryFilter) => void
  sourceFilter: SourceFilter
  onSourceFilterChange: (value: SourceFilter) => void
  dateFrom: string
  onDateFromChange: (value: string) => void
  dateTo: string
  onDateToChange: (value: string) => void
  dateMin: string
  dateMax: string
  categoryOptions: CategoryOption[]
  filteredCount: number
  totalCount: number
  onClearFilters: () => void
}

export default function HistoryLedgerFilters({
  searchQuery,
  onSearchQueryChange,
  showFilters,
  onShowFiltersChange,
  activeFilterCount,
  categoryFilter,
  onCategoryFilterChange,
  sourceFilter,
  onSourceFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  dateMin,
  dateMax,
  categoryOptions,
  filteredCount,
  totalCount,
  onClearFilters,
}: Props) {
  return (
    <section className="history-ledger-tools" aria-label="Transaction search and filters">
      <div className="history-search-row">
        <label className="history-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            aria-label="Search transactions"
            placeholder="Search note or merchant"
            onChange={event => onSearchQueryChange(event.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={() => onSearchQueryChange('')} aria-label="Clear search">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>
        <button
          type="button"
          className={`history-filter-toggle${showFilters ? ' history-filter-toggle--active' : ''}`}
          onClick={() => onShowFiltersChange(!showFilters)}
          aria-label={showFilters ? 'Hide transaction filters' : 'Show transaction filters'}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {activeFilterCount > 0 && <span className="history-filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="history-filter-panel">
          <label className="form-field" htmlFor="history-category-filter">
            <span>Category</span>
            <select
              id="history-category-filter"
              className="history-filter-select"
              value={categoryFilter}
              onChange={event => onCategoryFilterChange(event.target.value)}
            >
              <option value="all">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categoryOptions.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="form-field" htmlFor="history-source-filter">
            <span>Source</span>
            <select
              id="history-source-filter"
              className="history-filter-select"
              value={sourceFilter}
              onChange={event => onSourceFilterChange(event.target.value as SourceFilter)}
            >
              <option value="all">All sources</option>
              <option value="manual">Manual</option>
              <option value="apple-pay">Apple Pay</option>
              <option value="dbs-email">DBS email</option>
            </select>
          </label>
          <div className="history-date-filters">
            <label className="form-field" htmlFor="history-date-from">
              <span>From</span>
              <input
                id="history-date-from"
                type="date"
                className="history-filter-date"
                value={dateFrom}
                min={dateMin}
                max={dateTo || dateMax}
                onChange={event => onDateFromChange(event.target.value)}
              />
            </label>
            <label className="form-field" htmlFor="history-date-to">
              <span>To</span>
              <input
                id="history-date-to"
                type="date"
                className="history-filter-date"
                value={dateTo}
                min={dateFrom || dateMin}
                max={dateMax}
                onChange={event => onDateToChange(event.target.value)}
              />
            </label>
          </div>
          <button type="button" className="history-clear-filters" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}

      <p className="history-result-count" role="status">
        {filteredCount === totalCount
          ? `${totalCount} ${totalCount === 1 ? 'transaction' : 'transactions'}`
          : `${filteredCount} of ${totalCount} transactions`}
      </p>
    </section>
  )
}
