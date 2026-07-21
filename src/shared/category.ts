// .ts extension: reached by the Deno-bundled ingest Edge Function (see shared/entry.ts).
import type { Category, Entry } from '../types.ts'
import { categoryFromSingaporeMerchantPack } from './singaporeMerchantPack.ts'

const CATEGORY_RULES: Array<{ category: Category; keywords: string[] }> = [
  {
    category: 'transport',
    keywords: ['mrt', 'bus', 'transit', 'ez-link', 'simplygo', 'grab', 'gojek', 'comfort', 'cdg', 'taxi', 'ride'],
  },
  {
    category: 'lunch',
    keywords: ['coffee', 'cafe', 'kopi', 'toast', 'restaurant', 'food', 'mcdonald', 'kfc', 'subway', 'hawker', 'kopitiam', 'koufu', 'foodcourt', 'food court', 'canteen', 'meal', 'lunch'],
  },
  {
    category: 'others',
    keywords: ['fairprice', 'ntuc', 'finest', 'cheers', 'cold storage', 'giant', 'sheng siong', 'supermarket', 'grocery', 'guardian', 'watsons'],
  },
]

// Normalize noisy PayNow/card payee labels before applying rules or learning
// from corrections. DBS may append a legal suffix, outlet number, or account
// identifier to the same merchant on different transactions.
export function normalizeCategoryMerchant(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\((?:uen|mobile|account|a\/c)[^)]*\)/gi, ' ')
    .replace(/\b(?:private limited|pte\.?\s*ltd\.?|limited|ltd\.?|llp)\b/gi, ' ')
    .replace(/(?:#|outlet\s*)\d+\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Keyword guess from the merchant/payee text. Returns null when nothing
// matches — the caller decides the fallback. We deliberately do NOT default to
// 'others' here: 'others' is a real budget line, so guessing it silently
// pollutes that category and undercounts the true one (e.g. a PayNow lunch).
export function guessCategory(merchantText: string): Category | null {
  const normalized = normalizeCategoryMerchant(merchantText)
  const merchantPackCategory = categoryFromSingaporeMerchantPack(normalized)
  if (merchantPackCategory) return merchantPackCategory

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => normalized.includes(keyword))) {
      return rule.category
    }
  }
  return null
}

// Ordered categories this merchant was previously filed under: most-frequent first,
// ties broken by most-recent (a fresh correction outranks an old one).
function historyRankedCategories(entries: Entry[], merchant: string): string[] {
  const target = normalizeCategoryMerchant(merchant)
  if (!target) return []

  const stats = new Map<string, { count: number; recent: string }>()
  for (const entry of entries) {
    if (entry.category == null || !entry.merchant) continue
    if (normalizeCategoryMerchant(entry.merchant) !== target) continue
    const recent = entry.occurredAt ?? entry.date
    const current = stats.get(entry.category)
    if (current) {
      current.count += 1
      if (recent > current.recent) current.recent = recent
    } else {
      stats.set(entry.category, { count: 1, recent })
    }
  }

  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].recent.localeCompare(a[1].recent))
    .map(([category]) => category)
}

// Learn from the user's own history: if they have categorized this same payee
// before, reuse that category. Most frequent wins, ties broken by most recent
// (so a fresh correction takes effect). Entries with no category or a different
// merchant are ignored. Returns null when there's nothing to learn from.
export function categoryFromHistory(entries: Entry[], merchant: string): string | null {
  return historyRankedCategories(entries, merchant)[0] ?? null
}

// Categories the user files most often overall (across all categorized entries):
// most-frequent first, ties broken by most-recent.
function globallyPopularCategories(entries: Entry[]): string[] {
  const stats = new Map<string, { count: number; recent: string }>()
  for (const entry of entries) {
    if (entry.category == null) continue
    const recent = entry.occurredAt ?? entry.date
    const current = stats.get(entry.category)
    if (current) {
      current.count += 1
      if (recent > current.recent) current.recent = recent
    } else {
      stats.set(entry.category, { count: 1, recent })
    }
  }

  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].recent.localeCompare(a[1].recent))
    .map(([category]) => category)
}

// Rank up to `limit` category ids to suggest for an uncategorized entry, filling from four
// sources in priority order and never repeating or returning an id outside `candidateIds`:
//   1. this merchant's own history   2. keyword / merchant-pack guess
//   3. the user's globally most-used categories   4. candidateIds order (true zero-state)
export function rankCategoriesForMerchant(
  entries: Entry[],
  merchant: string | null,
  candidateIds: string[],
  limit = 3,
): string[] {
  const result: string[] = []
  const candidateSet = new Set(candidateIds)
  const add = (id: string | null): void => {
    if (id == null || result.length >= limit) return
    if (!candidateSet.has(id) || result.includes(id)) return
    result.push(id)
  }

  if (merchant) {
    for (const id of historyRankedCategories(entries, merchant)) add(id)
    add(guessCategory(merchant))
  }
  for (const id of globallyPopularCategories(entries)) add(id)
  for (const id of candidateIds) add(id)

  return result
}
