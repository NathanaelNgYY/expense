import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entry, PokerSession } from './types'

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    ensureUserId: vi.fn(),
    bulkUpsertEntries: vi.fn(),
    bulkUpsertPokerSessions: vi.fn(),
    fetchEntryIds: vi.fn(),
  }
})

import { ensureUserId, bulkUpsertEntries, bulkUpsertPokerSessions, fetchEntryIds } from './api'
import { migrateEntriesIfNeeded, syncPokerSessionsIfNeeded } from './supabaseSync'
import { ApiError } from './api'

const ensureUserIdMock = vi.mocked(ensureUserId)
const bulkUpsertEntriesMock = vi.mocked(bulkUpsertEntries)
const bulkUpsertPokerMock = vi.mocked(bulkUpsertPokerSessions)
const fetchEntryIdsMock = vi.mocked(fetchEntryIds)

const e = (id: string): Entry => ({ id, amount: 1, category: 'lunch', note: '', date: '2026-07-01' })

function seedCache(entries: Entry[]) {
  localStorage.setItem('budget_legacy_storage_owner', 'u1')
  localStorage.setItem('budget_entries', JSON.stringify(entries))
}

function seedPoker(sessions: PokerSession[]) {
  localStorage.setItem('budget_legacy_storage_owner', 'u1')
  localStorage.setItem('poker_sessions', JSON.stringify(sessions))
  if (localStorage.getItem('budget_active_user_id') === 'u1') {
    localStorage.setItem('poker_sessions:u1', JSON.stringify(sessions))
  }
}

const pokerSession: PokerSession = {
  id: 'p1',
  date: '2026-07-01',
  startTime: '20:00',
  endTime: '23:00',
  stakes: '0.1/0.2',
  buyIn: 20,
  result: 'win',
  amount: 35,
}

beforeEach(() => {
  localStorage.clear()
  ensureUserIdMock.mockReset()
  bulkUpsertEntriesMock.mockReset()
  bulkUpsertPokerMock.mockReset()
  fetchEntryIdsMock.mockReset()
  ensureUserIdMock.mockResolvedValue('u1')
  bulkUpsertEntriesMock.mockResolvedValue(undefined)
  bulkUpsertPokerMock.mockResolvedValue(undefined)
  fetchEntryIdsMock.mockResolvedValue(new Set())
})

