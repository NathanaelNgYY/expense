import { format } from 'date-fns'
import BudgetIcon from '../BudgetIcon'
import { fromLocalDateString } from '../../dates'
import { formatSGD } from '../../format'
import { useSharedBudgets } from '../../sharedBudgets/SharedBudgetsContext'
import {
  computeMemberTotals,
  currentSgtMonth,
  entriesForMonth,
  totalSpent,
} from '../../sharedBudgets/memberTotals'
import type { SharedEntry } from '../../sharedBudgets/types'

function sharedEntrySort(a: SharedEntry, b: SharedEntry): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

interface Props {
  selectedBudgetId: string | null
  selectedBudgetName: string | null
}

export default function SharedBudgetDashboard({ selectedBudgetId, selectedBudgetName }: Props) {
  const { budgets, active, error } = useSharedBudgets()

  if (budgets.length === 0) {
    return <p className="muted">Create or join a shared budget from the Shared tab.</p>
  }

  if (!selectedBudgetId || !active || active.budget.id !== selectedBudgetId) {
    return <p className="muted">Loading {selectedBudgetName ?? 'shared budget'}...</p>
  }

  const { budget, entries, categories, members } = active
  const monthEntries = entriesForMonth(entries, currentSgtMonth())
  const spent = totalSpent(monthEntries)
  const pct =
    budget.monthlyLimit !== null && budget.monthlyLimit > 0
      ? Math.min(100, (spent / budget.monthlyLimit) * 100)
      : spent > 0
        ? 100
        : 0
  const memberTotals = computeMemberTotals(monthEntries, members)
  const nameOf = new Map(members.map(member => [member.userId, member.displayName]))

  return (
    <div className="shared-dashboard">
      <div className="card summary-card">
        <div className="summary-card-top">
          <div>
            <span className="summary-label">{budget.name}</span>
            <strong className="summary-amount summary-amount--large">{formatSGD(spent)}</strong>
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
            const categorySpent = totalSpent(categoryEntries)
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
