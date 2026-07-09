import { useEffect, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, ChevronUp, Minus, Settings as SettingsIcon, X } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from '../components/BudgetIcon'
import BudgetUsageRing from '../components/BudgetUsageRing'
import { getBudgetConfig, getCustomCategories, getCategoryOverrides } from '../storage'
import { categoryIcon, categoryLabel } from '../categoryDisplay'
import {
  bufferRemaining,
  categoryDeficits,
  entriesForMonth,
  monthlySpendByCategory,
  weeklyTotal,
  allCategoryIds,
  categoryBudgets,
  safeToSpendPerDay,
} from '../compute'
import { addDays, fromLocalDateString, toLocalDateString } from '../dates'
import type { Category, Entry } from '../types'
import { useEntries } from '../EntriesContext'
import { useSharedBudgets } from '../sharedBudgets/SharedBudgetsContext'
import {
  computeMemberTotals,
  currentSgtMonth,
  entriesForMonth as sharedEntriesForMonth,
  totalSpent as sharedTotalSpent,
} from '../sharedBudgets/memberTotals'
import type { SharedEntry } from '../sharedBudgets/types'

interface Props {
  onSettings: () => void
}

const COMMITTED_CATEGORIES: Category[] = ['savings', 'investments']
const COMMITTED_CATEGORY_SET = new Set<Category>(COMMITTED_CATEGORIES)

// Which collapsible spend list is open. 'uncategorized' is the triage bucket for entries
// (often auto-imported) that have no category yet — they have no budget line of their own.
// A key is any category id (built-in or custom) or the 'uncategorized' bucket.
type ExpandKey = string

function formatWholeCurrency(value: number): string {
  return `S$${value.toLocaleString('en-SG', { maximumFractionDigits: 0 })}`
}

function entrySort(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
}

function sharedEntrySort(a: SharedEntry, b: SharedEntry): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