describe('migrateEntriesIfNeeded', () => {
  it('marks a fresh user (no cached data) done without uploading anything', async () => {
    await expect(migrateEntriesIfNeeded([])).resolves.toBe('done')
    expect(bulkUpsertEntriesMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('supabase_migration_done:u1')).toBe('1')
  })

  it('uploads only the cached entries the server is missing, then verifies', async () => {
    seedCache([e('a'), e('b'), e('c')])
    fetchEntryIdsMock.mockResolvedValue(new Set(['a', 'b', 'c']))

    await expect(migrateEntriesIfNeeded([e('a')])).resolves.toBe('migrated')

    const uploaded = bulkUpsertEntriesMock.mock.calls[0][0]
    expect(uploaded.map(entry => entry.id)).toEqual(['b', 'c'])
    expect(localStorage.getItem('supabase_migration_done:u1')).toBe('1')
  })

  it('is a no-op once the flag is set', async () => {
    localStorage.setItem('supabase_migration_done:u1', '1')
    seedCache([e('a')])
    await expect(migrateEntriesIfNeeded([])).resolves.toBe('done')
    expect(bulkUpsertEntriesMock).not.toHaveBeenCalled()
  })

  it('does not set the flag when verification shows rows are still missing', async () => {
    seedCache([e('a'), e('b')])
    fetchEntryIdsMock.mockResolvedValue(new Set(['a'])) // b never appeared

    await expect(migrateEntriesIfNeeded([])).resolves.toEqual({
      status: 'incomplete',
      missingCount: 1,
    })
    expect(localStorage.getItem('supabase_migration_done:u1')).toBeNull()
  })

  it('isolates a dedupe collision, assigns that entry a stable recovery key, and verifies the migration', async () => {
    const duplicate = { ...e('a'), dedupeKey: 'apple_pay:duplicate' }
    const colliding = { ...e('b'), dedupeKey: 'apple_pay:duplicate' }
    seedCache([duplicate, colliding])
    const uniqueViolation = Object.assign(new ApiError(409, 'duplicate key value violates unique constraint'), {
      code: '23505',
    })
    bulkUpsertEntriesMock
      .mockRejectedValueOnce(uniqueViolation) // batch fails
      .mockResolvedValueOnce(undefined) // a succeeds alone
      .mockRejectedValueOnce(uniqueViolation) // b identifies the collision
      .mockResolvedValueOnce(undefined) // b succeeds with the recovery key
    fetchEntryIdsMock.mockResolvedValue(new Set(['a', 'b']))

    await expect(migrateEntriesIfNeeded([])).resolves.toBe('migrated')

    expect(bulkUpsertEntriesMock).toHaveBeenNthCalledWith(4, [
      expect.objectContaining({ id: 'b', dedupeKey: 'migration-recovery:b' }),
    ])
    expect(JSON.parse(localStorage.getItem('budget_entries:u1') as string)).toEqual([
      duplicate,
      expect.objectContaining({ id: 'b', dedupeKey: 'migration-recovery:b' }),
    ])
    expect(localStorage.getItem('supabase_migration_done:u1')).toBe('1')
  })

  it('propagates an upload failure without setting the flag, and resumes next run', async () => {
    seedCache([e('a')])
    bulkUpsertEntriesMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(migrateEntriesIfNeeded([])).rejects.toBeInstanceOf(TypeError)
    expect(localStorage.getItem('supabase_migration_done:u1')).toBeNull()

    // next run retries the same diff and succeeds
    fetchEntryIdsMock.mockResolvedValue(new Set(['a']))
    await expect(migrateEntriesIfNeeded([])).resolves.toBe('migrated')
    expect(localStorage.getItem('supabase_migration_done:u1')).toBe('1')
  })

  it('does not upload the previous user cache when the account changes', async () => {
    localStorage.setItem('supabase_migration_done:u1', '1') // migrated under the anonymous user
    seedCache([e('a')])
    ensureUserIdMock.mockResolvedValue('u2') // now signed in with Google

    await expect(migrateEntriesIfNeeded([])).resolves.toBe('done')
    expect(bulkUpsertEntriesMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('supabase_migration_done:u2')).toBe('1')
  })

  it('sets the flag without uploading when the server already has every cached entry', async () => {
    seedCache([e('a')])
    await expect(migrateEntriesIfNeeded([e('a')])).resolves.toBe('done')
    expect(bulkUpsertEntriesMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('supabase_migration_done:u1')).toBe('1')
  })
})

describe('syncPokerSessionsIfNeeded', () => {
  it('does nothing when there are no sessions', async () => {
    await syncPokerSessionsIfNeeded()
    expect(ensureUserIdMock).not.toHaveBeenCalled()
    expect(bulkUpsertPokerMock).not.toHaveBeenCalled()
  })

  it('uploads all sessions once, then skips until a new one is logged', async () => {
    seedPoker([pokerSession])
    await syncPokerSessionsIfNeeded()
    expect(bulkUpsertPokerMock).toHaveBeenCalledTimes(1)

    await syncPokerSessionsIfNeeded()
    expect(bulkUpsertPokerMock).toHaveBeenCalledTimes(1) // count unchanged → no re-upload

    seedPoker([pokerSession, { ...pokerSession, id: 'p2' }])
    await syncPokerSessionsIfNeeded()
    expect(bulkUpsertPokerMock).toHaveBeenCalledTimes(2)
  })

  it('does not record progress when the upload fails', async () => {
    seedPoker([pokerSession])
    bulkUpsertPokerMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(syncPokerSessionsIfNeeded()).rejects.toBeInstanceOf(TypeError)

    await syncPokerSessionsIfNeeded() // retries
    expect(bulkUpsertPokerMock).toHaveBeenCalledTimes(2)
  })
})
