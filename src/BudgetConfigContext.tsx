import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getActiveCurrency,
  getWalletMap,
  saveActiveCurrency,
  saveWalletMap,
} from './storage'
import type {
  BudgetConfig,
  CategoryOverrides,
  CurrencyCode,
  CustomCategory,
  WalletMap,
  WalletSnapshot,
} from './types'
import { subscribeActiveUser } from './userStorage'
import { normalizeCurrencyCode } from './shared/currency'

interface BudgetSnapshot {
  config: BudgetConfig
  customCategories: CustomCategory[]
  overrides: CategoryOverrides
}

interface BudgetConfigContextValue extends BudgetSnapshot {
  wallets: WalletMap
  currencies: CurrencyCode[]
  activeCurrency: CurrencyCode
  setActiveCurrency: (currency: CurrencyCode) => void
  createWallet: (currency: CurrencyCode, snapshot: WalletSnapshot) => void
  saveConfig: (config: BudgetConfig) => void
  saveCustomCategories: (categories: CustomCategory[]) => void
  saveOverrides: (overrides: CategoryOverrides) => void
  saveBudgets: (snapshot: BudgetSnapshot) => void
  reload: () => void
}

interface WalletState {
  wallets: WalletMap
  activeCurrency: CurrencyCode
}

function readState(): WalletState {
  const wallets = getWalletMap()
  return {
    wallets,
    activeCurrency: getActiveCurrency(wallets),
  }
}

const BudgetConfigContext = createContext<BudgetConfigContextValue | null>(null)

export function BudgetConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(readState)
  const snapshot = state.wallets[state.activeCurrency]
  const persistSnapshot = useCallback((next: WalletSnapshot) => {
    setState(current => {
      const wallets = { ...current.wallets, [current.activeCurrency]: next }
      saveWalletMap(wallets)
      return { ...current, wallets }
    })
  }, [])

  const reload = useCallback(() => {
    setState(readState())
  }, [])

  useEffect(() => subscribeActiveUser(reload), [reload])

  const saveConfig = useCallback((config: BudgetConfig) => {
    persistSnapshot({ ...snapshot, config })
  }, [persistSnapshot, snapshot])

  const saveCategories = useCallback((customCategories: CustomCategory[]) => {
    persistSnapshot({ ...snapshot, customCategories })
  }, [persistSnapshot, snapshot])

  const saveOverrides = useCallback((overrides: CategoryOverrides) => {
    persistSnapshot({ ...snapshot, overrides })
  }, [persistSnapshot, snapshot])

  const saveBudgets = useCallback((next: BudgetSnapshot) => {
    persistSnapshot(next)
  }, [persistSnapshot])

  const setActive = useCallback((currency: CurrencyCode) => {
    const normalized = normalizeCurrencyCode(currency)
    if (!normalized) return
    setState(current => {
      if (!current.wallets[normalized]) return current
      saveActiveCurrency(normalized)
      return { ...current, activeCurrency: normalized }
    })
  }, [])

  const createWallet = useCallback((currency: CurrencyCode, next: WalletSnapshot) => {
    const normalized = normalizeCurrencyCode(currency)
    if (!normalized) throw new TypeError('Currency must be a three-letter code')
    setState(current => {
      const wallets = { ...current.wallets, [normalized]: next }
      saveWalletMap(wallets)
      saveActiveCurrency(normalized)
      return { wallets, activeCurrency: normalized }
    })
  }, [])

  return (
    <BudgetConfigContext.Provider value={{
      ...snapshot,
      wallets: state.wallets,
      currencies: Object.keys(state.wallets),
      activeCurrency: state.activeCurrency,
      setActiveCurrency: setActive,
      createWallet,
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
