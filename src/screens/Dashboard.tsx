import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Minus, X } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from '../components/BudgetIcon'
import BudgetUsageRing from '../components/BudgetUsageRing'
import SyncStatus from '../components/SyncStatus'
import { downloadJsonBackup } from '../dataTransfer'
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
import { formatSGD, formatSGDWhole, formatRemaining } from '../format'
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
  onAddEntry: () => void
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

function sharedEntrySort(a: SharedEntry, b: SharedEntry): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

export default function Dashboard({ onAddEntry }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<ExpandKey | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [viewScope, setViewScope] = useState<'personal' | 'shared'>('personal')
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const now = new Date()
  const { entries, removeEntry, sync, refresh } = useEntries()
  const shared = useSharedBudgets()
  const { openBudget } = shared
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
  interface PassInfo {
    title: string
    subtitle: string
    amount: number | null
    limit: number | null
    pct: number
  }

  function passInfo(item: PassItem): PassInfo {
    if (item.kind === 'personal') {
      return { title: 'Personal', subtitle: monthLabel, amount: monthTotal, limit: monthlyIncome, pct: budgetUsedPct }
    }
    if (shared.active?.budget.id === item.id) {
      const month = currentSgtMonth()
      const monthEntries = sharedEntriesForMonth(shared.active.entries, month)
      const spent = sharedTotalSpent(monthEntries)
      const limit = shared.active.budget.monthlyLimit
      const pct = limit !== null && limit > 0 ? Math.min(100, (spent / limit) * 100) : spent > 0 ? 100 : 0
      return { title: item.name, subtitle: 'Shared', amount: spent, limit, pct }
    }
    return { title: item.name, subtitle: 'Shared', amount: null, limit: null, pct: 0 }
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
          <strong className="category-expense-amount">{formatSGD(entry.amount)}</strong>
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
          <div className="income-label">{formatSGDWhole(monthlyIncome)} / month</div>
        </div>
      </header>

      <SyncStatus sync={sync} onRetry={() => void refresh()} onBackup={downloadJsonBackup} />

      <div className="pass-stack" style={{ height: `${168 + (passItems.length - 1) * 22}px` }}>
        {passItems.map((item, depth) => {
          const info = passInfo(item)
          const key = item.kind === 'personal' ? 'personal' : item.id
          const loaded = info.amount !== null
          const capped = loaded && info.limit !== null && info.limit > 0
          const remaining = capped ? info.limit! - info.amount! : null
          const overspent = remaining !== null && remaining < 0

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
              {!loaded ? (
                <div className="pass-amt">Tap to open</div>
              ) : capped ? (
                <>
                  <div className="pass-amt-label">{overspent ? 'Over budget by' : 'Left to spend'}</div>
                  <div className={`pass-amt ${overspent ? 'pass-amt--over' : ''}`}>
                    {formatSGDWhole(Math.abs(remaining!))}
                  </div>
                </>
              ) : (
                <>
                  <div className="pass-amt-label">Spent this month</div>
                  <div className="pass-amt">{formatSGDWhole(info.amount!)}</div>
                </>
              )}
              <div className="progress-bar pass-bar">
                <div
                  className="progress-fill"
                  style={overspent ? { width: '100%', background: 'var(--red)' } : { width: `${info.pct}%` }}
                />
              </div>
              {capped && (
                <div className="pass-meta">
                  {formatSGDWhole(info.amount!)} of {formatSGDWhole(info.limit!)} spent
                </div>
              )}
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

      {/* A brand-new user's dashboard is otherwise five rows of S$0.00 and a buffer they
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
        <BudgetUsageRing spent={monthTotal} total={monthlyIncome} />
        <div className="home-budget-overview__copy">
          <span className="summary-label">Safe to spend today</span>
          <strong className="home-safe-amount">
            {formatSGD(Math.max(0, safePerDay))}
          </strong>
          <span className="muted">{formatRemaining(buffer)} in your monthly buffer</span>
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
            {formatRemaining(buffer)}
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
            {formatSGD(totalOverage)} used by others and overages
          </p>
        )}
      </div>

      <h3 className="section-title">Categories</h3>
      {categoryIds.map(cat => {
        const spent = spend[cat]
        const deficit = deficits[cat]
        const budget = budgets[cat]
        const usesBuffer = cat === 'others'
        const hasBudget = budget > 0
        const over = !usesBuffer && hasBudget && deficit < 0
        const bufferExhausted = usesBuffer && buffer <= 0
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
        const pct = usesBuffer
          ? config.buffer > 0
            ? Math.min(100, (spent / config.buffer) * 100)
            : 0
          : hasBudget
            ? Math.min(100, (spent / budget) * 100)
            : 0
        const statusLabel = usesBuffer
          ? 'spent from Buffer'
          : committed
            ? spent >= budget
              ? 'Committed'
              : `${formatSGD(deficit)} to commit`
            : !hasBudget
              ? ''
              : formatRemaining(deficit)

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
                    <span className="cat-spent">{formatSGD(spent)}</span>
                    {expanded ? (
                      <ChevronUp className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    ) : (
                      <ChevronDown className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    )}
                  </span>
                  <span
                    className={
                      over || bufferExhausted
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
                    background: over || bufferExhausted
                      ? 'var(--red)'
                      : usesBuffer
                        ? 'var(--yellow)'
                        : committed
                          ? 'var(--blue)'
                          : 'var(--green)',
                  }}
                />
              </span>
              <span className="cat-row-bottom">
                <span className="muted">
                  {usesBuffer
                    ? 'Uses monthly Buffer'
                    : hasBudget
                    ? `${committed ? 'Monthly commitment' : 'Budget'} ${formatSGDWhole(budget)}`
                    : 'No budget set'}
                </span>
                {over && <span className="over-note">Taken from buffer</span>}
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
                  <span className="cat-spent">{formatSGD(uncategorizedTotal)}</span>
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
        <span className="week-amount">{formatSGD(thisWeek)}</span>
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
              {formatSGD(spent)}
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
              ? `${formatSGD(spent)} of ${formatSGD(budget.monthlyLimit)}`
              : 'No monthly limit set'}
          </span>
        </div>
      </div>

      <h3 className="section-title">Members</h3>
      <div className="ios-list">
        {memberTotals.map(total => (
          <div key={total.userId} className="settings-row">
            <span className="settings-label">{total.displayName}</span>
            <strong>{formatSGD(total.total)}</strong>
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
                    ? `${formatSGD(categorySpent)} / ${formatSGD(category.budgetAmount!)}`
                    : formatSGD(categorySpent)}
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
              <strong>{formatSGD(entry.amount)}</strong>
            </div>
          ))
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
