import { toLocalDateString } from './dates'
import type { Category, Entry } from './types'

export type ApplePayImportError = 'missing-amount' | 'invalid-amount' | 'invalid-date'

export interface ApplePayImportPayload {
  amount: number
  merchant: string
  name: string
  note: string
  date: string
  category: Category
  importKey: string
}

export type ApplePayImportResult =
  | { ok: true; payload: ApplePayImportPayload }
  | { ok: false; reason: ApplePayImportError }

const CATEGORY_RULES: Array<{ category: Category; keywords: string[] }> = [
  {
    category: 'transport',
    keywords: [
      'mrt',
      'bus',
      'transit',
      'ez-link',
      'simplygo',
      'grab',
      'gojek',
      'comfort',
      'cdg',
      'taxi',
      'ride',
    ],
  },
  {
    category: 'lunch',
    keywords: [
      'coffee',
      'cafe',
      'kopi',
      'toast',
      'restaurant',
      'food',
      'mcdonald',
      'kfc',
      'subway',
      'hawker',
      'kopitiam',
      'foodcourt',
      'food court',
      'canteen',
      'meal',
      'lunch',
    ],
  },
  {
    category: 'others',
    keywords: [
      'fairprice',
      'ntuc',
      'finest',
      'cheers',
      'cold storage',
      'giant',
      'sheng siong',
      'supermarket',
      'grocery',
      'guardian',
      'watsons',
    ],
  },
]

function cleanText(value: string | null): string {
  return (value ?? '').trim()
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeImportPart(value: string): string {
  return (
    normalizeText(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'apple-pay'
  )
}

function parseAmount(value: string): number {
  const cleaned = value
    .replace(/s\$/gi, '')
    .replace(/sgd/gi, '')
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .trim()

  return Number(cleaned)
}

function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(year, month - 1, day)

  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  )
}

export function guessApplePayCategory(merchantText: string): Category {
  const normalized = normalizeText(merchantText)

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => normalized.includes(keyword))) {
      return rule.category
    }
  }

  return 'others'
}

export function parseApplePayImport(
  params: URLSearchParams,
  referenceDate = new Date(),
): ApplePayImportResult {
  const amountText = cleanText(params.get('amount'))

  if (!amountText) {
    return { ok: false, reason: 'missing-amount' }
  }

  const amount = Math.round(parseAmount(amountText) * 100) / 100

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }

  const dateText = cleanText(params.get('date'))

  if (dateText && !isValidDateString(dateText)) {
    return { ok: false, reason: 'invalid-date' }
  }

  const merchant = cleanText(params.get('merchant'))
  const name = cleanText(params.get('name'))
  const note = merchant || name || 'Apple Pay'
  const date = dateText || toLocalDateString(referenceDate)
  const category = guessApplePayCategory(`${merchant} ${name}`)
  const importKey = `apple-pay:${date}:${amount.toFixed(2)}:${normalizeImportPart(note)}`

  return {
    ok: true,
    payload: {
      amount,
      merchant,
      name,
      note,
      date,
      category,
      importKey,
    },
  }
}

export function alreadyImported(entries: Entry[], importKey: string): boolean {
  return entries.some(entry => entry.importKey === importKey)
}

export function buildApplePayEntry(payload: ApplePayImportPayload, id: string = crypto.randomUUID()): Entry {
  return {
    id,
    amount: payload.amount,
    category: payload.category,
    note: payload.note,
    date: payload.date,
    source: 'apple-pay',
    importKey: payload.importKey,
  }
}
