import { describe, it, expect } from 'vitest'
import {
  generateToken,
  rotateIngestToken,
  rotationLabel,
  sha256Hex,
  TOKEN_GRACE_MS,
  type RotateStore,
} from './handler'

class InMemoryRotateStore implements RotateStore {
  active: string[]
  expired: Array<{ hashes: string[]; expiresAt: string }> = []
  inserted: Array<{ tokenHash: string; userId: string; label: string }> = []

  constructor(active: string[] = []) {
    this.active = active
  }

  async activeTokenHashes(): Promise<string[]> {
    return this.active
  }
  async expireTokens(hashes: string[], expiresAt: string): Promise<void> {
    this.expired.push({ hashes, expiresAt })
  }
  async insertToken(row: { tokenHash: string; userId: string; label: string }): Promise<void> {
    this.inserted.push(row)
  }
}

const NOW = new Date('2026-07-22T12:00:00.000Z')

describe('rotateIngestToken', () => {
  it('mints the injected token and stores only its sha256 hash, never the raw value', async () => {
    const store = new InMemoryRotateStore(['old-hash'])
    const result = await rotateIngestToken('user-1', store, NOW, () => 'RAW-TOKEN')

    expect(result.token).toBe('RAW-TOKEN')
    expect(store.inserted).toHaveLength(1)
    expect(store.inserted[0].tokenHash).toBe(await sha256Hex('RAW-TOKEN'))
    expect(store.inserted[0].tokenHash).not.toBe('RAW-TOKEN')
    expect(store.inserted[0].userId).toBe('user-1')
  })

  it('expires exactly the previously-active tokens at now + 24h grace', async () => {
    const store = new InMemoryRotateStore(['hash-a', 'hash-b'])
    await rotateIngestToken('user-1', store, NOW, () => 'RAW')

    expect(store.expired).toHaveLength(1)
    expect(store.expired[0].hashes).toEqual(['hash-a', 'hash-b'])
    expect(store.expired[0].expiresAt).toBe(new Date(NOW.getTime() + TOKEN_GRACE_MS).toISOString())
  })

  it('does not expire anything on a first mint (no active tokens)', async () => {
    const store = new InMemoryRotateStore([])
    await rotateIngestToken('user-1', store, NOW, () => 'RAW')

    expect(store.expired).toHaveLength(0)
    expect(store.inserted).toHaveLength(1)
  })

  it('labels the new token with the rotation date', async () => {
    const store = new InMemoryRotateStore([])
    await rotateIngestToken('user-1', store, NOW, () => 'RAW')
    expect(store.inserted[0].label).toBe(rotationLabel(NOW))
  })

  it('grace window is 24 hours', () => {
    expect(TOKEN_GRACE_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('generateToken', () => {
  it('encodes the injected bytes as url-safe base64 without padding', () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 1, 2])
    const token = generateToken(bytes)
    expect(token).not.toMatch(/[+/=]/)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces distinct tokens across calls (real CSPRNG)', () => {
    expect(generateToken()).not.toBe(generateToken())
  })

  it('is long enough to resist guessing (>= 32 bytes of entropy)', () => {
    // 32 bytes base64url ≈ 43 chars.
    expect(generateToken().length).toBeGreaterThanOrEqual(43)
  })
})

describe('rotationLabel', () => {
  it('is a dated, human-readable label', () => {
    expect(rotationLabel(NOW)).toBe('Rotated 2026-07-22')
  })
})
