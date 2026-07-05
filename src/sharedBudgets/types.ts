// Client-side (camelCase) shapes for the Supabase shared-budget tables.
// Snake_case row shapes live in sharedApi.ts, which maps rows to these.
export interface Profile {
  id: string
  displayName: string
}

export interface SharedBudget {
  id: string
  name: string
  monthlyLimit: number | null
  currency: string
  inviteCode: string
  ownerId: string
  createdAt: string
}

export interface BudgetMember {
  userId: string
  role: 'owner' | 'member'
  displayName: string
  joinedAt: string
}

export interface SharedCategory {
  id: string
  budgetId: string
  label: string
  budgetAmount: number | null
  icon: string
}

export interface SharedEntry {
  id: string
  budgetId: string
  userId: string
  amount: number
  categoryId: string | null
  note: string
  date: string // YYYY-MM-DD
  createdAt: string
  updatedAt: string
}

export interface NewSharedEntry {
  amount: number
  categoryId: string | null
  note: string
  date: string
}

export interface ActiveBudgetData {
  budget: SharedBudget
  entries: SharedEntry[]
  categories: SharedCategory[]
  members: BudgetMember[]
}
