import type { CurrencyCode, Entry } from '../types'

export const DEFAULT_CURRENCY: CurrencyCode = 'SGD'

export interface CurrencyOption {
  code: CurrencyCode
  name: string
}

export const CURATED_CURRENCIES: CurrencyOption[] = [
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'TWD', name: 'New Taiwan dollar' },
  { code: 'VND', name: 'Vietnamese dong' },
]

export function normalizeCurrencyCode(value: unknown): CurrencyCode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

export function entryCurrency(entry: Pick<Entry, 'currency'>): CurrencyCode {
  return normalizeCurrencyCode(entry.currency) ?? DEFAULT_CURRENCY
}

export function entriesForCurrency(entries: Entry[], currency: CurrencyCode): Entry[] {
  const normalized = normalizeCurrencyCode(currency) ?? DEFAULT_CURRENCY
  return entries.filter(entry => entryCurrency(entry) === normalized)
}

export function unconfiguredCurrencyCounts(
  entries: Entry[],
  configuredCurrencies: CurrencyCode[],
): Record<CurrencyCode, number> {
  const configured = new Set(
    configuredCurrencies.map(normalizeCurrencyCode).filter((code): code is string => code !== null),
  )
  const counts: Record<CurrencyCode, number> = {}
  for (const entry of entries) {
    const currency = entryCurrency(entry)
    if (!configured.has(currency)) counts[currency] = (counts[currency] ?? 0) + 1
  }
  return counts
}

export function currencyName(currency: CurrencyCode): string {
  const normalized = normalizeCurrencyCode(currency) ?? currency.trim().toUpperCase()
  return CURATED_CURRENCIES.find(option => option.code === normalized)?.name ?? normalized
}
