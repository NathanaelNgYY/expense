import { test as base, expect, type Page } from '@playwright/test'

export interface SeedEntry {
  id: string
  amount: number
  category: string | null
  note: string
  date: string
  source?: 'manual' | 'apple-pay' | 'dbs-email'
  currency?: string
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

export function currentLocalDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export { base as test, expect }
