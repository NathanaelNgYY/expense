import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getBudgetConfig,
  getCategoryOverrides,
  getCustomCategories,
  saveBudgetConfig,
  saveCategoryOverrides,
  saveCustomCategories,
} from './storage'
import type { BudgetConfig, CategoryOverrides, CustomCategory } from './types'
import { subscribeActiveUser } from './userStorage'

interface BudgetSnapshot {
  config: BudgetConfig
  customCategories: CustomCategory[]
  overrides: CategoryOverrides
}

interface BudgetConfigContextValue extends BudgetSnapshot {
  saveConfig: (config: BudgetConfig) => void
  saveCustomCategories: (categories: CustomCategory[]) => void
  saveOverrides: (overrides: CategoryOverrides) => void
  saveBudgets: (snapshot: BudgetSnapshot) => void
  reload: () => void
}

function readSnapshot(): BudgetSnapshot {
  return {
    config: getBudgetConfig(),
    customCategories: getCustomCategories(),
    overrides: getCategoryOverrides(),
  }
}

const BudgetConfigContext = createContext<BudgetConfigContextValue | null>(null)

export function BudgetConfigProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<BudgetSnapshot>(readSnapshot)

  const reload = useCallback(() => {
    setSnapshot(readSnapshot())
  }, [])

  useEffect(() => subscribeActiveUser(reload), [reload])

  const saveConfig = useCallback((config: BudgetConfig) => {
    saveBudgetConfig(config)
    setSnapshot(current => ({ ...current, config }))
  }, [])

  const saveCategories = useCallback((customCategories: CustomCategory[]) => {
    saveCustomCategories(customCategories)
    setSnapshot(current => ({ ...current, customCategories }))
  }, [])

  const saveOverrides = useCallback((overrides: CategoryOverrides) => {
    saveCategoryOverrides(overrides)
    setSnapshot(current => ({ ...current, overrides }))
  }, [])

  const saveBudgets = useCallback((next: BudgetSnapshot) => {
    saveBudgetConfig(next.config)
    saveCustomCategories(next.customCategories)
    saveCategoryOverrides(next.overrides)
    setSnapshot(next)
  }, [])

  return (
    <BudgetConfigContext.Provider value={{
      ...snapshot,
      saveConfig,
      saveCustomCategories: saveCategories,
      saveOverrides,
      saveBudgets,
      reload,
    }}>
      {children}
    </BudgetConfigContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBudgetConfig(): BudgetConfigContextValue {
  const context = useContext(BudgetConfigContext)
  if (!context) throw new Error('useBudgetConfig must be used within BudgetConfigProvider')
  return context
}
