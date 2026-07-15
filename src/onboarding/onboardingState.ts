import { getUserStorageItem, setUserStorageItem } from '../userStorage'

export const BUDGET_ONBOARDING_VERSION = '1'
const ONBOARDING_KEY = 'budget_onboarding_version'

export function completeBudgetOnboarding(): void {
  setUserStorageItem(ONBOARDING_KEY, BUDGET_ONBOARDING_VERSION)
}

export function shouldShowBudgetOnboarding(bypass = false): boolean {
  if (bypass || getUserStorageItem(ONBOARDING_KEY) === BUDGET_ONBOARDING_VERSION) return false

  // Treat anyone with a saved plan or cached history as an existing user. Shipping onboarding
  // must not suddenly put the current three users back through setup after an update.
  if (getUserStorageItem('budget_config') !== null) return false
  try {
    const entries = JSON.parse(getUserStorageItem('budget_entries') ?? '[]') as unknown
    if (Array.isArray(entries) && entries.length > 0) return false
  } catch {
    // A malformed cache is handled elsewhere; it should not make first-run setup disappear.
  }

  return true
}
