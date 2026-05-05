import { Settings as SettingsIcon } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import { getBudgetConfig, getEntries } from '../storage'
import {
  bufferRemaining,
  categoryDeficits,
  entriesForMonth,
  monthlySpendByCategory,
  weeklyTotal,
} from '../compute'
import { CATEGORY_LABELS, CATEGORIES } from '../types'

interface Props {
  onSettings: () => void
}

const MONTHLY_INCOME = 1200

export default function Dashboard({ onSettings }: Props) {
  const now = new Date()
  const entries = getEntries()
  const config = getBudgetConfig()

  const currentMonthEntries = entriesForMonth(entries, now.getFullYear(), now.getMonth())
  const monthTotal = currentMonthEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const spend = monthlySpendByCategory(entries, now.getFullYear(), now.getMonth())
  const deficits = categoryDeficits(spend, config)
  const buffer = bufferRemaining(deficits, config)
  const thisWeek = weeklyTotal(entries, now)
  const budgetUsedPct = Math.min(100, (monthTotal / MONTHLY_INCOME) * 100)

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalOverage = config.buffer - buffer

  return (
    <div className="screen dashboard">
      <header className="dashboard-header">
        <div>
          <div className="month-label">{monthLabel}</div>
          <div className="income-label">S$1,200 / month</div>
        </div>
        <button className="settings-icon-btn" type="button" onClick={onSettings} aria-label="Settings">
          <SettingsIcon aria-hidden="true" size={19} strokeWidth={2} />
        </button>
      </header>

      <div className="card summary-card">
        <div className="summary-card-top">
          <div>
            <span className="summary-label">Spent this month</span>
            <strong className="summary-amount summary-amount--large">S${monthTotal.toFixed(2)}</strong>
          </div>
          <div className="summary-pill">{currentMonthEntries.length} entries</div>
        </div>
        <div className="progress-bar" aria-hidden="true">
          <div
            className="progress-fill"
            style={{
              width: `${budgetUsedPct}%`,
              background: monthTotal > MONTHLY_INCOME ? 'var(--red)' : 'var(--green)',
            }}
          />
        </div>
        <div className="summary-card-bottom">
          <span className="muted">Monthly income</span>
          <strong>S${MONTHLY_INCOME.toFixed(0)}</strong>
        </div>
      </div>

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
            S${totalOverage.toFixed(2)} absorbed from category overages
          </p>
        )}
      </div>

      <h3 className="section-title">Categories</h3>
      {CATEGORIES.map(cat => {
        const spent = spend[cat]
        const deficit = deficits[cat]
        const over = deficit < 0
        const pct = config[cat] > 0 ? Math.min(100, (spent / config[cat]) * 100) : spent > 0 ? 100 : 0

        return (
          <div key={cat} className="card category-row">
            <div className="cat-row-top">
              <span className="cat-name icon-label">
                <BudgetIcon name={cat} />
                {CATEGORY_LABELS[cat]}
              </span>
              <div className="cat-row-right">
                <span className="cat-spent">S${spent.toFixed(2)}</span>
                <span className={over ? 'cat-status cat-status--over' : 'cat-status cat-status--ok'}>
                  {over
                    ? `S$${Math.abs(deficit).toFixed(2)} over`
                    : `S$${deficit.toFixed(2)} left`}
                </span>
              </div>
            </div>
            <div className="progress-bar" style={{ marginTop: 8 }}>
              <div
                className="progress-fill"
                style={{ width: `${pct}%`, background: over ? 'var(--red)' : 'var(--green)' }}
              />
            </div>
            <div className="cat-row-bottom">
              <span className="muted">Budget S${config[cat]}</span>
              {over && <span className="over-note">Taken from buffer</span>}
            </div>
          </div>
        )
      })}

      <div className="card week-strip">
        <span className="muted">This week</span>
        <span className="week-amount">S${thisWeek.toFixed(2)}</span>
      </div>
    </div>
  )
}
