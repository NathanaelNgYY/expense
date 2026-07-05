import type { Category, Entry } from '../types'

const CATEGORY_RULES: Array<{ category: Category; keywords: string[] }> = [
  {
    category: 'transport',
    keywords: ['mrt', 'bus', 'transit', 'ez-link', 'simplygo', 'grab', 'gojek', 'comfort', 'cdg', 'taxi', 'ride'],
  },
  {
    category: 'lunch',
    keywords: ['coffee', 'cafe', 'kopi', 'toast', 'restaurant', 'food', 'mcdonald', 'kfc', 'subway', 'hawker', 'kopitiam', 'foodcourt', 'food court', 'canteen', 'meal', 'lunch'],
  },
  {
    category: 'others',
    keywords: ['fairprice', 'ntuc', 'finest', 'cheers', 'cold storage', 'giant', 'sheng siong', 'supermarket', 'grocery', 'guardian', 'watsons'],
  },
]

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Keyword guess from the merchant/payee text. Returns null when nothing
// matches — the caller decides the fallback. We deliberately do NOT default to
// 'others' here: 'others' is a real budget line, so guessing it silently
// pollutes that category and undercounts the true one (e.g. a PayNow lunch).
export function guessCategory(merchantText: string): Category | null {
  const normalized = normalizeText(merchantText)
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => normalized.includes(keyword))) {
      return rule.category
    }
  }
  return null
}

// Learn from the user's own history: if they have categorized this same payee
// before, reuse that category. Most frequent wins, ties broken by most recent
// (so a fresh correction takes effect). Entries with no category or a different
// merchant are ignored. Returns null when there's nothing to learn from.
export function categoryFromHistory(entries: Entry[], merchant: string): string | null {
  const target = normalizeText(merchant)
  if (!target) return null

  const stats = new Map<string, { count: number; recent: string }>()
  for (const entry of entries) {
    if (entry.category == null || !entry.merchant) continue
    if (normalizeText(entry.merchant) !== target) continue
    const recent = entry.occurredAt ?? entry.date
    const current = stats.get(entry.category)
    if (current) {
      current.count += 1
      if (recent > current.recent) current.recent = recent
    } else {
      stats.set(entry.category, { count: 1, recent })
    }
  }

  let best: string | null = null
  let bestStat = { count: 0, recent: '' }
  for (const [category, stat] of stats) {
    if (
      stat.count > bestStat.count ||
      (stat.count === bestStat.count && stat.recent > bestStat.recent)
    ) {
      best = category
      bestStat = stat
    }
  }
  return best
}
