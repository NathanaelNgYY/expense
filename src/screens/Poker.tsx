import { useState } from 'react'
import { getPokerSessions } from '../storage'
import {
  hourlyRate,
  sessionDurationHours,
  sessionPnl,
  totalHours,
  totalPnl,
} from '../pokerCompute'
import { formatStakesLabel } from '../pokerDisplay'
import LogSession from './LogSession'

function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatSignedCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}S$${Math.abs(value).toFixed(2)}`
}

export default function Poker() {
  const [showLog, setShowLog] = useState(false)

  if (showLog) {
    return <LogSession onSave={() => setShowLog(false)} onBack={() => setShowLog(false)} />
  }

  const sessions = getPokerSessions()
  const pnl = totalPnl(sessions)
  const hours = totalHours(sessions)
  const rate = hourlyRate(sessions)

  const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--red)'
  const rateColor = (rate ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'

  const sorted = [...sessions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime),
  )

  return (
    <div className="screen poker">
      <p className="screen-title">Poker</p>

      <div className="card poker-stats-card">
        <div className="poker-stats-row">
          <div className="poker-stat">
            <span className="summary-label">Total P&amp;L</span>
            <strong className="poker-pnl" style={{ color: pnlColor }}>
              {formatSignedCurrency(pnl)}
            </strong>
          </div>
          <div className="poker-stat poker-stat--right">
            <span className="summary-label">Hourly rate</span>
            <strong className="poker-pnl" style={{ color: rateColor }}>
              {rate !== null ? `${formatSignedCurrency(rate)}/hr` : '-'}
            </strong>
          </div>
        </div>
        <p className="muted poker-hours-note">
          {hours > 0 ? `${formatDuration(hours)} played | ` : ''}
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>

      <h3 className="section-title">Sessions</h3>

      {sorted.length === 0 ? (
        <div className="empty-state">No sessions yet. Tap Log Session to start.</div>
      ) : (
        <div className="entry-list">
          {sorted.map(s => {
            const pl = sessionPnl(s)
            const dur = sessionDurationHours(s.startTime, s.endTime)
            const dateLabel = new Date(s.date + 'T00:00').toLocaleDateString('default', {
              month: 'short',
              day: 'numeric',
            })

            return (
              <div key={s.id} className="entry-row">
                <div className="entry-main">
                  <span className="entry-category">{formatStakesLabel(s.stakes)}</span>
                  <span className="entry-date">
                    {dateLabel} | {formatDuration(dur)} | Buy-in S${s.buyIn}
                  </span>
                </div>
                <span
                  className="entry-amount"
                  style={{ color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}
                >
                  {formatSignedCurrency(pl)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <button className="save-btn poker-log-btn" type="button" onClick={() => setShowLog(true)}>
        Log Session
      </button>
    </div>
  )
}
