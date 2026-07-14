import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUser, serviceClient, signedInUser, type TestUser } from './harness'

let alice: TestUser
let bob: TestUser
let budgetId: string
let inviteCode: string
let aliceEntryId: string
const oracle = serviceClient()

beforeAll(async () => {
  alice = await signedInUser()
  bob = await signedInUser()

  const { data: budget, error } = await alice.client
    .from('budgets')
    .insert({ name: 'Household', owner_id: alice.id })
    .select()
    .single()
  expect(error).toBeNull()
  budgetId = budget!.id
  inviteCode = budget!.invite_code

  aliceEntryId = randomUUID()
  const entry = await alice.client.from('shared_entries').insert({
    id: aliceEntryId,
    budget_id: budgetId,
    user_id: alice.id,
    amount: 40,
    note: 'groceries',
    date: '2026-07-14',
  })
  expect(entry.error).toBeNull()

  const category = await alice.client
    .from('shared_categories')
    .insert({ budget_id: budgetId, label: 'groceries' })
  expect(category.error).toBeNull()
})

afterAll(async () => {
  const { error } = await oracle.from('budgets').delete().eq('id', budgetId)
  if (error) throw error
  await deleteUser(alice)
  await deleteUser(bob)
})

describe('shared budgets — a non-member sees nothing', () => {
  it('hides the budget itself', async () => {
    const { data, error } = await bob.client.from('budgets').select('id').eq('id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('hides its entries', async () => {
    const { data, error } = await bob.client
      .from('shared_entries')
      .select('id')
      .eq('budget_id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('hides its categories', async () => {
    const { data, error } = await bob.client
      .from('shared_categories')
      .select('id')
      .eq('budget_id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('hides its membership rows', async () => {
    const { data, error } = await bob.client
      .from('budget_members')
      .select('user_id')
      .eq('budget_id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("hides Alice's profile while they share no budget", async () => {
    const { data, error } = await bob.client.from('profiles').select('id').eq('id', alice.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('shared budgets — a non-member cannot write', () => {
  it('rejects inserting an entry into a budget they are not in', async () => {
    const id = randomUUID()
    const { error } = await bob.client.from('shared_entries').insert({
      id,
      budget_id: budgetId,
      user_id: bob.id,
      amount: 1,
      note: 'intruder',
      date: '2026-07-14',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('shared_entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(0)
  })

  it("silently no-ops an update of Alice's entry and leaves it intact", async () => {
    const { data, error } = await bob.client
      .from('shared_entries')
      .update({ amount: 9999 })
      .eq('id', aliceEntryId)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: row } = await oracle
      .from('shared_entries')
      .select('amount')
      .eq('id', aliceEntryId)
      .single()
    expect(Number(row!.amount)).toBe(40)
  })

  it("silently no-ops a delete of Alice's entry and leaves it present", async () => {
    const { data, error } = await bob.client
      .from('shared_entries')
      .delete()
      .eq('id', aliceEntryId)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { count } = await oracle
      .from('shared_entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', aliceEntryId)
    expect(count).toBe(1)
  })

  it('cannot delete the owner out of her own budget', async () => {
    const { data, error } = await bob.client
      .from('budget_members')
      .delete()
      .eq('budget_id', budgetId)
      .eq('user_id', alice.id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { count } = await oracle
      .from('budget_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('budget_id', budgetId)
      .eq('user_id', alice.id)
    expect(count).toBe(1)
  })
})

describe('shared budgets — the owner can use her own budget', () => {
  it('reads her budget, its entries, its categories and its members', async () => {
    const budget = await alice.client.from('budgets').select('id').eq('id', budgetId)
    expect(budget.data).toHaveLength(1)

    const entries = await alice.client
      .from('shared_entries')
      .select('id')
      .eq('budget_id', budgetId)
    expect(entries.data).toHaveLength(1)

    const categories = await alice.client
      .from('shared_categories')
      .select('id')
      .eq('budget_id', budgetId)
    expect(categories.data).toHaveLength(1)

    const members = await alice.client
      .from('budget_members')
      .select('user_id')
      .eq('budget_id', budgetId)
    expect(members.data).toHaveLength(1)
    expect(members.data![0].user_id).toBe(alice.id)
  })
})
