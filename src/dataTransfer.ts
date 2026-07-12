// src/dataTransfer.ts
// JSON export/import for moving a user's origin-locked data (localStorage) to a new
// origin. Export copies; import upserts idempotently — nothing is ever cleared (C2).
import type { BudgetConfig, CategoryOverrides, CustomCategory, Entry, PokerSession } from './types'
import { bulkUpsertEntries, bulkUpsertPokerSessions } from './api'
import {
  getBudgetConfig,
  getCachedEntries,
  getCategoryOverrides,
  getCustomCategories,
  getCustomStakes,
  getPokerSessions,
  saveBudgetConfig,
  saveCategoryOverrides,
  saveCustomCategories,
  saveCustomStakes,
  savePokerSessions,
  setCachedEntries,
} from './storage'
import { THEME_STORAGE_KEY } from './theme/themeRegistry'

export interface ExportPayloadV1 {
  schemaVersion: 1
  exportedAt: string
  entries: Entry[]
  pokerSessions: PokerSession[]
  settings: {
    budgetConfig?: BudgetConfig
    customCategories?: CustomCategory[]
    categoryOverrides?: CategoryOverrides
    customStakes?: string[]
    theme?: string
  }
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export function buildExportPayload(): ExportPayloadV1 {
  const theme = localStorage.getItem(THEME_STORAGE_KEY) ?? undefined
  const customCategories = getCustomCategories()
  const customStakes = getCustomStakes()
  const categoryOverrides = getCategoryOverrides()
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    entries: getCachedEntries(),
    pokerSessions: getPokerSessions(),
    settings: {
      // budget_config falls back to defaults when unset; only export it when the user saved one
      budgetConfig: readJson<BudgetConfig>('budget_config') ? getBudgetConfig() : undefined,
      customCategories: customCategories.length > 0 ? customCategories : undefined,
      categoryOverrides: Object.keys(categoryOverrides).length > 0 ? categoryOverrides : undefined,
      customStakes: customStakes.length > 0 ? customStakes : undefined,
      theme,
    },
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(raw: unknown, index: number): Entry {
  if (!isRecord(raw)) throw new Error(`Entry ${index + 1} is not an object.`)
  const { id, amount, category, note, date } = raw
  if (typeof id !== 'string' || id.length === 0) throw new Error(`Entry ${index + 1} is missing an id.`)
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error(`Entry ${index + 1} has an invalid amount.`)
  if (typeof date !== 'string' || !DATE_RE.test(date)) throw new Error(`Entry ${index + 1} has an invalid date (expected YYYY-MM-DD).`)
  if (category !== null && category !== undefined && typeof category !== 'string') throw new Error(`Entry ${index + 1} has an invalid category.`)
  const entry: Entry = {
    id,
    amount,
    category: typeof category === 'string' ? category : null,
    note: typeof note === 'string' ? note : '',
    date,
  }
  if (typeof raw.source === 'string') entry.source = raw.source as Entry['source']
  if (typeof raw.merchant === 'string') entry.merchant = raw.merchant
  if (typeof raw.occurredAt === 'string') entry.occurredAt = raw.occurredAt
  if (typeof raw.currency === 'string') entry.currency = raw.currency
  if (typeof raw.importKey === 'string') entry.importKey = raw.importKey
  if (typeof raw.dedupeKey === 'string') entry.dedupeKey = raw.dedupeKey
  return entry
}

function parsePokerSession(raw: unknown, index: number): PokerSession {
  if (!isRecord(raw)) throw new Error(`Poker session ${index + 1} is not an object.`)
  const { id, date, startTime, endTime, stakes, buyIn, result, amount } = raw
  if (typeof id !== 'string' || id.length === 0) throw new Error(`Poker session ${index + 1} is missing an id.`)
  if (typeof date !== 'string' || !DATE_RE.test(date)) throw new Error(`Poker session ${index + 1} has an invalid date.`)
  if (typeof startTime !== 'string' || typeof endTime !== 'string' || typeof stakes !== 'string')
    throw new Error(`Poker session ${index + 1} has invalid time or stakes fields.`)
  if (typeof buyIn !== 'number' || !Number.isFinite(buyIn) || typeof amount !== 'number' || !Number.isFinite(amount))
    throw new Error(`Poker session ${index + 1} has invalid amounts.`)
  if (result !== 'win' && result !== 'loss') throw new Error(`Poker session ${index + 1} has an invalid result.`)
  return { id, date, startTime, endTime, stakes, buyIn, result, amount }
}

export function parseImportPayload(text: string): ExportPayloadV1 {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This is not a valid JSON export file.')
  }
  if (!isRecord(raw)) throw new Error('This is not a valid JSON export file.')
  if (raw.schemaVersion !== 1) throw new Error('Unsupported export version — expected version 1.')
  if (!Array.isArray(raw.entries)) throw new Error('The export has no entries list.')
  if (!Array.isArray(raw.pokerSessions)) throw new Error('The export has no poker sessions list.')
  const settings = isRecord(raw.settings) ? raw.settings : {}
  return {
    schemaVersion: 1,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    entries: raw.entries.map(parseEntry),
    pokerSessions: raw.pokerSessions.map(parsePokerSession),
    settings: {
      budgetConfig: isRecord(settings.budgetConfig) ? (settings.budgetConfig as unknown as BudgetConfig) : undefined,
      customCategories: Array.isArray(settings.customCategories) ? (settings.customCategories as CustomCategory[]) : undefined,
      categoryOverrides: isRecord(settings.categoryOverrides) ? (settings.categoryOverrides as CategoryOverrides) : undefined,
      customStakes: Array.isArray(settings.customStakes) ? (settings.customStakes as string[]).filter(s => typeof s === 'string') : undefined,
      theme: typeof settings.theme === 'string' ? settings.theme : undefined,
    },
  }
}

export interface ImportResult {
  newEntries: number
  newPokerSessions: number
}

export async function applyImport(payload: ExportPayloadV1): Promise<ImportResult> {
  const { settings } = payload
  if (settings.budgetConfig) saveBudgetConfig(settings.budgetConfig)
  if (settings.customCategories) saveCustomCategories(settings.customCategories)
  if (settings.categoryOverrides) saveCategoryOverrides(settings.categoryOverrides)
  if (settings.customStakes) saveCustomStakes(settings.customStakes)
  if (settings.theme) localStorage.setItem(THEME_STORAGE_KEY, settings.theme)

  // Server first: if this throws (offline/auth), local caches are untouched and a retry is safe.
  if (payload.entries.length > 0) await bulkUpsertEntries(payload.entries)
  if (payload.pokerSessions.length > 0) await bulkUpsertPokerSessions(payload.pokerSessions)

  const cachedEntries = getCachedEntries()
  const knownEntryIds = new Set(cachedEntries.map(e => e.id))
  const newEntries = payload.entries.filter(e => !knownEntryIds.has(e.id))
  if (newEntries.length > 0) setCachedEntries([...cachedEntries, ...newEntries])

  const cachedSessions = getPokerSessions()
  const knownSessionIds = new Set(cachedSessions.map(s => s.id))
  const newSessions = payload.pokerSessions.filter(s => !knownSessionIds.has(s.id))
  if (newSessions.length > 0) savePokerSessions([...cachedSessions, ...newSessions])

  return { newEntries: newEntries.length, newPokerSessions: newSessions.length }
}
