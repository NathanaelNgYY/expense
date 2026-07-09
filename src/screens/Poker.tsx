import { useState } from 'react'
import { Flame, Percent, TrendingUp, Trophy } from 'lucide-react'
import { getPokerSessions } from '../storage'
import {
  bankrollTrend,
  biggestSession,
  currentResultStreak,
  hourlyRate,
  monthlyPnl,
  sessionDurationHours,
  sessionPnl,
  totalHours,
  totalPnl,
  winRate,
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

function formatPercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`
}

export default function Poker() {
  const [showLog, setShowLog] = useState(false)

  if (showLog) {
    return <LogSession onSave={() => setShowLog(false)} onBack={() => setShowLog(false)} />
  }

  const now = new Date()
  const sessions = getPokerSessions()
  const pnl = totalPnl(sessions)
  const hours = totalHours(sessions)
  const rate = hourlyRate(sessions)
  const thisMonthPnl = monthlyPnl(sessions, now.getFullYear(), now.getMonth())
  const ratePct = winRate(sessions)
  const streak = currentResultStreak(sessions)
  const biggest = biggestSession(sessions)
  const trend = bankrollTrend(sessions)
  const trendMax = Math.max(1, ...trend.map(value => Math.abs(value)))

  const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--red)'
  const rateColor = (rate ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'

  const sorted = [...sessions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime),
  )

  return (
    <div className="screen poker theme-screen theme-screen--poker">
      <p className="screen-title">Poker</p>

      <div className="card poker-stats-card poker__hero">
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

      {sessions.length > 0 && (
        <>
          <h3 className="section-title">Bankroll Insights</h3>
          <div className="ios-list poker__insights">
            <div className="breakdown-row insight-row">
              <span className="icon-label">
                <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
                This month
              </span>
              <span
                className="insight-value"
                style={{ color: thisMonthPnl >= 0 ? 'var(--green)' : 'var(--red)' }}
              >
                {formatSignedCurrency(thisMonthPnl)}
              </span>
            </div>
            {ratePct !== null && (
              <div className="breakdown-row insight-row">
                <span className="icon-label">
                  <Percent size={16} strokeWidth={2} aria-hidden="true" />
                  Win rate
                </span>
                <span className="insight-value">{formatPercent(ratePct)}</span>
              </div>
            )}
            {streak && (
              <div className="breakdown-row insight-row">
                <span className="icon-label">
                  <Flame size={16} strokeWidth={2} aria-hidden="true" />
                  Streak
                </span>
                <span
                  className="insight-value"
                  style={{ color: streak.result === 'win' ? 'var(--green)' : 'var(--red)' }}
                >
                  {streak.count} {streak.result}{streak.count === 1 ? '' : 's'} in a row
                </span>
              </div>
            )}
            {biggest && (
              <div className="breakdown-row insight-row">
                <span className="icon-label">
                  <Trophy size={16} strokeWidth={2} aria-hidden="true" />
                  Biggest swing
                </span>
                <span
                  className="insight-value"
                  style={{ color: biggest.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}
                >
                  {formatSignedCurrency(biggest.pnl)}
                </span>
              </div>
            )}
          </div>
          <div className="card bankroll-card poker__trend" aria-label="Bankroll trend">
            <div className="bankroll-trend">
              {trend.map((value, index) => (
                <span
                  // Cumulative values can repeat, so index is the stable point identity here.
                  key={`${index}-${value}`}
                  className={`bankroll-trend-point ${value >= 0 ? 'is-positive' : 'is-negative'}`}
                  style={{ height: `${Math.max(16, (Math.abs(value) / trendMax) * 100)}%` }}
                  title={formatSignedCurrency(value)}
                />
              ))}
            </div>
            <div className="bankroll-card-footer">
              <span className="muted">Bankroll trend</span>
              <strong style={{ color: pnlColor }}>{formatSignedCurrency(pnl)}</strong>
            </div>
          </div>
        </>
      )}

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
