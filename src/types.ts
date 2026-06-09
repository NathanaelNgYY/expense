// src/types.ts
export type Category = 'lunch' | 'transport' | 'savings' | 'investments' | 'others'
export type EntrySource = 'manual' | 'apple-pay' | 'dbs-email'

export interface Entry {
  id: string
  amount: number
  category: Category | null
  note: string
  date: string // YYYY-MM-DD (local SGT date used by all budget computations)
  source?: EntrySource
  importKey?: string // legacy; superseded by dedupeKey
  merchant?: string
  occurredAt?: string // ISO 8601 timestamp
  currency?: string // e.g. "SGD"
  dedupeKey?: string
}

export interface BudgetConfig {
  monthlyIncome: number
  lunch: number
  transport: number
  savings: number
  investments: number
  others: number
  buffer: number
}

export const DEFAULT_BUDGET: BudgetConfig = {
  monthlyIncome: 1200,
  lunch: 264,
  transport: 50,
  savings: 400,
  investments: 250,
  buffer: 236,
  others: 236,
}

export const CATEGORY_LABELS: Record<Category, string> = {
  lunch: 'Lunch',
  transport: 'Transport',
  savings: 'Savings',
  investments: 'Investments',
  others: 'Others',
}

export const CATEGORIES: Category[] = ['lunch', 'transport', 'others', 'savings', 'investments']

export interface PokerSession {
  id: string
  date: string
  startTime: string
  endTime: string
  stakes: string
  buyIn: number
  result: 'win' | 'loss'
  amount: number
}
