// src/compute.ts
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, addWeeks } from 'date-fns'
import type { Entry, BudgetConfig, Category } from './types'
import { CATEGORIES } from './types'

export function entriesForMonth(entries: Entry[], year: number, month: number): Entry[] {
  return entries.filter(e => {
    const d = parseISO(e.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

export function monthlySpendByCategory(
  entries: Entry[],
  year: number,
  month: number
): Record<Category, number> {
  const monthly = entriesForMonth(entries, year, month)
  const result = Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<Category, number>
  for (const entry of monthly) {
    if (entry.category) result[entry.category] += entry.amount
  }
  return result
}

export function categoryDeficits(
  spend: Record<Category, number>,
  config: BudgetConfig
): Record<Category, number> {
  return Object.fromEntries(
    CATEGORIES.map(c => [c, config[c] - spend[c]])
  ) as Record<Category, number>
}

export function bufferRemaining(
  deficits: Record<Category, number>,
  config: BudgetConfig
): number {
  const totalOverage = Object.values(deficits)
    .filter(d => d < 0)
    .reduce((sum, d) => sum + Math.abs(d), 0)
  return config.buffer - totalOverage
}

export function weeklyTotal(entries: Entry[], referenceDate: Date): number {
  const start = startOfWeek(referenceDate, { weekStartsOn: 1 })
  const end = endOfWeek(referenceDate, { weekStartsOn: 1 })
  return entries
    .filter(e => isWithinInterval(parseISO(e.date), { start, end }))
    .reduce((sum, e) => sum + e.amount, 0)
}

export function lunchWeeklySpend(entries: Entry[], referenceDate: Date): number {
  const start = startOfWeek(referenceDate, { weekStartsOn: 1 })
  const end = endOfWeek(referenceDate, { weekStartsOn: 1 })
  return entries
    .filter(e => e.category === 'lunch' && isWithinInterval(parseISO(e.date), { start, end }))
    .reduce((sum, e) => sum + e.amount, 0)
}

export function weeksInMonth(year: number, month: number): Date[] {
  const weeks: Date[] = []
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  let current = startOfWeek(firstDay, { weekStartsOn: 1 })
  while (current <= lastDay) {
    weeks.push(new Date(current))
    current = addWeeks(current, 1)
  }
  return weeks
}

export function mostExpensiveCategory(
  entries: Entry[],
  year: number,
  month: number,
): { category: Category; amount: number } | null {
  const spend = monthlySpendByCategory(entries, year, month)
  const categorized = CATEGORIES.filter(c => spend[c] > 0)
  if (categorized.length === 0) return null
  const top = categorized.reduce((a, b) => (spend[a] >= spend[b] ? a : b))
  return { category: top, amount: spend[top] }
}

export function averageLunchPerEntry(
  entries: Entry[],
  year: number,
  month: number,
): number | null {
  const lunchEntries = entriesForMonth(entries, year, month).filter(e => e.category === 'lunch')
  if (lunchEntries.length < 2) return null
  return lunchEntries.reduce((sum, e) => sum + e.amount, 0) / lunchEntries.length
}

export function highestSpendingDay(
  entries: Entry[],
  year: number,
  month: number,
): { date: string; amount: number } | null {
  const monthly = entriesForMonth(entries, year, month)
  const byDate = new Map<string, number>()
  for (const entry of monthly) {
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.amount)
  }
  if (byDate.size < 2) return null
  const [topDate, topAmount] = [...byDate.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))
  return { date: topDate, amount: topAmount }
}

export function topSpendingDayOfWeek(entries: Entry[]): string | null {
  const byDow = [0, 0, 0, 0, 0, 0, 0]
  for (const entry of entries) {
    const dow = parseISO(entry.date).getDay()
    byDow[dow] += entry.amount
  }
  if (byDow.filter(v => v > 0).length < 3) return null
  const topDow = byDow.indexOf(Math.max(...byDow))
  return ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][
    topDow
  ]
}

export function monthOverMonthDelta(
  entries: Entry[],
  year: number,
  month: number,
): number | null {
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const prevEntries = entriesForMonth(entries, prevYear, prevMonth)
  if (prevEntries.length === 0) return null
  const current = entriesForMonth(entries, year, month).reduce((sum, e) => sum + e.amount, 0)
  const prev = prevEntries.reduce((sum, e) => sum + e.amount, 0)
  return current - prev
}
