// src/storage.ts
import type { Entry, BudgetConfig, PokerSession } from './types'
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