export default function Dashboard({ onSettings }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<ExpandKey | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [viewScope, setViewScope] = useState<'personal' | 'shared'>('personal')
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const now = new Date()
  const { entries, removeEntry } = useEntries()
  const shared = useSharedBudgets()
  const config = getBudgetConfig()
  const customCategories = getCustomCategories()
  const overrides = getCategoryOverrides()
  const categoryIds = allCategoryIds(customCategories)
  const budgets = categoryBudgets(config, customCategories)
  const labelFor = (id: string): string => categoryLabel(id, overrides, customCategories)
  const iconFor = (id: string): string => categoryIcon(id, overrides, customCategories)

  const currentMonthEntries = entriesForMonth(entries, now.getFullYear(), now.getMonth())
  // Triage bucket: this month's entries that still have no category (e.g. auto-imported
  // from an unknown payee). Shown in full — unlike category lists, we don't trim to the
  // last 2 weeks, since the whole point is to find and categorize every stray entry.
  const uncategorizedEntries = currentMonthEntries.filter(entry => entry.category == null).sort(entrySort)
  const uncategorizedTotal = uncategorizedEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const uncategorizedExpanded = expandedCategory === 'uncategorized'
  const todayDate = toLocalDateString(now)
  const recentExpenseStartDate = toLocalDateString(addDays(now, -14))
  const monthTotal = currentMonthEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const spend = monthlySpendByCategory(entries, now.getFullYear(), now.getMonth(), customCategories)
  const deficits = categoryDeficits(spend, config, customCategories)
  const buffer = bufferRemaining(deficits, config)
  const thisWeek = weeklyTotal(entries, now)
  const monthlyIncome = config.monthlyIncome
  const budgetUsedPct = monthlyIncome > 0 ? Math.min(100, (monthTotal / monthlyIncome) * 100) : monthTotal > 0 ? 100 : 0
  const safePerDay = safeToSpendPerDay(
    entries,
    now.getFullYear(),
    now.getMonth(),
    monthlyIncome,
    now,
  ).amountPerDay

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalOverage = config.buffer - buffer
  const selectedSharedBudgetId =
    selectedBudgetId ?? shared.active?.budget.id ?? shared.budgets[0]?.id ?? null
  const selectedSharedBudget = shared.budgets.find(b => b.id === selectedSharedBudgetId) ?? null
  const activeSharedReady =
    selectedSharedBudgetId !== null && shared.active?.budget.id === selectedSharedBudgetId

  useEffect(() => {
    if (viewScope !== 'shared' || !selectedSharedBudgetId || activeSharedReady) return
    void shared.openBudget(selectedSharedBudgetId).catch(() => {})
  }, [activeSharedReady, selectedSharedBudgetId, shared.openBudget, viewScope])

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

  function passInfo(item: PassItem): { title: string; subtitle: string; amount: number | null; pct: number } {
    if (item.kind === 'personal') {
      return { title: 'Personal', subtitle: monthLabel, amount: monthTotal, pct: budgetUsedPct }
    }
    if (shared.active?.budget.id === item.id) {
      const month = currentSgtMonth()
      const monthEntries = sharedEntriesForMonth(shared.active.entries, month)
      const spent = sharedTotalSpent(monthEntries)
      const limit = shared.active.budget.monthlyLimit
      const pct = limit !== null && limit > 0 ? Math.min(100, (spent / limit) * 100) : spent > 0 ? 100 : 0
      return { title: item.name, subtitle: 'Shared', amount: spent, pct }
    }
    return { title: item.name, subtitle: 'Shared', amount: null, pct: 0 }
  }

  function toggleCategory(category: ExpandKey) {
    setConfirmingDeleteId(null)
    setExpandedCategory(current => (current === category ? null : category))
  }

  function handleCategoryKeyDown(event: KeyboardEvent<HTMLDivElement>, category: ExpandKey) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    toggleCategory(category)
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
          <strong className="category-expense-amount">S${entry.amount.toFixed(2)}</strong>
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
          <div className="month-label">{monthLabel}</div>
          <div className="income-label">{formatWholeCurrency(monthlyIncome)} / month</div>
        </div>
        <button className="settings-icon-btn" type="button" onClick={onSettings} aria-label="Settings">
          <SettingsIcon aria-hidden="true" size={19} strokeWidth={2} />
        </button>
      </header>

      <div className="pass-stack" style={{ height: `${132 + (passItems.length - 1) * 22}px` }}>
        {passItems.map((item, depth) => {
          const info = passInfo(item)
          const key = item.kind === 'personal' ? 'personal' : item.id

          return (
            <div
              key={key}
              className="pass"
              style={{
                transform: `translateY(${depth * 22}px) scale(${1 - depth * 0.04})`,
                opacity: depth === 0 ? 1 : 1 - depth * 0.25,
                zIndex: passItems.length - depth,
              }}
            >
              <div className="pass-title">{info.title}</div>
              <div className="pass-subtitle">{info.subtitle}</div>
              <div className="pass-amt">
                {info.amount !== null ? formatWholeCurrency(info.amount) : 'Tap to open'}
              </div>
              <div className="progress-bar pass-bar">
                <div className="progress-fill" style={{ width: `${info.pct}%` }} />
              </div>
              {depth !== 0 && (
                <button
                  type="button"
                  className="pass-tap-veil"
                  onClick={() => selectPass(item)}
                  aria-label={`Switch to ${info.title}`}
                />
              )}
            </div>
          )
        })}
      </div>
      {passItems.length > 1 && <p className="stack-hint muted">tap a card behind to bring it forward</p>}

      {viewScope === 'shared' && (
        <SharedBudgetDashboard
          selectedBudgetId={selectedSharedBudgetId}
          selectedBudgetName={selectedSharedBudget?.name ?? null}
        />
      )}

      {viewScope === 'personal' && (
        <>

      <section className="home-budget-overview" aria-label="Monthly budget overview">
        <BudgetUsageRing spent={monthTotal} total={monthlyIncome} />
        <div className="home-budget-overview__copy">
          <span className="summary-label">Safe to spend today</span>
          <strong className="home-safe-amount">
            S${Math.max(0, safePerDay).toFixed(2)}
          </strong>
          <span className="muted">S${buffer.toFixed(2)} remains in your monthly buffer</span>
        </div>
      </section>

      <div className={`card buffer-card ${buffer <= 0 ? 'buffer-card--danger' : ''}`}>
        <div className="buffer-row">
          <span className="buffer-title icon-label">
            <BudgetIcon name="buffer" />
            Buffer
          </span>
          <span
            className="buffer-amount"
            style={{ color: buffer <= 0 ? 'var(--red)' : 'var(--yellow)' }}
          >
            S${buffer.toFixed(2)} left
          </span>
        </div>
        <div className="progress-bar" style={{ marginTop: 8 }}>
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(100, Math.max(0, (buffer / config.buffer) * 100))}%`,
              background: buffer <= 0 ? 'var(--red)' : 'var(--yellow)',
            }}
          />
        </div>
        {totalOverage > 0 && (
          <p className="buffer-sub muted">
            S${totalOverage.toFixed(2)} used by others and overages
          </p>
        )}
      </div>

      <h3 className="section-title">Categories</h3>
      {categoryIds.map(cat => {
        const spent = spend[cat]
        const deficit = deficits[cat]
        const budget = budgets[cat]
        const hasBudget = budget > 0
        const over = hasBudget && deficit < 0
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
        const pct = hasBudget ? Math.min(100, (spent / budget) * 100) : 0
        const statusLabel = committed
          ? spent >= budget
            ? 'Committed'
            : `S$${deficit.toFixed(2)} to commit`
          : !hasBudget
            ? ''
            : over
              ? `S$${Math.abs(deficit).toFixed(2)} over`
              : `S$${deficit.toFixed(2)} left`

        return (
          <article
            key={cat}
            className={`card category-row-card ${committed ? 'category-row--committed' : ''}`}
          >
            <div
              role="button"
              tabIndex={0}
              className="category-row-toggle"
              onClick={() => toggleCategory(cat)}
              onKeyDown={event => handleCategoryKeyDown(event, cat)}
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
                    <span className="cat-spent">S${spent.toFixed(2)}</span>
                    {expanded ? (
                      <ChevronUp className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    ) : (
                      <ChevronDown className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    )}
                  </span>
                  <span
                    className={
                      over
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
                    background: over ? 'var(--red)' : committed ? 'var(--blue)' : 'var(--green)',
                  }}
                />
              </span>
              <span className="cat-row-bottom">
                <span className="muted">
                  {hasBudget ? `${committed ? 'Monthly commitment' : 'Budget'} S$${budget}` : 'No budget set'}
                </span>
                {over && <span className="over-note">Taken from buffer</span>}
              </span>
            </div>

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
          <div
            role="button"
            tabIndex={0}
            className="category-row-toggle"
            onClick={() => toggleCategory('uncategorized')}
            onKeyDown={event => handleCategoryKeyDown(event, 'uncategorized')}
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
                  <span className="cat-spent">S${uncategorizedTotal.toFixed(2)}</span>
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
          </div>

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
        <span className="week-amount">S${thisWeek.toFixed(2)}</span>
      </div>
        </>
      )}
    </div>
  )
}

function SharedBudgetDashboard({
  selectedBudgetId,
  selectedBudgetName,
}: {
  selectedBudgetId: string | null
  selectedBudgetName: string | null
}) {
  const { budgets, active, error } = useSharedBudgets()

  if (budgets.length === 0) {
    return <p className="muted">Create or join a shared budget from the Shared tab.</p>
  }

  if (!selectedBudgetId || !active || active.budget.id !== selectedBudgetId) {
    return <p className="muted">Loading {selectedBudgetName ?? 'shared budget'}...</p>
  }

  const { budget, entries, categories, members } = active
  const month = currentSgtMonth()
  const monthEntries = sharedEntriesForMonth(entries, month)
  const spent = sharedTotalSpent(monthEntries)
  const pct =
    budget.monthlyLimit !== null && budget.monthlyLimit > 0
      ? Math.min(100, (spent / budget.monthlyLimit) * 100)
      : spent > 0
        ? 100
        : 0
  const memberTotals = computeMemberTotals(monthEntries, members)
  const nameOf = new Map(members.map(m => [m.userId, m.displayName]))

  return (
    <div className="shared-dashboard">
      <div className="card summary-card">
        <div className="summary-card-top">
          <div>
            <span className="summary-label">{budget.name}</span>
            <strong className="summary-amount summary-amount--large">
              S${spent.toFixed(2)}
            </strong>
          </div>
          <div className="summary-pill">{monthEntries.length} entries</div>
        </div>
        <div className="progress-bar" aria-hidden="true">
          <div
            className="progress-fill"
            style={{
              width: `${pct}%`,
              background:
                budget.monthlyLimit !== null && spent > budget.monthlyLimit
                  ? 'var(--red)'
                  : 'var(--green)',
            }}
          />
        </div>
        <div className="summary-card-bottom">
          <span className="muted">
            {budget.monthlyLimit !== null
              ? `S$${spent.toFixed(2)} of S$${budget.monthlyLimit.toFixed(2)}`
              : 'No monthly limit set'}
          </span>
        </div>
      </div>

      <h3 className="section-title">Members</h3>
      <div className="ios-list">
        {memberTotals.map(total => (
          <div key={total.userId} className="settings-row">
            <span className="settings-label">{total.displayName}</span>
            <strong>S${total.total.toFixed(2)}</strong>
          </div>
        ))}
      </div>

      <h3 className="section-title">Categories</h3>
      {categories.length === 0 ? (
        <p className="muted">No shared categories yet. Add them from Settings.</p>
      ) : (
        <div className="ios-list">
          {categories.map(category => {
            const categoryEntries = monthEntries.filter(entry => entry.categoryId === category.id)
            const categorySpent = sharedTotalSpent(categoryEntries)
            const hasBudget = category.budgetAmount !== null && category.budgetAmount > 0
            const over = hasBudget && categorySpent > category.budgetAmount!
            return (
              <div key={category.id} className="settings-row shared-category-summary-row">
                <span className="settings-label icon-label">
                  <BudgetIcon name={category.icon} />
                  {category.label}
                </span>
                <span className={over ? 'cat-status cat-status--over' : 'cat-status cat-status--ok'}>
                  {hasBudget
                    ? `S$${categorySpent.toFixed(2)} / S$${category.budgetAmount!.toFixed(2)}`
                    : `S$${categorySpent.toFixed(2)}`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <h3 className="section-title">Entries</h3>
      <div className="shared-entries">
        {monthEntries.length === 0 ? (
          <p className="muted">No shared expenses this month.</p>
        ) : (
          monthEntries.sort(sharedEntrySort).map(entry => (
            <div key={entry.id} className="shared-entry-row">
              <div className="shared-entry-main">
                <span>{entry.note || 'No note'}</span>
                <span className="muted">
                  {nameOf.get(entry.userId) ?? 'Former member'} -{' '}
                  {format(fromLocalDateString(entry.date), 'EEE, MMM d')}
                </span>
              </div>
              <strong>S${entry.amount.toFixed(2)}</strong>
            </div>
          ))
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
