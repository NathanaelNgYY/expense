import { test as base, expect, type Page } from '@playwright/test'

export interface SeedEntry {
  id: string
  amount: number
  category: string | null
  note: string
  date: string
  source?: 'manual' | 'apple-pay' | 'dbs-email'
  currency?: string
  merchant?: string
}

const DEFAULT_BUDGET = {
  monthlyIncome: 1200,
  lunch: 264,
  transport: 50,
  savings: 400,
  investments: 250,
  others: 236,
  buffer: 236,
}

export async function prepareApp(page: Page, entries: SeedEntry[] = []) {
  await page.route('**://*.supabase.co/**', route => route.abort())
  await page.addInitScript(({ seededEntries, budget }) => {
    localStorage.clear()
    localStorage.setItem('budget_entries', JSON.stringify(seededEntries))
    localStorage.setItem('budget_config', JSON.stringify(budget))
  }, { seededEntries: entries, budget: DEFAULT_BUDGET })
}

/**
 * A date `monthsBack` whole calendar months before this one, on the 5th — a day
 * every month has, so a seed can never land on a 31st that does not exist.
 */
export function localDateMonthsBack(monthsBack: number) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() - monthsBack, 5)
  const year = target.getFullYear()
  const month = String(target.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-05`
}

/** The month name the app prints for `monthsBack` months ago, e.g. "May". */
export function monthNameMonthsBack(monthsBack: number) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
    .toLocaleString('default', { month: 'long' })
}

export function currentLocalDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export { base as test, expect }
