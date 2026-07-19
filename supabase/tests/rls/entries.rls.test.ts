import { randomUUID } from 'node:crypto'
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

/** Inserts a row owned by Alice and returns its id. */
async function aliceEntry(amount = 12.5): Promise<string> {
  const id = randomUUID()
  const { error } = await alice.client.from('entries').insert({
    id,
    user_id: alice.id,
    amount,
    category: 'lunch',
    note: 'alice lunch',
    date: '2026-07-14',
    dedupe_key: `alice-${id}`,
  })
  expect(error).toBeNull()
  return id
}

describe('entries RLS', () => {
  it('lets a user read, update and delete their own entry', async () => {
    const id = await aliceEntry()

    const { data: read } = await alice.client.from('entries').select('id').eq('id', id)
    expect(read).toHaveLength(1)

    const { data: updated } = await alice.client
      .from('entries')
      .update({ amount: 20, kind: 'refund' })
      .eq('id', id)
      .select()
    expect(updated).toHaveLength(1)
    expect(updated![0].kind).toBe('refund')

    const { data: deleted } = await alice.client.from('entries').delete().eq('id', id).select()
    expect(deleted).toHaveLength(1)
  })

  it("does not show Alice's entries to Bob", async () => {
    const id = await aliceEntry()
    const { data, error } = await bob.client.from('entries').select('id').eq('id', id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("does not include Alice's entries in Bob's unfiltered list", async () => {
    const id = await aliceEntry()
    const { data } = await bob.client.from('entries').select('id')
    expect((data ?? []).map((row) => row.id)).not.toContain(id)
  })

  it("silently no-ops Bob's update of Alice's entry and leaves the row intact", async () => {
    const id = await aliceEntry(12.5)
    const { data, error } = await bob.client
      .from('entries')
      .update({ amount: 9999 })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: row } = await oracle.from('entries').select('amount').eq('id', id).single()
    expect(Number(row!.amount)).toBe(12.5)
  })

  it("silently no-ops Bob's delete of Alice's entry and leaves the row present", async () => {
    const id = await aliceEntry()
    const { data, error } = await bob.client.from('entries').delete().eq('id', id).select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { count } = await oracle
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(1)
  })

  it('rejects an insert that claims another user as owner', async () => {
    const id = randomUUID()
    const { error } = await bob.client.from('entries').insert({
      id,
      user_id: alice.id,
      amount: 1,
      note: 'forged',
      date: '2026-07-14',
      dedupe_key: `forged-${id}`,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(0)
  })

  it('denies anonymous access entirely', async () => {
    await aliceEntry()
    const { error } = await anonClient().from('entries').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('rejects entry kinds outside expense and refund', async () => {
    const id = randomUUID()
    const { error } = await alice.client.from('entries').insert({
      id,
      user_id: alice.id,
      amount: 1,
      kind: 'income',
      note: '',
      date: '2026-07-14',
      dedupe_key: `invalid-kind-${id}`,
    })

    expect(error?.code).toBe('23514')
  })
})
