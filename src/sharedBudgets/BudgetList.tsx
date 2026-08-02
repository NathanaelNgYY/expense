import { ChevronRight, Users } from 'lucide-react'
import { useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import { formatSGD } from '../format'
import CreateBudgetScreen from './CreateBudgetScreen'
import InviteScreen from './InviteScreen'
import JoinBudgetScreen from './JoinBudgetScreen'
import { useSharedBudgets } from './SharedBudgetsContext'
import type { SharedBudget } from './types'

/** list -> create -> invite, and list -> join, mirroring the Settings hub's
 *  pushed-subscreen model. The list never shares the screen with a form, so it
 *  stays readable at any number of budgets. */
type View =
  | { name: 'list' }
  | { name: 'create' }
  | { name: 'join' }
  | { name: 'invite'; budget: SharedBudget }

function memberSummary(budget: SharedBudget): string | null {
  const count = budget.memberCount
  if (count === undefined) return null
  return count === 1 ? 'Just you' : `${count} people`
}

export default function BudgetList() {
  const { budgets, error, openBudget, signOut } = useSharedBudgets()
  const confirm = useConfirm()
  const [view, setView] = useState<View>({ name: 'list' })

  async function handleSignOut() {
    if (
      !(await confirm({
        title: 'Sign out of shared budgets?',
        message: 'Your own entries stay on this device. You can sign back in any time.',
        confirmLabel: 'Sign out',
        destructive: true,
      }))
    )
      return
    void signOut()
  }

  if (view.name === 'create') {
    return (
      <CreateBudgetScreen
        onCancel={() => setView({ name: 'list' })}
        onCreated={budget => setView({ name: 'invite', budget })}
      />
    )
  }

  if (view.name === 'join') {
    return (
      <JoinBudgetScreen
        onCancel={() => setView({ name: 'list' })}
        onJoined={budget => void openBudget(budget.id)}
      />
    )
  }

  if (view.name === 'invite') {
    return (
      <InviteScreen
        budget={view.budget}
        onDone={() => setView({ name: 'list' })}
        onOpen={() => void openBudget(view.budget.id)}
      />
    )
  }

  return (
    <div className="screen shared-list">
      <p className="screen-title">SHARED BUDGETS</p>

      {budgets.length === 0 ? (
        <div className="shared-empty">
          <span className="shared-empty-mark" aria-hidden="true">
            <Users size={22} strokeWidth={1.8} />
          </span>
          <h2 className="shared-empty-title">Split a budget</h2>
          <p className="shared-empty-body">
            Track spending with someone else. Anyone you share the code with can add entries and
            see the running total.
          </p>
        </div>
      ) : (
        <div className="shared-budget-cards">
          {budgets.map(b => {
            const members = memberSummary(b)
            return (
              <button
                key={b.id}
                type="button"
                className="shared-budget-card"
                onClick={() => void openBudget(b.id)}
              >
                <Users className="ui-icon" aria-hidden="true" />
                <span className="shared-budget-text">
                  <span className="shared-budget-name">{b.name}</span>
                  <span className="shared-budget-meta muted">
                    {b.monthlyLimit !== null ? `${formatSGD(b.monthlyLimit)}/mo` : 'No limit'}
                    {members ? ` · ${members}` : ''}
                  </span>
                </span>
                <ChevronRight className="shared-budget-chevron" aria-hidden="true" size={18} />
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="shared-pinned-action shared-action-stack">
        <button type="button" className="save-btn" onClick={() => setView({ name: 'create' })}>
          Create a shared budget
        </button>
        <button type="button" className="export-btn" onClick={() => setView({ name: 'join' })}>
          Join with a code
        </button>
      </div>

      <button
        type="button"
        className="link-btn shared-signout"
        onClick={() => void handleSignOut()}
      >
        Sign out
      </button>
    </div>
  )
}
