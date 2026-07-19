import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, Minus, X } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from '../components/BudgetIcon'
import BudgetUsageRing from '../components/BudgetUsageRing'
import BudgetPassStack, { type BudgetPass } from '../components/dashboard/BudgetPassStack'
import SharedBudgetDashboard from '../components/dashboard/SharedBudgetDashboard'
import SyncStatus from '../components/SyncStatus'
import CurrencyWalletMenu from '../components/CurrencyWalletMenu'
import { downloadJsonBackup } from '../dataTransfer'
import { useBudgetConfig } from '../BudgetConfigContext'
import { categoryIcon, categoryLabel } from '../categoryDisplay'
import {
  bufferRemaining,
  categoryDeficits,
  entriesForMonth,
  monthlySpendByCategory,
  weeklyTotal,
  allCategoryIds,
  categoryBudgets,
  customBudgetTotal,
  safeToSpendPerDay,
} from '../compute'
import { addDays, fromLocalDateString, toLocalDateString } from '../dates'
import { sgtToday } from '../shared/sgtDate'
import { formatEntryAmount, formatMoney, formatMoneyWhole, formatRemaining } from '../format'
import { getCaptureHealthWarning } from '../captureHealth'
import type { Category, Entry } from '../types'
import { useEntries } from '../EntriesContext'
import { useSharedBudgets } from '../sharedBudgets/SharedBudgetsContext'
import { entryNetAmount, isRefund } from '../shared/entryAmount'
import { entriesForCurrency, unconfiguredCurrencyCounts } from '../shared/currency'
import {
  currentSgtMonth,
  entriesForMonth as sharedEntriesForMonth,
  totalSpent as sharedTotalSpent,
} from '../sharedBudgets/memberTotals'

interface Props {
  onAddEntry: () => void
  onOpenAutomaticTracking: () => void
}
const COMMITTED_CATEGORIES: Category[] = ['savings', 'investments']
const COMMITTED_CATEGORY_SET = new Set<Category>(COMMITTED_CATEGORIES)

// Which collapsible spend list is open. 'uncategorized' is the triage bucket for entries
// (often auto-imported) that have no category yet — they have no budget line of their own.
// A key is any category id (built-in or custom) or the 'uncategorized' bucket.
type ExpandKey = string

function entrySort(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
}

