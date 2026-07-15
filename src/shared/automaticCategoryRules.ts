import type { Entry } from '../types.ts'
import { categoryFromHistory, guessCategory, normalizeCategoryMerchant } from './category.ts'

export interface AutomaticCategoryRule {
  id: string
  categoryId: string
  startMinute: number
  endMinute: number
}

const MAX_RULES = 8
const MAX_ID_LENGTH = 100
const MAX_CATEGORY_ID_LENGTH = 128

function isRule(value: unknown): value is AutomaticCategoryRule {
  if (!value || typeof value !== 'object') return false
  const rule = value as Record<string, unknown>
  return typeof rule.id === 'string' && rule.id.length > 0 && rule.id.length <= MAX_ID_LENGTH
    && typeof rule.categoryId === 'string' && rule.categoryId.length > 0 && rule.categoryId.length <= MAX_CATEGORY_ID_LENGTH
    && Number.isInteger(rule.startMinute) && Number(rule.startMinute) >= 0 && Number(rule.startMinute) < 1440
    && Number.isInteger(rule.endMinute) && Number(rule.endMinute) >= 0 && Number(rule.endMinute) <= 1440
    && rule.startMinute !== rule.endMinute
}

export function isAutomaticCategoryRuleList(value: unknown): value is AutomaticCategoryRule[] {
  return Array.isArray(value) && value.length <= MAX_RULES && value.every(isRule)
}

function singaporeMinute(iso: string): number | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null
}

export function ruleIncludesTime(rule: AutomaticCategoryRule, occurredAt: string): boolean {
  const minute = singaporeMinute(occurredAt)
  if (minute == null) return false
  if (rule.startMinute < rule.endMinute) {
    return minute >= rule.startMinute && minute < rule.endMinute
  }
  return minute >= rule.startMinute || minute < rule.endMinute
}

function matchingRule(
  rules: AutomaticCategoryRule[],
  merchant: string,
  occurredAt: string | undefined,
): AutomaticCategoryRule | null {
  if (!occurredAt || guessCategory(merchant) !== 'lunch') return null
  return rules.find(rule => ruleIncludesTime(rule, occurredAt)) ?? null
}

// Explicit corrections remain strongest. For recognized food merchants with a
// configured time window, only corrections from that same window compete with
// the configured category, so a lunch correction cannot swallow dinner.
export function resolveAutomaticCategory(
  entries: Entry[],
  rules: AutomaticCategoryRule[],
  merchant: string,
  occurredAt?: string,
): string | null {
  const rule = matchingRule(rules, merchant, occurredAt)
  if (!rule) return categoryFromHistory(entries, merchant)

  const target = normalizeCategoryMerchant(merchant)
  const sameWindowHistory = entries.filter(entry =>
    entry.category != null
      && entry.merchant
      && normalizeCategoryMerchant(entry.merchant) === target
      && entry.occurredAt
      && ruleIncludesTime(rule, entry.occurredAt),
  )
  return categoryFromHistory(sameWindowHistory, merchant) ?? rule.categoryId
}
