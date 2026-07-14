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

async function aliceSession(amount = 150): Promise<string> {
  const id = randomUUID()
  const { error } = await alice.client.from('poker_sessions').insert({
    id,
    user_id: alice.id,
    date: '2026-07-14',
    start_time: '20:00',
    end_time: '23:30',
    stakes: '1/2',
    buy_in: 200,
    result: 'win',
    amount,
  })
  expect(error).toBeNull()
  return id
}

describe('poker_sessions RLS', () => {
  it('lets a user read, update and delete their own session', async () => {
    const id = await aliceSession()
    const { data: read } = await alice.client.from('poker_sessions').select('id').eq('id', id)
    expect(read).toHaveLength(1)

    const { data: updated } = await alice.client
      .from('poker_sessions')
      .update({ amount: 300 })
      .eq('id', id)
      .select()
    expect(updated).toHaveLength(1)

    const { data: deleted } = await alice.client
      .from('poker_sessions')
      .delete()
      .eq('id', id)
      .select()
    expect(deleted).toHaveLength(1)
  })

  it("does not show Alice's sessions to Bob", async () => {
    const id = await aliceSession()
    const { data, error } = await bob.client.from('poker_sessions').select('id').eq('id', id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("silently no-ops Bob's update and leaves the row intact", async () => {
    const id = await aliceSession(150)
    const { data, error } = await bob.client
      .from('poker_sessions')
      .update({ amount: 9999 })
      .eq('id', id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: row } = await oracle
      .from('poker_sessions')
      .select('amount')
      .eq('id', id)
      .single()
    expect(Number(row!.amount)).toBe(150)
  })

  it("silently no-ops Bob's delete and leaves the row present", async () => {
    const id = await aliceSession()
    const { data, error } = await bob.client.from('poker_sessions').delete().eq('id', id).select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { count } = await oracle
      .from('poker_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(1)
  })

  it('rejects an insert that claims another user as owner', async () => {
    const id = randomUUID()
    const { error } = await bob.client.from('poker_sessions').insert({
      id,
      user_id: alice.id,
      date: '2026-07-14',
      start_time: '20:00',
      end_time: '23:30',
      stakes: '1/2',
      buy_in: 200,
      result: 'loss',
      amount: 50,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('poker_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(0)
  })

  it('denies anonymous access entirely', async () => {
    const { error } = await anonClient().from('poker_sessions').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})
