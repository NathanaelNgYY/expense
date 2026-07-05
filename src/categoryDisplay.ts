// src/categoryDisplay.ts
// Single source of truth for how a category id renders (label + icon), so a rename
// applied in Settings shows up consistently everywhere (Add Entry, Dashboard, History,
// Insights). Basic category ids never change — only their display is overridden.
import type { Category, CategoryOverrides, CustomCategory } from './types'
import { CATEGORIES, CATEGORY_LABELS } from './types'

const BASIC_IDS = new Set<string>(CATEGORIES)

// Resolve a category id to its display label.
// Precedence: user override → built-in default → custom category → raw id.
export function categoryLabel(
  id: string,
  overrides: CategoryOverrides = {},
  custom: CustomCategory[] = [],
): string {
  const override = overrides[id as Category]?.label
  if (override) return override
  const builtIn = (CATEGORY_LABELS as Record<string, string>)[id]
  if (builtIn) return builtIn
  return custom.find(c => c.id === id)?.label ?? id
}

// Resolve a category id to its icon name (a key BudgetIcon understands).
// Basic categories use their id as the icon name unless overridden.
export function categoryIcon(
  id: string,
  overrides: CategoryOverrides = {},
  custom: CustomCategory[] = [],
): string {
  const override = overrides[id as Category]?.icon
  if (override) return override
  if (BASIC_IDS.has(id)) return id
  return custom.find(c => c.id === id)?.icon ?? id
}

// The full personal category picker list (basics first, then custom), with overrides
// applied. Used by the Add Entry and History pickers.
export function buildCategoryOptions(
  overrides: CategoryOverrides = {},
  custom: CustomCategory[] = [],
): { id: string; label: string; icon: string }[] {
  return [
    ...CATEGORIES.map(id => ({
      id: id as string,
      label: categoryLabel(id, overrides, custom),
      icon: categoryIcon(id, overrides, custom),
    })),
    ...custom.map(c => ({ id: c.id, label: c.label, icon: c.icon })),
  ]
}
