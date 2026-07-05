import { sgtDateString } from '../shared/sgtDate'
import type { BudgetMember, SharedEntry } from './types'

export interface MemberTotal {
  userId: string
  displayName: string
  total: number
}

export function currentSgtMonth(): string {
  return sgtDateString(new Date().toISOString()).slice(0, 7)
}

export function entriesForMonth(entries: SharedEntry[], month: string): SharedEntry[] {
  return entries.filter(e => e.date.startsWith(month))
}

export function totalSpent(entries: SharedEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0)
}

export function computeMemberTotals(entries: SharedEntry[], members: BudgetMember[]): MemberTotal[] {
  const byUser = new Map<string, number>()
  for (const e of entries) byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + e.amount)
  return members
    .map(m => ({ userId: m.userId, displayName: m.displayName, total: byUser.get(m.userId) ?? 0 }))
    .sort((a, b) => b.total - a.total)
}
