import { beforeEach, describe, expect, it } from 'vitest'
import {
  INGEST_BINDING_STORAGE_KEY,
  readIngestBinding,
  rememberIngestBinding,
  resolveIngestVisibility,
  type IngestStatus,
} from './ingestVisibility'

const status: IngestStatus = {
  recipientUserId: 'user-current',
  tokenLabel: 'ios-shortcut',
  lastCapturedAt: '2026-07-13T09:30:00.000Z',
  lastSource: 'apple_pay',
}

beforeEach(() => localStorage.clear())

describe('ingest visibility', () => {
  it('shows the current account as the recipient when Supabase has its ingest status', () => {
    expect(resolveIngestVisibility({
      currentUserId: 'user-current',
      currentAccountLabel: 'nat@example.com',
      status,
      rememberedBinding: null,
    })).toEqual({
      state: 'linked',
      recipientAccountLabel: 'nat@example.com',
      tokenLabel: 'ios-shortcut',
      lastCapturedAt: '2026-07-13T09:30:00.000Z',
      lastSource: 'apple_pay',
    })
  })

  it('warns when this device remembers a different ingest recipient', () => {
    expect(resolveIngestVisibility({
      currentUserId: 'user-new',
      currentAccountLabel: 'new@example.com',
      status: null,
      rememberedBinding: {
        userId: 'user-old',
        accountLabel: 'old@example.com',
        tokenLabel: 'ios-shortcut',
        lastCapturedAt: '2026-07-12T03:00:00.000Z',
      },
    })).toMatchObject({
      state: 'mismatch',
      recipientAccountLabel: 'old@example.com',
      lastCapturedAt: '2026-07-12T03:00:00.000Z',
    })
  })

  it('reports an unlinked current account instead of claiming it is offline', () => {
    expect(resolveIngestVisibility({
      currentUserId: 'user-current',
      currentAccountLabel: 'nat@example.com',
      status: null,
      rememberedBinding: null,
    }).state).toBe('unlinked')
  })

  it('persists only non-secret recipient metadata for later account comparisons', () => {
    rememberIngestBinding(status, 'nat@example.com')

    expect(readIngestBinding()).toEqual({
      userId: 'user-current',
      accountLabel: 'nat@example.com',
      tokenLabel: 'ios-shortcut',
      lastCapturedAt: '2026-07-13T09:30:00.000Z',
    })
    expect(localStorage.getItem(INGEST_BINDING_STORAGE_KEY)).not.toContain('token_hash')
  })
})
