import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, deleteUser, serviceClient, signedInUser, type TestUser } from './harness'

let alice: TestUser
let bob: TestUser
const oracle = serviceClient()

beforeAll(async () => {
  alice = await signedInUser()
  bob = await signedInUser()
})

afterAll(async () => {
  await deleteUser(alice)
  await deleteUser(bob)
})

const dinnerRules = [{ id: 'dinner', categoryId: 'cat_dinner', startMinute: 990, endMinute: 1440 }]

describe('automatic_category_preferences RLS', () => {
  it('lets a user create, read and update only their own preferences', async () => {
    const inserted = await alice.client.from('automatic_category_preferences').insert({
      user_id: alice.id,
      food_time_rules: dinnerRules,
    })
    expect(inserted.error).toBeNull()

    const { data: own } = await alice.client.from('automatic_category_preferences').select('food_time_rules')
    expect(own).toHaveLength(1)

    const { data: hidden } = await bob.client.from('automatic_category_preferences').select('user_id')
    expect(hidden).toEqual([])

    const updated = await alice.client
      .from('automatic_category_preferences')
      .update({ food_time_rules: [] })
      .eq('user_id', alice.id)
      .select()
    expect(updated.data).toHaveLength(1)
  })

  it('rejects a preference row that claims another user as owner', async () => {
    const { error } = await bob.client.from('automatic_category_preferences').insert({
      user_id: alice.id,
      food_time_rules: dinnerRules,
    })
    expect(error?.code).toBe('42501')
  })

  it('denies anonymous access', async () => {
    const { error } = await anonClient().from('automatic_category_preferences').select('user_id')
    expect(error?.code).toBe('42501')
  })

  it('remains readable by the trusted ingest service role', async () => {
    const { error } = await oracle.from('automatic_category_preferences').select('food_time_rules').limit(1)
    expect(error).toBeNull()
  })
})
