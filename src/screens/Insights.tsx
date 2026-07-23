import { useState } from 'react'
import { endOfWeek, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import InsightsSection from '../components/InsightsSection'
import Trends from '../components/Trends'
import CategoryDeltas from '../components/CategoryDeltas'
import { useEntries } from '../EntriesContext'
import { sgtToday } from '../shared/sgtDate'
import {
  categoryWeeklySpend,
  entriesForMonth,
  monthlySpendByCategory,
  paceCategory,
  weeklyBudgetTarget,
  weeklyTotal,
  weeksInMonth,
} from '../compute'
import { buildCategoryOptions, categoryLabel } from '../categoryDisplay'
import { formatMoney, formatMoneyWhole } from '../format'
import { useBudgetConfig } from '../BudgetConfigContext'
import { entriesForCurrency } from '../shared/currency'

function progressPercent(amount: number, budget: number): number {
  if (budget <= 0) return amount > 0 ? 100 : 0
  return Math.min(100, (amount / budget) * 100)
}

export default function Insights() {
  const now = sgtToday()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const { entries: allEntries } = useEntries()
  const { config, customCategories, overrides, activeCurrency } = useBudgetConfig()
  const entries = entriesForCurrency(allEntries, activeCurrency)
  const categoryOptions = buildCategoryOptions(overrides, customCategories)
  const monthEntries = entriesForMonth(entries, year, month)
  const categorySpend = monthlySpendByCategory(entries, year, month, customCategories)
  const weeks = weeksInMonth(year, month)
  const paceId = paceCategory(config)
  const paceLabel = categoryLabel(paceId, overrides, customCategories)
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
            <strong>{formatMoney(categorySpend[category.id] ?? 0, activeCurrency)}</strong>
          </div>
        ))}
      </div>

      <h2 className="section-title">Weekly Spending</h2>
      {weeks.map(weekStart => {
        const total = weeklyTotal(monthEntries, weekStart)
        const paceSpend = categoryWeeklySpend(monthEntries, weekStart, paceId)
        const weeklyBudget = weeklyBudgetTarget(config.monthlyIncome, year, month, weekStart)
        const paceWeeklyBudget = weeklyBudgetTarget(config[paceId], year, month, weekStart)
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
              <span className="week-bar-total">{formatMoney(total, activeCurrency)} / ~{formatMoneyWhole(weeklyBudget, activeCurrency)}</span>
            </div>
            <span id={summaryId} className="sr-only">
              Total {formatMoney(total, activeCurrency)} of {formatMoney(weeklyBudget, activeCurrency)} target. {paceLabel} {formatMoney(paceSpend, activeCurrency)} of {formatMoney(paceWeeklyBudget, activeCurrency)} target.
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
              <span className="muted">{paceLabel} {formatMoney(paceSpend, activeCurrency)} / ~{formatMoneyWhole(paceWeeklyBudget, activeCurrency)}</span>
              <div className="progress-bar thin" style={{ marginTop: 4 }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${progressPercent(paceSpend, paceWeeklyBudget)}%`,
                    background: paceSpend > paceWeeklyBudget ? 'var(--red)' : 'var(--blue)',
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}

      <InsightsSection entries={entries} year={year} month={month} customCategories={customCategories} currency={activeCurrency} />

      <Trends
        entries={entries}
        year={year}
        month={month}
        referenceDate={now}
        customCategories={customCategories}
        currency={activeCurrency}
      />

      <CategoryDeltas
        entries={entries}
        year={year}
        month={month}
        referenceDate={now}
        customCategories={customCategories}
        currency={activeCurrency}
      />
    </div>
  )
}
