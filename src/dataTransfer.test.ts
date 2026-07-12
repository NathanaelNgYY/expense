import { beforeEach, describe, expect, it } from 'vitest'
import { buildExportPayload, parseImportPayload } from './dataTransfer'
import type { Entry, PokerSession } from './types'

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
