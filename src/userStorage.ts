const ACTIVE_USER_KEY = 'budget_active_user_id'
const LEGACY_OWNER_KEY = 'budget_legacy_storage_owner'

const activeUserListeners = new Set<() => void>()

const USER_SCOPED_KEYS = [
  'budget_entries',
  'budget_config',
  'budget_custom_categories',
  'budget_category_overrides',
  'poker_sessions',
  'poker_custom_stakes',
  'sync_queue',
  'budget_onboarding_version',
] as const

function recordedMigrationOwners(): string[] {
  const prefix = 'supabase_migration_done:'
  const owners = new Set<string>()
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(prefix) && localStorage.getItem(key)) owners.add(key.slice(prefix.length))
  }
  return [...owners]
}

function hasLegacyData(): boolean {
  return USER_SCOPED_KEYS.some(key => localStorage.getItem(key) !== null)
}

function resolveLegacyOwner(userId: string): string | null {
  const recorded = localStorage.getItem(LEGACY_OWNER_KEY)
  if (recorded) return recorded

  const migratedOwners = recordedMigrationOwners()
  const owner = migratedOwners.length === 1
    ? migratedOwners[0]
    : hasLegacyData() ? null : userId
  if (owner) localStorage.setItem(LEGACY_OWNER_KEY, owner)
  return owner
}

/**
 * Selects the local namespace for the authenticated user. Existing unscoped data is copied only
 * when a previous migration flag proves which uid owned it; ambiguous legacy data stays untouched.
 */
export function activateUserStorage(userId: string): boolean {
  if (!userId) throw new Error('A user id is required to activate local storage')
  const changed = localStorage.getItem(ACTIVE_USER_KEY) !== userId
  const legacyOwner = resolveLegacyOwner(userId)

  if (legacyOwner === userId) {
    for (const key of USER_SCOPED_KEYS) {
      const legacyValue = localStorage.getItem(key)
      const scopedKey = `${key}:${userId}`
      if (legacyValue !== null && localStorage.getItem(scopedKey) === null) {
        localStorage.setItem(scopedKey, legacyValue)
      }
    }
  }

  localStorage.setItem(ACTIVE_USER_KEY, userId)
  if (changed) activeUserListeners.forEach(listener => listener())
  return changed
}

export function subscribeActiveUser(listener: () => void): () => void {
  activeUserListeners.add(listener)
  return () => activeUserListeners.delete(listener)
}

export function getActiveStorageUserId(): string | null {
  return localStorage.getItem(ACTIVE_USER_KEY)
}

export function userStorageKey(baseKey: string): string {
  const userId = getActiveStorageUserId()
  return userId ? `${baseKey}:${userId}` : baseKey
}

export function getUserStorageItem(baseKey: string): string | null {
  const userId = getActiveStorageUserId()
  if (!userId) return localStorage.getItem(baseKey)
  return localStorage.getItem(`${baseKey}:${userId}`)
}

export function setUserStorageItem(baseKey: string, value: string): void {
  const userId = getActiveStorageUserId()
  if (!userId) {
    localStorage.setItem(baseKey, value)
    return
  }
  localStorage.setItem(`${baseKey}:${userId}`, value)
  // Keep the proven owner's legacy key current as an additive rollback path. Other users never
  // read this key after activation, so it cannot cross account boundaries.
  if (localStorage.getItem(LEGACY_OWNER_KEY) === userId) localStorage.setItem(baseKey, value)
}

export function removeUserStorageItem(baseKey: string): void {
  const userId = getActiveStorageUserId()
  if (!userId) {
    localStorage.removeItem(baseKey)
    return
  }
  localStorage.removeItem(`${baseKey}:${userId}`)
  if (localStorage.getItem(LEGACY_OWNER_KEY) === userId) localStorage.removeItem(baseKey)
}
