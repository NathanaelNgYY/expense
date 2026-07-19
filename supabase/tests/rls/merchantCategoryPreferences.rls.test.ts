import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, deleteUser, serviceClient, signedInUser, type TestUser } from './harness'

let alice: TestUser
let bob: TestUser

beforeAll(async () => {
  alice = await signedInUser()
  bob = await signedInUser()
})

afterAll(async () => {
  await deleteUser(alice)
  await deleteUser(bob)
})

describe('merchant_category_preferences RLS', () => {
  it('lets a user manage only their own learned merchant rules', async () => {
    const inserted = await alice.client.from('merchant_category_preferences').insert({
      user_id: alice.id,
      normalized_merchant: 'mystery noodles',
      merchant_label: 'Mystery Noodles Pte Ltd',
      category_id: 'cat_dinner',
    })
    expect(inserted.error).toBeNull()

    const { data: own } = await alice.client.from('merchant_category_preferences').select('category_id')
    expect(own).toEqual([{ category_id: 'cat_dinner' }])

    const { data: hidden } = await bob.client.from('merchant_category_preferences').select('category_id')
    expect(hidden).toEqual([])
  })

  it('rejects cross-user and anonymous access while allowing the ingest service role', async () => {
    const claimed = await bob.client.from('merchant_category_preferences').insert({
      user_id: alice.id,
      normalized_merchant: 'claimed merchant',
      merchant_label: 'Claimed Merchant',
      category_id: 'lunch',
    })
    expect(claimed.error?.code).toBe('42501')

    const anonymous = await anonClient().from('merchant_category_preferences').select('category_id')
    expect(anonymous.error?.code).toBe('42501')

    const trusted = await serviceClient().from('merchant_category_preferences').select('category_id').limit(1)
    expect(trusted.error).toBeNull()
  })
})
