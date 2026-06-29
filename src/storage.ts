// src/storage.ts
import type { Entry, BudgetConfig, PokerSession, CustomCategory } from './types'
import { DEFAULT_BUDGET } from './types'

const ENTRIES_KEY = 'budget_entries'
const CONFIG_KEY = 'budget_config'
const CUSTOM_CATEGORIES_KEY = 'budget_custom_categories'

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

// Entries now live on the server; localStorage is a read-through cache.
export const getCachedEntries = getEntries
export const setCachedEntries = saveEntries

export function addEntry(entry: Entry): void {
  saveEntries([...getEntries(), entry])
}

export function updateEntry(updatedEntry: Entry): void {
  saveEntries(getEntries().map(entry => (entry.id === updatedEntry.id ? updatedEntry : entry)))
}

export function getBudgetConfig(): BudgetConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_BUDGET }

    const parsed = { ...DEFAULT_BUDGET, ...(JSON.parse(raw) as Partial<BudgetConfig>) }
    return { ...parsed, others: parsed.buffer }
  } catch {
    return { ...DEFAULT_BUDGET }
  }
}

export function saveBudgetConfig(config: BudgetConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function getCustomCategories(): CustomCategory[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY)
    return raw ? (JSON.parse(raw) as CustomCategory[]) : []
  } catch {
    return []
  }
}

export function saveCustomCategories(categories: CustomCategory[]): void {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories))
}

export function makeCustomCategoryId(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'category'
  return `cat_${slug}_${Math.random().toString(36).slice(2, 7)}`
}

const POKER_SESSIONS_KEY = 'poker_sessions'
const POKER_CUSTOM_STAKES_KEY = 'poker_custom_stakes'

export function getPokerSessions(): PokerSession[] {
  try {
    const raw = localStorage.getItem(POKER_SESSIONS_KEY)
    return raw ? (JSON.parse(raw) as PokerSession[]) : []
  } catch {
    return []
  }
}

export function savePokerSession(session: PokerSession): void {
  localStorage.setItem(POKER_SESSIONS_KEY, JSON.stringify([...getPokerSessions(), session]))
}

export function getCustomStakes(): string[] {
  try {
    const raw = localStorage.getItem(POKER_CUSTOM_STAKES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveCustomStakes(stakes: string[]): void {
  localStorage.setItem(POKER_CUSTOM_STAKES_KEY, JSON.stringify(stakes))
}
