// src/storage.ts
import type {
  Entry,
  BudgetConfig,
  CategoryOverrides,
  PokerSession,
  CustomCategory,
  CurrencyCode,
  WalletMap,
  WalletSnapshot,
} from './types'
import { DEFAULT_BUDGET } from './types'
import { getUserStorageItem, setUserStorageItem } from './userStorage'
import { DEFAULT_CURRENCY, normalizeCurrencyCode } from './shared/currency'

export { activateUserStorage } from './userStorage'

const ENTRIES_KEY = 'budget_entries'
const CONFIG_KEY = 'budget_config'
const CUSTOM_CATEGORIES_KEY = 'budget_custom_categories'
const CATEGORY_OVERRIDES_KEY = 'budget_category_overrides'
const WALLETS_KEY = 'budget_wallets_v2'
const ACTIVE_CURRENCY_KEY = 'budget_active_currency'

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

function getLegacyBudgetConfig(): BudgetConfig {
  try {
    const raw = getUserStorageItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_BUDGET }

    const parsed = { ...DEFAULT_BUDGET, ...(JSON.parse(raw) as Partial<BudgetConfig>) }
    return { ...parsed, others: parsed.buffer }
  } catch {
    return { ...DEFAULT_BUDGET }
  }
}

function getLegacyCustomCategories(): CustomCategory[] {
  try {
    const raw = getUserStorageItem(CUSTOM_CATEGORIES_KEY)
    return raw ? (JSON.parse(raw) as CustomCategory[]) : []
  } catch {
    return []
  }
}

function getLegacyCategoryOverrides(): CategoryOverrides {
  try {
    const raw = getUserStorageItem(CATEGORY_OVERRIDES_KEY)
    return raw ? (JSON.parse(raw) as CategoryOverrides) : {}
  } catch {
    return {}
  }
}

function validWalletSnapshot(value: unknown): value is WalletSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const snapshot = value as Partial<WalletSnapshot>
  return Boolean(snapshot.config && Array.isArray(snapshot.customCategories) && snapshot.overrides)
}

function readStoredWalletMap(): WalletMap | null {
  try {
    const raw = getUserStorageItem(WALLETS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const wallets: WalletMap = {}
    for (const [rawCode, value] of Object.entries(parsed)) {
      const code = normalizeCurrencyCode(rawCode)
      if (code && validWalletSnapshot(value)) wallets[code] = value
    }
    return Object.keys(wallets).length > 0 ? wallets : null
  } catch {
    return null
  }
}

export function getWalletMap(): WalletMap {
  return readStoredWalletMap() ?? {
    [DEFAULT_CURRENCY]: {
      config: getLegacyBudgetConfig(),
      customCategories: getLegacyCustomCategories(),
      overrides: getLegacyCategoryOverrides(),
    },
  }
}

export function saveWalletMap(wallets: WalletMap): void {
  setUserStorageItem(WALLETS_KEY, JSON.stringify(wallets))
  // Keep the original SGD keys as a compatibility mirror for older installs and
  // backups. Wallet-aware reads use the map; legacy code continues to see SGD.
  const sgd = wallets[DEFAULT_CURRENCY]
  if (sgd) {
    setUserStorageItem(CONFIG_KEY, JSON.stringify(sgd.config))
    setUserStorageItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(sgd.customCategories))
    setUserStorageItem(CATEGORY_OVERRIDES_KEY, JSON.stringify(sgd.overrides))
  }
}

export function getActiveCurrency(wallets: WalletMap = getWalletMap()): CurrencyCode {
  const stored = normalizeCurrencyCode(getUserStorageItem(ACTIVE_CURRENCY_KEY))
  if (stored && wallets[stored]) return stored
  if (wallets[DEFAULT_CURRENCY]) return DEFAULT_CURRENCY
  return Object.keys(wallets)[0] ?? DEFAULT_CURRENCY
}

export function saveActiveCurrency(currency: CurrencyCode): void {
  const normalized = normalizeCurrencyCode(currency)
  if (!normalized) throw new TypeError('Currency must be a three-letter code')
  setUserStorageItem(ACTIVE_CURRENCY_KEY, normalized)
}

export function getBudgetConfig(currency?: CurrencyCode): BudgetConfig {
  const storedWallets = readStoredWalletMap()
  if (!storedWallets) return getLegacyBudgetConfig()
  const code = normalizeCurrencyCode(currency) ?? getActiveCurrency(storedWallets)
  return storedWallets[code]?.config ?? { ...DEFAULT_BUDGET }
}

export function saveBudgetConfig(config: BudgetConfig): void {
  setUserStorageItem(CONFIG_KEY, JSON.stringify(config))
}

export function getCustomCategories(): CustomCategory[] {
  const storedWallets = readStoredWalletMap()
  if (storedWallets) return storedWallets[getActiveCurrency(storedWallets)]?.customCategories ?? []
  return getLegacyCustomCategories()
}

export function saveCustomCategories(categories: CustomCategory[]): void {
  setUserStorageItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories))
}

// Display overrides (rename / re-icon) for the built-in basic categories.
export function getCategoryOverrides(): CategoryOverrides {
  const storedWallets = readStoredWalletMap()
  if (storedWallets) return storedWallets[getActiveCurrency(storedWallets)]?.overrides ?? {}
  return getLegacyCategoryOverrides()
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
