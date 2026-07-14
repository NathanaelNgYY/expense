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

describe('ingest_tokens RLS — service role only', () => {
  it('is readable by the service role', async () => {
    const { error } = await oracle.from('ingest_tokens').select('token_hash').limit(1)
    expect(error).toBeNull()
  })

  it('denies a signed-in user', async () => {
    const { error } = await alice.client.from('ingest_tokens').select('token_hash')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('denies an anonymous caller', async () => {
    const { error } = await anonClient().from('ingest_tokens').select('token_hash')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('never lets a signed-in user mint a token for themselves', async () => {
    const { error } = await alice.client
      .from('ingest_tokens')
      .insert({ token_hash: 'deadbeef', user_id: alice.id, label: 'forged' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('ingest_tokens')
      .select('token_hash', { count: 'exact', head: true })
      .eq('token_hash', 'deadbeef')
    expect(count).toBe(0)
  })
})

describe('ingest_status RLS — owner-readable, never client-writable', () => {
  beforeAll(async () => {
    const { error } = await oracle
      .from('ingest_tokens')
      .insert({ token_hash: `hash-${alice.id}`, user_id: alice.id, label: 'test' })
    expect(error).toBeNull()
  })

  it('lets Alice read her own status row', async () => {
    const { data, error } = await alice.client.from('ingest_status').select('user_id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].user_id).toBe(alice.id)
  })

  it("does not show Alice's status to Bob", async () => {
    const { data, error } = await bob.client
      .from('ingest_status')
      .select('user_id')
      .eq('user_id', alice.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('denies Bob inserting even his own status row', async () => {
    const { error } = await bob.client.from('ingest_status').insert({
      user_id: bob.id,
      token_label: 'forged',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('ingest_status')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', bob.id)
    expect(count).toBe(0)
  })

  it('denies Alice writing even her own status row', async () => {
    const update = await alice.client
      .from('ingest_status')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', alice.id)
    expect(update.error).not.toBeNull()
    expect(update.error!.code).toBe('42501')

    const del = await alice.client.from('ingest_status').delete().eq('user_id', alice.id)
    expect(del.error).not.toBeNull()
    expect(del.error!.code).toBe('42501')

    const { count } = await oracle
      .from('ingest_status')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', alice.id)
    expect(count).toBe(1)
  })

  it('denies an anonymous caller', async () => {
    const { error } = await anonClient().from('ingest_status').select('user_id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})
