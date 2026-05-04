// src/screens/Dashboard.tsx
import { getEntries, getBudgetConfig } from '../storage'
import {
  monthlySpendByCategory,
  categoryDeficits,
  bufferRemaining,
  weeklyTotal,
} from '../compute'
import { CATEGORY_LABELS, CATEGORIES } from '../types'

interface Props {
  onSettings: () => void
}

export default function Dashboard({ onSettings }: Props) {
  const now = new Date()
  const entries = getEntries()
  const config = getBudgetConfig()

  const spend = monthlySpendByCategory(entries, now.getFullYear(), now.getMonth())
  const deficits = categoryDeficits(spend, config)
  const buffer = bufferRemaining(deficits, config)
  const thisWeek = weeklyTotal(entries, now)

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalOverage = config.buffer - buffer

  return (
    <div className="screen dashboard">
      <header className="dashboard-header">
        <div>
          <div className="month-label">{monthLabel}</div>
          <div className="income-label muted">S$1,200 / month</div>
        </div>
        <button className="settings-icon-btn" onClick={onSettings} aria-label="Settings">
          ⚙️
        </button>
      </header>

      {/* Buffer card */}
      <div className={`card buffer-card ${buffer <= 0 ? 'buffer-card--danger' : ''}`}>
        <div className="buffer-row">
          <span className="buffer-title">🎯 Buffer</span>
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
            S${totalOverage.toFixed(2)} absorbed in overages
          </p>
        )}
      </div>

      {/* Category rows */}
      {CATEGORIES.map(cat => {
        const spent = spend[cat]
        const deficit = deficits[cat]
        const over = deficit < 0
        const pct = Math.min(100, (spent / config[cat]) * 100)

        return (
          <div key={cat} className="card category-row">
            <div className="cat-row-top">
              <span>{CATEGORY_LABELS[cat]}</span>
              <div className="cat-row-right">
                <span className="cat-spent">S${spent.toFixed(2)}</span>
                <span style={{ color: over ? 'var(--red)' : 'var(--green)', fontSize: 11 }}>
                  {over
                    ? ` +S$${Math.abs(deficit).toFixed(2)} over`
                    : ` S$${deficit.toFixed(2)} left`}
                </span>
              </div>
            </div>
            <div className="progress-bar" style={{ marginTop: 8 }}>
              <div
                className="progress-fill"
                style={{ width: `${pct}%`, background: over ? 'var(--red)' : 'var(--green)' }}
              />
            </div>
            {over && <p className="over-note muted">→ taken from buffer</p>}
          </div>
        )
      })}

      {/* This week strip */}
      <div className="card week-strip">
        <span className="muted">This week</span>
        <span className="week-amount">S${thisWeek.toFixed(2)}</span>
      </div>
    </div>
  )
}
