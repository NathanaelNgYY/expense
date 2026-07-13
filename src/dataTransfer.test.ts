import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyImport, buildExportPayload, downloadJsonBackup, parseImportPayload } from './dataTransfer'
import type { ExportPayloadV1 } from './dataTransfer'
import type { Entry, PokerSession } from './types'
import * as api from './api'

vi.mock('./api', () => ({
  bulkUpsertEntries: vi.fn().mockResolvedValue(undefined),
  bulkUpsertPokerSessions: vi.fn().mockResolvedValue(undefined),
}))

const entry: Entry = {
  id: 'e1', amount: 12.5, category: 'lunch', note: 'kopi', date: '2026-07-01',
  source: 'manual', dedupeKey: 'manual|2026-07-01|12.5|kopi|e1',
}
const poker: PokerSession = {
  id: 'p1', date: '2026-07-02', startTime: '20:00', endTime: '23:00',
  stakes: '0.1/0.2', buyIn: 20, result: 'win', amount: 35,
}

beforeEach(() => localStorage.clear())

describe('buildExportPayload', () => {
  it('captures entries, poker sessions and all settings keys', () => {
    localStorage.setItem('budget_entries', JSON.stringify([entry]))
    localStorage.setItem('poker_sessions', JSON.stringify([poker]))
    localStorage.setItem('budget_config', JSON.stringify({ monthlyIncome: 1500, lunch: 264, transport: 50, savings: 400, investments: 250, others: 236, buffer: 236 }))
    localStorage.setItem('budget_custom_categories', JSON.stringify([{ id: 'cat_x_1', label: 'X', budget: null, icon: 'Coffee' }]))
    localStorage.setItem('budget_category_overrides', JSON.stringify({ lunch: { label: 'Food' } }))
    localStorage.setItem('poker_custom_stakes', JSON.stringify(['0.5/1']))
    localStorage.setItem('budget-tracker-theme-v2', 'copper-current')

    const payload = buildExportPayload()

    expect(payload.schemaVersion).toBe(1)
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(payload.entries).toEqual([entry])
    expect(payload.pokerSessions).toEqual([poker])
    expect(payload.settings.budgetConfig?.monthlyIncome).toBe(1500)
    expect(payload.settings.customCategories).toHaveLength(1)
    expect(payload.settings.categoryOverrides).toEqual({ lunch: { label: 'Food' } })
    expect(payload.settings.customStakes).toEqual(['0.5/1'])
    expect(payload.settings.theme).toBe('copper-current')
  })

  it('exports empty arrays and omits absent settings on a fresh browser', () => {
    const payload = buildExportPayload()
    expect(payload.entries).toEqual([])
    expect(payload.pokerSessions).toEqual([])
    expect(payload.settings.theme).toBeUndefined()
  })
})

describe('downloadJsonBackup', () => {
  it('downloads the full local backup with a dated JSON filename', () => {
    localStorage.setItem('budget_entries', JSON.stringify([entry]))
    const createObjectURL = vi.fn(() => 'blob:backup')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const payload = downloadJsonBackup()

    expect(payload.entries).toEqual([entry])
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/json' }))
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })
})

describe('parseImportPayload', () => {
  it('round-trips a built payload', () => {
    localStorage.setItem('budget_entries', JSON.stringify([entry]))
    const parsed = parseImportPayload(JSON.stringify(buildExportPayload()))
    expect(parsed.entries).toEqual([entry])
  })

  it('rejects non-JSON text', () => {
    expect(() => parseImportPayload('not json')).toThrow(/valid JSON/i)
  })

  it('rejects unknown schema versions', () => {
    expect(() => parseImportPayload(JSON.stringify({ schemaVersion: 2, entries: [], pokerSessions: [], settings: {} })))
      .toThrow(/version/i)
  })

  it('rejects entries with missing or malformed fields', () => {
    const bad = { schemaVersion: 1, exportedAt: 'x', entries: [{ id: '', amount: 'NaN', date: '01/07/2026' }], pokerSessions: [], settings: {} }
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrow(/entr/i)
  })

  it('rejects poker sessions with invalid result values', () => {
    const bad = { schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [{ ...poker, result: 'push' }], settings: {} }
    expect(() => parseImportPayload(JSON.stringify(bad))).toThrow(/poker/i)
  })

  it('tolerates a missing settings object', () => {
    const minimal = { schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [] }
    const parsed = parseImportPayload(JSON.stringify(minimal))
    expect(parsed.settings).toEqual({})
  })
})

