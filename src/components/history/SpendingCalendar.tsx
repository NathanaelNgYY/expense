import { format } from 'date-fns'
import { toLocalDateString } from '../../dates'
import { formatSGD } from '../../format'

interface Props {
  year: number
  month: number
  spendByDay: ReadonlyMap<number, number>
  maxDaySpend: number
  today: string
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

export default function SpendingCalendar({
  year,
  month,
  spendByDay,
  maxDaySpend,
  today,
  selectedDate,
  onSelectDate,
}: Props) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  return (
    <details className="history-analysis">
      <summary className="history-analysis__summary">Calendar</summary>
      <div className="history-analysis__body">
        <div className="cal-grid history__calendar" role="grid" aria-label="Daily spending">
          {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(day => {
            const date = new Date(year, month, day)
            const dateString = toLocalDateString(date)
            const spend = spendByDay.get(day) ?? 0
            const alpha = spend > 0 ? 0.15 + Math.min(1, spend / maxDaySpend) * 0.65 : 0.06
            const isToday = dateString === today
            const isSelected = dateString === selectedDate

            return (
              <button
                key={day}
                type="button"
                className={`cal-cell${isToday ? ' cal-cell--today' : ''}${isSelected ? ' cal-cell--selected' : ''}`}
                style={{
                  background: `color-mix(in srgb, var(--primary) ${Math.round(alpha * 100)}%, transparent)`,
                }}
                onClick={() => onSelectDate(dateString)}
                aria-label={`${format(date, 'MMM d')}, ${formatSGD(spend)} spent`}
                aria-pressed={isSelected}
              >
                {day}
              </button>
            )
          })}
        </div>
        <p className="cal-caption muted">lighter = heavier spend day &middot; ring = today &middot; tap a day to filter the ledger</p>
      </div>
    </details>
  )
}
