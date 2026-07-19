// src/compute.ts
import {
  addWeeks,
  differenceInCalendarDays,
  endOfWeek,
  getDaysInMonth,
  isWithinInterval,
  max,
  min,
  parseISO,
  startOfWeek,
} from 'date-fns'
import type { Entry, BudgetConfig, Category, CustomCategory } from './types'
import { CATEGORIES } from './types'
import { entryKind, entryNetAmount } from './shared/entryAmount'

export function allCategoryIds(custom: CustomCategory[] = []): string[] {
  return [...CATEGORIES, ...custom.map(c => c.id)]
}

export function categoryBudgets(
  config: BudgetConfig,
  custom: CustomCategory[] = [],
): Record<string, number> {
  const budgets: Record<string, number> = {}
  for (const c of CATEGORIES) budgets[c] = config[c] ?? 0
  for (const c of custom) budgets[c.id] = c.budget ?? 0
  return budgets
}

export function customBudgetTotal(custom: CustomCategory[] = []): number {
  return custom.reduce((sum, c) => sum + (c.budget ?? 0), 0)
}

// How many entries (any date) reference this category id. Used to block removal
// of an in-use category so no entry is left pointing at a deleted category.
export function countEntriesForCategory(entries: Entry[], categoryId: string): number {
  return entries.reduce((n, entry) => (entry.category === categoryId ? n + 1 : n), 0)
}

const COMMITMENT_CATEGORIES = new Set<Category>(['savings', 'investments'])
const SPENDING_CATEGORIES = CATEGORIES.filter(category => !COMMITMENT_CATEGORIES.has(category))

export interface MonthlySpendForecast {
  spentToDate: number
  dailyAverage: number
  daysElapsed: number
  daysInMonth: number
  projectedTotal: number
}

export interface SafeToSpendResult {
  remainingBudget: number
  daysRemaining: number
  amountPerDay: number
}

export interface CategoryMonthDelta {
  current: number
  previous: number
  delta: number
}

export interface HighlightedCategoryMonthDelta extends CategoryMonthDelta {
  category: Category
}

export interface MonthComparison {
  previousYear: number
  previousMonth: number
  currentTotal: number
  previousTotal: number
  totalDelta: number
  categoryDeltas: Record<Category, CategoryMonthDelta>
  biggestIncrease: HighlightedCategoryMonthDelta | null
  biggestDecrease: HighlightedCategoryMonthDelta | null
}

export interface SpendFilterOptions {
  excludedCategories?: string[]
}

