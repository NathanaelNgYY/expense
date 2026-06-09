import type { Category } from '../types'

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

export function guessCategory(merchantText: string): Category {
  const normalized = normalizeText(merchantText)
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => normalized.includes(keyword))) {
      return rule.category
    }
  }
  return 'others'
}
