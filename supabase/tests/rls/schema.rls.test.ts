import { describe, expect, it } from 'vitest'
import { deleteUser, serviceClient, signedInUser } from './harness'

const TABLES = [
  'entries',
  'poker_sessions',
  'ingest_tokens',
  'ingest_status',
  'automatic_category_preferences',
  'profiles',
  'budgets',
  'budget_members',
  'shared_categories',
  'shared_entries',
] as const

describe('local stack schema', () => {
  it.each(TABLES)('applied the migration that creates %s', async (table) => {
    // The oracle bypasses RLS, so reaching the table at all proves it exists.
    const { error } = await serviceClient().from(table).select('*').limit(0)
    expect(error).toBeNull()
  })

  it('creates a profile row for a new user via the handle_new_user trigger', async () => {
    const user = await signedInUser()
    try {
      const { data, error } = await serviceClient()
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      expect(error).toBeNull()
      expect(data!.id).toBe(user.id)
    } finally {
      await deleteUser(user)
    }
  })
})
