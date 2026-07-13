// src/storage.ts
import type { Entry, BudgetConfig, CategoryOverrides, PokerSession, CustomCategory } from './types'
import { DEFAULT_BUDGET } from './types'
import { getUserStorageItem, setUserStorageItem } from './userStorage'

export { activateUserStorage } from './userStorage'

const ENTRIES_KEY = 'budget_entries'
const CONFIG_KEY = 'budget_config'
const CUSTOM_CATEGORIES_KEY = 'budget_custom_categories'
const CATEGORY_OVERRIDES_KEY = 'budget_category_overrides'

export function getEntries(): Entry[] {
  try {
    const raw = getUserStorageItem(ENTRIES_KEY)
    return raw ? (JSON.parse(raw) as Entry[]) : []
  } catch {
    return []
  }
}

export function saveEntries(entries: Entry[]): void {
  setUserStorageItem(ENTRIES_KEY, JSON.stringify(entries))
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
    const raw = getUserStorageItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_BUDGET }

    const parsed = { ...DEFAULT_BUDGET, ...(JSON.parse(raw) as Partial<BudgetConfig>) }
    return { ...parsed, others: parsed.buffer }
  } catch {
    return { ...DEFAULT_BUDGET }
  }
}

export function saveBudgetConfig(config: BudgetConfig): void {
  setUserStorageItem(CONFIG_KEY, JSON.stringify(config))
}

export function getCustomCategories(): CustomCategory[] {
  try {
    const raw = getUserStorageItem(CUSTOM_CATEGORIES_KEY)
    return raw ? (JSON.parse(raw) as CustomCategory[]) : []
  } catch {
    return []
  }
}

export function saveCustomCategories(categories: CustomCategory[]): void {
  setUserStorageItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories))
}

// Display overrides (rename / re-icon) for the built-in basic categories.
export function getCategoryOverrides(): CategoryOverrides {
  try {
    const raw = getUserStorageItem(CATEGORY_OVERRIDES_KEY)
    return raw ? (JSON.parse(raw) as CategoryOverrides) : {}
  } catch {
    return {}
  }
}

export function saveCategoryOverrides(overrides: CategoryOverrides): void {
  setUserStorageItem(CATEGORY_OVERRIDES_KEY, JSON.stringify(overrides))
}

export function makeCustomCategoryId(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'category'
  return `cat_${slug}_${Math.random().toString(36).slice(2, 7)}`
}

const POKER_SESSIONS_KEY = 'poker_sessions'
const POKER_CUSTOM_STAKES_KEY = 'poker_custom_stakes'

export function getPokerSessions(): PokerSession[] {
  try {
    const raw = getUserStorageItem(POKER_SESSIONS_KEY)
    return raw ? (JSON.parse(raw) as PokerSession[]) : []
  } catch {
    return []
  }
}

export function savePokerSession(session: PokerSession): void {
  setUserStorageItem(POKER_SESSIONS_KEY, JSON.stringify([...getPokerSessions(), session]))
}

export function savePokerSessions(sessions: PokerSession[]): void {
  setUserStorageItem(POKER_SESSIONS_KEY, JSON.stringify(sessions))
}

export function getCustomStakes(): string[] {
  try {
    const raw = getUserStorageItem(POKER_CUSTOM_STAKES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveCustomStakes(stakes: string[]): void {
  setUserStorageItem(POKER_CUSTOM_STAKES_KEY, JSON.stringify(stakes))
}
