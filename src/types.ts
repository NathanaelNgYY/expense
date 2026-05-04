// src/types.ts
export type Category = 'lunch' | 'transport' | 'savings' | 'investments'

export interface Entry {
  id: string
  amount: number
  category: Category | null
  note: string
  date: string // YYYY-MM-DD
}

export interface BudgetConfig {
  lunch: number
  transport: number
  savings: number
  investments: number
  buffer: number
}

export const DEFAULT_BUDGET: BudgetConfig = {
  lunch: 264,
  transport: 50,
  savings: 400,
  investments: 250,
  buffer: 236,
}

export const CATEGORY_LABELS: Record<Category, string> = {
  lunch: '🍱 Lunch',
  transport: '🚆 Transport',
  savings: '🏦 Savings',
  investments: '📈 Investments',
}

export const CATEGORIES: Category[] = ['lunch', 'transport', 'savings', 'investments']
