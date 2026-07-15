import { useState } from 'react'
import { endOfWeek, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import InsightsSection from '../components/InsightsSection'
import { useEntries } from '../EntriesContext'
import {
  entriesForMonth,
  lunchWeeklySpend,
  monthlySpendByCategory,
  weeklyBudgetTarget,
  weeklyTotal,
  weeksInMonth,
} from '../compute'
import { buildCategoryOptions } from '../categoryDisplay'
import { formatSGD, formatSGDWhole } from '../format'
import { getBudgetConfig, getCategoryOverrides, getCustomCategories } from '../storage'

function progressPercent(amount: number, budget: number): number {
  if (budget <= 0) return amount > 0 ? 100 : 0
  return Math.min(100, (amount / budget) * 100)
}

export default function Insights() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const { entries } = useEntries()
  const config = getBudgetConfig()
  const customCategories = getCustomCategories()
  const categoryOptions = buildCategoryOptions(getCategoryOverrides(), customCategories)
  const monthEntries = entriesForMonth(entries, year, month)
  const categorySpend = monthlySpendByCategory(entries, year, month, customCategories)
  const weeks = weeksInMonth(year, month)
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const monthLabel = new Date(year, month, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  function prevMonth() {
    setYear(month === 0 ? year - 1 : year)
    setMonth(month === 0 ? 11 : month - 1)
  }

  function nextMonth() {
    if (isCurrentMonth) return
    setYear(month === 11 ? year + 1 : year)
    setMonth(month === 11 ? 0 : month + 1)
  }

  return (
    <div className="screen insights theme-screen theme-screen--insights">
      <div className="month-nav">
        <button className="month-nav-btn" type="button" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
        <h1 className="month-nav-label"><span className="sr-only">Insights: </span>{monthLabel}</h1>
        <button
          className="month-nav-btn"
          type="button"
          onClick={nextMonth}
          disabled={isCurrentMonth}
          aria-label="Next month"
        >
          <ChevronRight aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
      </div>

      <h2 className="section-title">Category Breakdown</h2>
      <div className="ios-list">
        {categoryOptions.map(category => (
          <div className="breakdown-row" key={category.id}>
            <span className="icon-label">
              <BudgetIcon name={category.icon} />
              {category.label}
            </span>
            <strong>{formatSGD(categorySpend[category.id] ?? 0)}</strong>
          </div>
        ))}
      </div>

      <h2 className="section-title">Weekly Spending</h2>
      {weeks.map(weekStart => {
        const total = weeklyTotal(monthEntries, weekStart)
        const lunch = lunchWeeklySpend(monthEntries, weekStart)
        const weeklyBudget = weeklyBudgetTarget(config.monthlyIncome, year, month, weekStart)
        const lunchWeeklyBudget = weeklyBudgetTarget(config.lunch, year, month, weekStart)
        const label = `${format(weekStart, 'MMM d')} - ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d')}`
        const summaryId = `insights-week-${format(weekStart, 'yyyy-MM-dd')}-summary`

        return (
          <div
            key={weekStart.toISOString()}
            className="card week-bar"
            role="group"
            aria-label={label}
            aria-describedby={summaryId}
          >
            <div className="week-bar-header">
              <span className="week-bar-label">{label}</span>
              <span className="week-bar-total">{formatSGD(total)} / ~{formatSGDWhole(weeklyBudget)}</span>
            </div>
            <span id={summaryId} className="sr-only">
              Total {formatSGD(total)} of {formatSGD(weeklyBudget)} target. Lunch {formatSGD(lunch)} of {formatSGD(lunchWeeklyBudget)} target.
            </span>
            <div className="progress-bar" style={{ marginTop: 6 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${progressPercent(total, weeklyBudget)}%`,
                  background: total > weeklyBudget ? 'var(--red)' : 'var(--green)',
                }}
              />
            </div>
            <div className="week-bar-lunch">
              <span className="muted">Lunch {formatSGD(lunch)} / ~{formatSGDWhole(lunchWeeklyBudget)}</span>
              <div className="progress-bar thin" style={{ marginTop: 4 }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${progressPercent(lunch, lunchWeeklyBudget)}%`,
                    background: lunch > lunchWeeklyBudget ? 'var(--red)' : 'var(--blue)',
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}

      <InsightsSection entries={entries} year={year} month={month} customCategories={customCategories} />
    </div>
  )
}