export default function Dashboard({ onAddEntry, onOpenAutomaticTracking }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<ExpandKey | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [viewScope, setViewScope] = useState<'personal' | 'shared'>('personal')
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [requestedWalletCurrency, setRequestedWalletCurrency] = useState<string | null>(null)
  const now = sgtToday()
  const { entries: allEntries, removeEntry, sync, refresh } = useEntries()
  const shared = useSharedBudgets()
  const { openBudget } = shared
  const { config, customCategories, overrides, activeCurrency, currencies } = useBudgetConfig()
  const entries = entriesForCurrency(allEntries, activeCurrency)
  const categoryIds = allCategoryIds(customCategories)
  const budgets = categoryBudgets(config, customCategories)
  const labelFor = (id: string): string => categoryLabel(id, overrides, customCategories)
  const iconFor = (id: string): string => categoryIcon(id, overrides, customCategories)

  const currentMonthEntries = entriesForMonth(entries, now.getFullYear(), now.getMonth())
  // Triage bucket: this month's entries that still have no category (e.g. auto-imported
  // from an unknown payee). Shown in full — unlike category lists, we don't trim to the
  // last 2 weeks, since the whole point is to find and categorize every stray entry.
  const uncategorizedEntries = currentMonthEntries.filter(entry => entry.category == null).sort(entrySort)
  const uncategorizedTotal = uncategorizedEntries.reduce((sum, entry) => sum + entryNetAmount(entry), 0)
  const uncategorizedExpanded = expandedCategory === 'uncategorized'
  const todayDate = toLocalDateString(now)
  const captureHealthWarning = getCaptureHealthWarning(allEntries, todayDate)
  const unconfiguredCurrencies = Object.entries(unconfiguredCurrencyCounts(allEntries, currencies))
  const [unconfiguredCurrency, unconfiguredCount] = unconfiguredCurrencies[0] ?? []
  const recentExpenseStartDate = toLocalDateString(addDays(now, -14))
  const monthTotal = currentMonthEntries.reduce((sum, entry) => sum + entryNetAmount(entry), 0)
  const spend = monthlySpendByCategory(entries, now.getFullYear(), now.getMonth(), customCategories)
  const deficits = categoryDeficits(spend, config, customCategories)
  const buffer = bufferRemaining(deficits, config)
  const thisWeek = weeklyTotal(entries, now)
  const monthlyIncome = config.monthlyIncome
  const budgetUsedPct = monthlyIncome > 0
    ? Math.max(0, Math.min(100, (monthTotal / monthlyIncome) * 100))
    : monthTotal > 0
      ? 100
      : 0
  const spendableBudget = config.lunch + config.transport + config.buffer + customBudgetTotal(customCategories)
  const safePerDay = safeToSpendPerDay(
    entries,
    now.getFullYear(),
    now.getMonth(),
    spendableBudget,
    now,
    { excludedCategories: COMMITTED_CATEGORIES },
  ).amountPerDay

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const selectedSharedBudgetId =
    selectedBudgetId ?? shared.active?.budget.id ?? shared.budgets[0]?.id ?? null
  const selectedSharedBudget = shared.budgets.find(b => b.id === selectedSharedBudgetId) ?? null
  const activeSharedReady =
    selectedSharedBudgetId !== null && shared.active?.budget.id === selectedSharedBudgetId

  useEffect(() => {
    if (viewScope !== 'shared' || !selectedSharedBudgetId || activeSharedReady) return
    void openBudget(selectedSharedBudgetId).catch(() => {})
  }, [activeSharedReady, selectedSharedBudgetId, openBudget, viewScope])

  // The pass stack replaces the old Personal/Shared toggle: Personal plus every joined
  // shared budget are shown as a stack of cards, front-most first. Tapping a card behind
  // brings it forward (and, for a shared budget, triggers the openBudget load above).
  type PassItem = { kind: 'personal' } | { kind: 'shared'; id: string; name: string }

  const passItems: PassItem[] =
    shared.budgets.length === 0
      ? [{ kind: 'personal' }]
      : viewScope === 'personal'
        ? [{ kind: 'personal' }, ...shared.budgets.map(b => ({ kind: 'shared' as const, id: b.id, name: b.name }))]
        : [
            ...(selectedSharedBudget
              ? [{ kind: 'shared' as const, id: selectedSharedBudget.id, name: selectedSharedBudget.name }]
              : []),
            { kind: 'personal' as const },
            ...shared.budgets
              .filter(b => b.id !== selectedSharedBudgetId)
              .map(b => ({ kind: 'shared' as const, id: b.id, name: b.name })),
          ]

  function selectPass(item: PassItem) {
    setExpandedCategory(null)
    setConfirmingDeleteId(null)
    if (item.kind === 'personal') {
      setViewScope('personal')
    } else {
      setViewScope('shared')
      setSelectedBudgetId(item.id)
    }
  }

  // `amount` is money spent; `limit` is the ceiling it is spent against. The card leads with
  // what the user actually came to find out — how much is left — and keeps spent as support.
  // A shared budget with no ceiling has no "left", so it falls back to leading with spent.
  function passInfo(item: PassItem): Omit<BudgetPass, 'id'> {
    if (item.kind === 'personal') {
      return {
        title: 'Personal',
        subtitle: monthLabel,
        amount: monthTotal,
        limit: monthlyIncome,
        pct: budgetUsedPct,
        usageLabel: 'allocated',
        currency: activeCurrency,
      }
    }
    if (shared.active?.budget.id === item.id) {
      const month = currentSgtMonth()
      const monthEntries = sharedEntriesForMonth(shared.active.entries, month)
      const spent = sharedTotalSpent(monthEntries)
      const limit = shared.active.budget.monthlyLimit
      const pct = limit !== null && limit > 0 ? Math.min(100, (spent / limit) * 100) : spent > 0 ? 100 : 0
      return { title: item.name, subtitle: 'Shared', amount: spent, limit, pct, usageLabel: 'spent', currency: 'SGD' }
    }
    return { title: item.name, subtitle: 'Shared', amount: null, limit: null, pct: 0, usageLabel: 'spent' }
  }

  const budgetPasses: BudgetPass[] = passItems.map(item => ({
    id: item.kind === 'personal' ? 'personal' : item.id,
    ...passInfo(item),
  }))

  function selectPassById(id: string) {
    const item = passItems.find(candidate =>
      candidate.kind === 'personal' ? id === 'personal' : candidate.id === id,
    )
    if (item) selectPass(item)
  }

  function toggleCategory(category: ExpandKey) {
    setConfirmingDeleteId(null)
    setExpandedCategory(current => (current === category ? null : category))
  }

  // One expense row, shared by the category lists and the Uncategorized list. Shows an
  // inline delete confirm when this row's id is the one pending deletion.
  function renderExpenseRow(entry: Entry) {
    if (confirmingDeleteId === entry.id) {
      return (
        <div key={entry.id} className="category-expense-row category-expense-row--confirm">
          <span className="category-expense-confirm-text">Delete this entry?</span>
          <span className="category-expense-confirm-actions">
            <button
              type="button"
              className="expense-confirm-btn expense-confirm-btn--yes"
              aria-label="Confirm delete"
              onClick={() => {
                setConfirmingDeleteId(null)
                void removeEntry(entry.id)
              }}
            >
              <Check size={15} strokeWidth={3} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="expense-confirm-btn expense-confirm-btn--no"
              aria-label="Cancel delete"
              onClick={() => setConfirmingDeleteId(null)}
            >
              <X size={15} strokeWidth={3} aria-hidden="true" />
            </button>
          </span>
        </div>
      )
    }

    return (
      <div key={entry.id} className="category-expense-row">
        <span className="category-expense-main">
          <span className="category-expense-date">
            {format(fromLocalDateString(entry.date), 'EEE, MMM d')}
          </span>
          {entry.note && <span className="category-expense-note">{entry.note}</span>}
        </span>
        <span className="category-expense-trailing">
          <strong className={`category-expense-amount${isRefund(entry) ? ' entry-amount--refund' : ''}`}>
            {formatEntryAmount(entry)}
          </strong>
          <button
            type="button"
            className="expense-delete-btn"
            aria-label="Delete entry"
            onClick={() => setConfirmingDeleteId(entry.id)}
          >
            <Minus size={15} strokeWidth={3} aria-hidden="true" />
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className="screen dashboard theme-screen theme-screen--home">
      <header className="dashboard-header">
        <div>
          <h1 className="month-label"><span className="sr-only">Dashboard: </span>{monthLabel}</h1>
          <div className="income-label">{formatMoneyWhole(monthlyIncome, activeCurrency)} / month</div>
        </div>
        <CurrencyWalletMenu
          key={requestedWalletCurrency ?? 'wallet-menu'}
          entries={allEntries}
          requestedCurrency={requestedWalletCurrency}
          onRequestedCurrencyHandled={() => setRequestedWalletCurrency(null)}
        />
      </header>

      <SyncStatus sync={sync} onRetry={() => void refresh()} onBackup={downloadJsonBackup} />

      {viewScope === 'personal' && unconfiguredCurrency && unconfiguredCount && (
        <section className="unconfigured-currency-banner" role="status">
          <div>
            <strong>{unconfiguredCount} transaction{unconfiguredCount === 1 ? '' : 's'} in {unconfiguredCurrency}</strong>
            <p>These are safe, but not included in your {activeCurrency} budget.</p>
          </div>
          <button type="button" onClick={() => setRequestedWalletCurrency(unconfiguredCurrency)}>
            Create {unconfiguredCurrency} wallet
          </button>
        </section>
      )}

      {viewScope === 'personal' && captureHealthWarning && (
        <section
          className="capture-health-warning"
          role="status"
          aria-labelledby="capture-health-warning-title"
        >
          <AlertTriangle className="capture-health-warning__icon" aria-hidden="true" size={20} />
          <div className="capture-health-warning__copy">
            <h2 id="capture-health-warning-title">Automatic captures may have stopped</h2>
            <p>
              No automatic captures since{' '}
              <time dateTime={captureHealthWarning.lastCaptureDate}>
                {format(fromLocalDateString(captureHealthWarning.lastCaptureDate), 'MMM d')}
              </time>.
              {' '}Your Shortcut may need attention.
            </p>
          </div>
          <button type="button" onClick={onOpenAutomaticTracking}>
            <span>Check <span className="sr-only">Automatic Tracking</span></span>
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </section>
      )}

      <BudgetPassStack passes={budgetPasses} onSelect={selectPassById} />

      {viewScope === 'shared' && (
        <SharedBudgetDashboard
          selectedBudgetId={selectedSharedBudgetId}
          selectedBudgetName={selectedSharedBudget?.name ?? null}
        />
      )}

      {/* A brand-new user's dashboard is otherwise five rows of S$0.00 that they
          have no way to interpret. Give them the one action that makes the rest mean
          something, and show the budget breakdown once there is spending to break down. */}
      {viewScope === 'personal' && entries.length === 0 && (
        <section className="first-run" aria-labelledby="first-run-title">
          <h3 id="first-run-title" className="first-run__title">Log your first expense</h3>
          <p className="first-run__body">
            Your categories fill in as you spend. Nothing to set up first.
          </p>
          <button type="button" className="save-btn first-run__cta" onClick={onAddEntry}>
            Add an expense
          </button>
        </section>
      )}

      {viewScope === 'personal' && entries.length > 0 && (
        <>

      <section className="home-budget-overview" aria-label="Monthly budget overview">
        <BudgetUsageRing allocated={monthTotal} total={monthlyIncome} currency={activeCurrency} />
        <div className="home-budget-overview__copy">
          <span className="summary-label">Safe to spend today</span>
          <strong className="home-safe-amount">
            {formatMoney(Math.max(0, safePerDay), activeCurrency)}
          </strong>
          <span className="muted">{formatRemaining(buffer, activeCurrency)} in your Others budget</span>
        </div>
      </section>

      <h3 className="section-title">Categories</h3>
      {categoryIds.map(cat => {
        const spent = spend[cat]
        const deficit = deficits[cat]
        const budget = budgets[cat]
        const isFlexible = cat === 'others'
        const hasBudget = budget > 0
        const over = !isFlexible && hasBudget && deficit < 0
        const flexibleBudgetExhausted = isFlexible && buffer <= 0
        const committed = COMMITTED_CATEGORY_SET.has(cat as Category)
        const expanded = expandedCategory === cat
        const categoryEntries = currentMonthEntries
          .filter(
            entry =>
              entry.category === cat &&
              entry.date >= recentExpenseStartDate &&
              entry.date <= todayDate,
          )
          .sort(entrySort)
        const categoryLabel = labelFor(cat)
        const pct = isFlexible
          ? config.buffer > 0
            ? Math.max(0, Math.min(100, (spent / config.buffer) * 100))
            : 0
          : hasBudget
            ? Math.max(0, Math.min(100, (spent / budget) * 100))
            : 0
        const statusLabel = isFlexible
          ? formatRemaining(buffer, activeCurrency)
          : committed
            ? spent >= budget
              ? 'Committed'
              : `${formatMoney(deficit, activeCurrency)} to commit`
            : !hasBudget
              ? ''
              : formatRemaining(deficit, activeCurrency)

        return (
          <article
            key={cat}
            className={`card category-row-card ${committed ? 'category-row--committed' : ''}`}
          >
            <button
              type="button"
              className="category-row-toggle"
              onClick={() => toggleCategory(cat)}
              aria-expanded={expanded}
              aria-controls={`category-expenses-${cat}`}
            >
              <span className="cat-row-top">
                <span className="cat-name icon-label">
                  <BudgetIcon name={iconFor(cat)} />
                  {categoryLabel}
                </span>
                <span className="cat-row-right">
                  <span className="cat-spent-group">
                    <span className="cat-spent">{formatMoney(spent, activeCurrency)}</span>
                    {expanded ? (
                      <ChevronUp className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    ) : (
                      <ChevronDown className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    )}
                  </span>
                  <span
                    className={
                      over || flexibleBudgetExhausted
                        ? 'cat-status cat-status--over'
                        : committed
                          ? 'cat-status cat-status--committed'
                          : 'cat-status cat-status--ok'
                    }
                  >
                    {statusLabel}
                  </span>
                </span>
              </span>
              <span className="progress-bar" style={{ marginTop: 8 }}>
                <span
                  className="progress-fill"
                  style={{
                    width: `${pct}%`,
                    background: over || flexibleBudgetExhausted
                      ? 'var(--red)'
                      : isFlexible
                        ? 'var(--yellow)'
                        : committed
                          ? 'var(--blue)'
                          : 'var(--green)',
                  }}
                />
              </span>
              <span className="cat-row-bottom">
                <span className="muted">
                  {isFlexible
                    ? `Budget ${formatMoneyWhole(config.buffer, activeCurrency)}`
                    : hasBudget
                    ? `${committed ? 'Monthly commitment' : 'Budget'} ${formatMoneyWhole(budget, activeCurrency)}`
                    : 'No budget set'}
                </span>
                {over && <span className="over-note">Covered by flexible budget</span>}
              </span>
            </button>

            {expanded && (
              <div
                id={`category-expenses-${cat}`}
                className="category-expense-list"
                aria-label={`${categoryLabel} expenses`}
              >
                <div className="category-expense-header">
                  <span>{categoryLabel} Expenses</span>
                  <span>{categoryEntries.length} entr{categoryEntries.length === 1 ? 'y' : 'ies'}</span>
                </div>
                {categoryEntries.length === 0 ? (
                  <p className="category-expense-empty">
                    No {categoryLabel.toLowerCase()} entries in the past 2 weeks.
                  </p>
                ) : (
                  categoryEntries.map(renderExpenseRow)
                )}
              </div>
            )}
          </article>
        )
      })}

      {uncategorizedEntries.length > 0 && (
        <article className="card category-row-card">
          <button
            type="button"
            className="category-row-toggle"
            onClick={() => toggleCategory('uncategorized')}
            aria-expanded={uncategorizedExpanded}
            aria-controls="category-expenses-uncategorized"
          >
            <span className="cat-row-top">
              <span className="cat-name icon-label">
                <BudgetIcon name="uncategorized" />
                Uncategorized
              </span>
              <span className="cat-row-right">
                <span className="cat-spent-group">
                  <span className="cat-spent">{formatMoney(uncategorizedTotal, activeCurrency)}</span>
                  {uncategorizedExpanded ? (
                    <ChevronUp className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                  ) : (
                    <ChevronDown className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                  )}
                </span>
              </span>
            </span>
            <span className="cat-row-bottom">
              <span className="muted">
                {uncategorizedEntries.length} entr{uncategorizedEntries.length === 1 ? 'y' : 'ies'} to categorize in History
              </span>
            </span>
          </button>

          {uncategorizedExpanded && (
            <div
              id="category-expenses-uncategorized"
              className="category-expense-list"
              aria-label="Uncategorized expenses"
            >
              <div className="category-expense-header">
                <span>Uncategorized Expenses</span>
                <span>
                  {uncategorizedEntries.length} entr{uncategorizedEntries.length === 1 ? 'y' : 'ies'}
                </span>
              </div>
              {uncategorizedEntries.map(renderExpenseRow)}
            </div>
          )}
        </article>
      )}

      <div className="card week-strip">
        <span className="muted">This week</span>
        <span className="week-amount">{formatMoney(thisWeek, activeCurrency)}</span>
      </div>
        </>
      )}
    </div>
  )
}
