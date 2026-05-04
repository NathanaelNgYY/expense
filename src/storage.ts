// src/storage.ts
import type { Entry, BudgetConfig } from './types'
import { DEFAULT_BUDGET } from './types'

const ENTRIES_KEY = 'budget_entries'
const CONFIG_KEY = 'budget_config'

export function getEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY)
    return raw ? (JSON.parse(raw) as Entry[]) : []
  } catch {
    return []
  }
}

export function saveEntries(entries: Entry[]): void {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries))
}

export function addEntry(entry: Entry): void {
  saveEntries([...getEntries(), entry])
}

export function getBudgetConfig(): BudgetConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as BudgetConfig) : { ...DEFAULT_BUDGET }
  } catch {
    return { ...DEFAULT_BUDGET }
  }
}

export function saveBudgetConfig(config: BudgetConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}