function payloadWith(overrides: Partial<ExportPayloadV1>): ExportPayloadV1 {
  return { schemaVersion: 1, exportedAt: '2026-07-12T00:00:00Z', entries: [], pokerSessions: [], settings: {}, ...overrides }
}

describe('applyImport', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('upserts entries and poker sessions to the server', async () => {
    await applyImport(payloadWith({ entries: [entry], pokerSessions: [poker] }))
    expect(api.bulkUpsertEntries).toHaveBeenCalledWith([entry])
    expect(api.bulkUpsertPokerSessions).toHaveBeenCalledWith([poker])
  })

  it('merges into local caches without removing existing local data', async () => {
    const local: Entry = { ...entry, id: 'local1', note: 'existing' }
    localStorage.setItem('budget_entries', JSON.stringify([local]))
    const result = await applyImport(payloadWith({ entries: [entry] }))
    const cached = JSON.parse(localStorage.getItem('budget_entries')!) as Entry[]
    expect(cached.map(e => e.id).sort()).toEqual(['e1', 'local1'])
    expect(result.newEntries).toBe(1)
  })

  it('keeps the local copy when ids collide and counts it as not new', async () => {
    localStorage.setItem('budget_entries', JSON.stringify([{ ...entry, note: 'local wins' }]))
    const result = await applyImport(payloadWith({ entries: [entry] }))
    const cached = JSON.parse(localStorage.getItem('budget_entries')!) as Entry[]
    expect(cached).toHaveLength(1)
    expect(cached[0].note).toBe('local wins')
    expect(result.newEntries).toBe(0)
  })

  it('restores only the settings present in the payload', async () => {
    await applyImport(payloadWith({ settings: { theme: 'copper-current' } }))
    expect(localStorage.getItem('budget-tracker-theme-v2')).toBe('copper-current')
    expect(localStorage.getItem('poker_custom_stakes')).toBeNull() // not in payload, untouched
  })

  it('restores settings into empty localStorage', async () => {
    await applyImport(payloadWith({
      settings: {
        budgetConfig: { monthlyIncome: 1500, lunch: 264, transport: 50, savings: 400, investments: 250, others: 236, buffer: 236 },
        customCategories: [{ id: 'cat_x_1', label: 'X', budget: null, icon: 'Coffee' }],
        categoryOverrides: { lunch: { label: 'Food' } },
        customStakes: ['0.5/1'],
        theme: 'copper-current',
      },
    }))
    expect(JSON.parse(localStorage.getItem('budget_config')!).monthlyIncome).toBe(1500)
    expect(JSON.parse(localStorage.getItem('budget_custom_categories')!)).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('budget_category_overrides')!)).toEqual({ lunch: { label: 'Food' } })
    expect(JSON.parse(localStorage.getItem('poker_custom_stakes')!)).toEqual(['0.5/1'])
    expect(localStorage.getItem('budget-tracker-theme-v2')).toBe('copper-current')
  })

  it('keeps the local settings value when a settings key already exists locally', async () => {
    localStorage.setItem('poker_custom_stakes', JSON.stringify(['9/9']))
    await applyImport(payloadWith({ settings: { customStakes: ['0.5/1'] } }))
    expect(JSON.parse(localStorage.getItem('poker_custom_stakes')!)).toEqual(['9/9'])
  })

  it('does not touch local caches when the server upsert fails', async () => {
    vi.mocked(api.bulkUpsertEntries).mockRejectedValueOnce(new Error('offline'))
    await expect(applyImport(payloadWith({ entries: [entry] }))).rejects.toThrow('offline')
    expect(localStorage.getItem('budget_entries')).toBeNull()
  })
})