export function entriesForMonth(entries: Entry[], year: number, month: number): Entry[] {
  return entries.filter(e => {
    const d = parseISO(e.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

export function monthlySpendByCategory(
  entries: Entry[],
  year: number,
  month: number,
  custom: CustomCategory[] = [],
): Record<string, number> {
  const monthly = entriesForMonth(entries, year, month)
  const result = Object.fromEntries(allCategoryIds(custom).map(c => [c, 0])) as Record<string, number>
  for (const entry of monthly) {
    if (entry.category && entry.category in result) result[entry.category] += entryNetAmount(entry)
  }
  return result
}

export function categoryDeficits(
  spend: Record<string, number>,
  config: BudgetConfig,
  custom: CustomCategory[] = [],
): Record<string, number> {
  const budgets = categoryBudgets(config, custom)
  const ids = new Set([...Object.keys(spend), ...Object.keys(budgets)])
  return Object.fromEntries(
    [...ids].map(c => [c, (budgets[c] ?? 0) - (spend[c] ?? 0)]),
  ) as Record<string, number>
}

export function bufferRemaining(
  deficits: Record<string, number>,
  config: BudgetConfig
): number {
  const othersBudget = config.others ?? config.buffer
  const othersSpend = Math.max(0, othersBudget - (deficits.others ?? othersBudget))
  const categoryOverage = Object.entries(deficits)
    .filter(([category, deficit]) => category !== 'others' && deficit < 0)
    .reduce((sum, [, deficit]) => sum + Math.abs(deficit), 0)
  return config.buffer - othersSpend - categoryOverage
}

export function weeklyTotal(entries: Entry[], referenceDate: Date): number {
  const start = startOfWeek(referenceDate, { weekStartsOn: 1 })
  const end = endOfWeek(referenceDate, { weekStartsOn: 1 })
  return entries
    .filter(e => isWithinInterval(parseISO(e.date), { start, end }))
    .reduce((sum, e) => sum + entryNetAmount(e), 0)
}

export function lunchWeeklySpend(entries: Entry[], referenceDate: Date): number {
  const start = startOfWeek(referenceDate, { weekStartsOn: 1 })
  const end = endOfWeek(referenceDate, { weekStartsOn: 1 })
  return entries
    .filter(e => e.category === 'lunch' && isWithinInterval(parseISO(e.date), { start, end }))
    .reduce((sum, e) => sum + entryNetAmount(e), 0)
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

export function weeklyBudgetTarget(
  monthlyTarget: number,
  year: number,
  month: number,
  referenceDate: Date,
): number {
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const overlapStart = max([monthStart, startOfWeek(referenceDate, { weekStartsOn: 1 })])
  const overlapEnd = min([monthEnd, endOfWeek(referenceDate, { weekStartsOn: 1 })])
  const selectedMonthDays = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart) + 1)

  return monthlyTarget * selectedMonthDays / getDaysInMonth(monthStart)
}

export function mostExpensiveCategory(
  entries: Entry[],
  year: number,
  month: number,
  custom: CustomCategory[] = [],
): { category: string; amount: number } | null {
  const spend = monthlySpendByCategory(entries, year, month, custom)
  const categorized = [...SPENDING_CATEGORIES, ...custom.map(category => category.id)]
    .filter(category => spend[category] > 0)
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
  const purchaseCount = lunchEntries.filter(e => entryKind(e) === 'expense').length
  if (purchaseCount < 2) return null
  return lunchEntries.reduce((sum, e) => sum + entryNetAmount(e), 0) / purchaseCount
}

export function highestSpendingDay(
  entries: Entry[],
  year: number,
  month: number,
): { date: string; amount: number } | null {
  const monthly = entriesForMonth(entries, year, month)
  const byDate = new Map<string, number>()
  for (const entry of monthly) {
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entryNetAmount(entry))
  }
  if (byDate.size < 2) return null
  const [topDate, topAmount] = [...byDate.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))
  return { date: topDate, amount: topAmount }
}

export function topSpendingDayOfWeek(entries: Entry[], year: number, month: number): string | null {
  const byDow = [0, 0, 0, 0, 0, 0, 0]
  for (const entry of entriesForMonth(entries, year, month)) {
    const dow = parseISO(entry.date).getDay()
    byDow[dow] += entryNetAmount(entry)
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
  const current = entriesForMonth(entries, year, month).reduce((sum, e) => sum + entryNetAmount(e), 0)
  const prev = prevEntries.reduce((sum, e) => sum + entryNetAmount(e), 0)
  return current - prev
}

function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function monthOrder(year: number, month: number): number {
  return year * 12 + month
}

function daysElapsedForForecast(year: number, month: number, referenceDate: Date): number {
  const daysInMonth = daysInCalendarMonth(year, month)
  const target = monthOrder(year, month)
  const reference = monthOrder(referenceDate.getFullYear(), referenceDate.getMonth())

  if (target < reference) return daysInMonth
  if (target > reference) return 1
  return Math.min(daysInMonth, Math.max(1, referenceDate.getDate()))
}

function daysRemainingForMonth(year: number, month: number, referenceDate: Date): number {
  const daysInMonth = daysInCalendarMonth(year, month)
  const target = monthOrder(year, month)
  const reference = monthOrder(referenceDate.getFullYear(), referenceDate.getMonth())

  if (target < reference) return 0
  if (target > reference) return daysInMonth
  return Math.max(1, daysInMonth - referenceDate.getDate() + 1)
}

function spendEntriesForMonth(
  entries: Entry[],
  year: number,
  month: number,
  options: SpendFilterOptions = {},
): Entry[] {
  const excluded = new Set(options.excludedCategories ?? [])
  return entriesForMonth(entries, year, month).filter(entry => !entry.category || !excluded.has(entry.category))
}

export function monthlySpendForecast(
  entries: Entry[],
  year: number,
  month: number,
  referenceDate: Date = new Date(),
  options: SpendFilterOptions = {},
): MonthlySpendForecast {
  const spentToDate = spendEntriesForMonth(entries, year, month, options).reduce((sum, e) => sum + entryNetAmount(e), 0)
  const daysInMonth = daysInCalendarMonth(year, month)
  const daysElapsed = daysElapsedForForecast(year, month, referenceDate)
  const dailyAverage = spentToDate / daysElapsed

  return {
    spentToDate,
    dailyAverage,
    daysElapsed,
    daysInMonth,
    projectedTotal: dailyAverage * daysInMonth,
  }
}

export function safeToSpendPerDay(
  entries: Entry[],
  year: number,
  month: number,
  monthlyBudget: number,
  referenceDate: Date = new Date(),
  options: SpendFilterOptions = {},
): SafeToSpendResult {
  const spent = spendEntriesForMonth(entries, year, month, options).reduce((sum, e) => sum + entryNetAmount(e), 0)
  const remainingBudget = monthlyBudget - spent
  const daysRemaining = daysRemainingForMonth(year, month, referenceDate)

  return {
    remainingBudget,
    daysRemaining,
    amountPerDay: daysRemaining > 0 ? remainingBudget / daysRemaining : 0,
  }
}

export function monthComparison(
  entries: Entry[],
  year: number,
  month: number,
): MonthComparison | null {
  const previousMonth = month === 0 ? 11 : month - 1
  const previousYear = month === 0 ? year - 1 : year
  const currentEntries = entriesForMonth(entries, year, month)
  const previousEntries = entriesForMonth(entries, previousYear, previousMonth)

  if (previousEntries.length === 0) return null

  const currentSpend = monthlySpendByCategory(entries, year, month)
  const previousSpend = monthlySpendByCategory(entries, previousYear, previousMonth)
  const categoryDeltas = Object.fromEntries(
    CATEGORIES.map(category => [
      category,
      {
        current: currentSpend[category],
        previous: previousSpend[category],
        delta: currentSpend[category] - previousSpend[category],
      },
    ]),
  ) as Record<Category, CategoryMonthDelta>
  const highlighted = CATEGORIES.map(category => ({ category, ...categoryDeltas[category] }))
  const increases = highlighted.filter(item => item.delta > 0)
  const decreases = highlighted.filter(item => item.delta < 0)
  const currentTotal = currentEntries.reduce((sum, e) => sum + entryNetAmount(e), 0)
  const previousTotal = previousEntries.reduce((sum, e) => sum + entryNetAmount(e), 0)

  return {
    previousYear,
    previousMonth,
    currentTotal,
    previousTotal,
    totalDelta: currentTotal - previousTotal,
    categoryDeltas,
    biggestIncrease: increases.length > 0
      ? increases.reduce((largest, item) => (item.delta > largest.delta ? item : largest))
      : null,
    biggestDecrease: decreases.length > 0
      ? decreases.reduce((largestDrop, item) => (item.delta < largestDrop.delta ? item : largestDrop))
      : null,
  }
}
