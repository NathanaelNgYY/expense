import { describe, expect, it } from 'vitest'
import { entriesToCsv, mergeImportedEntries, parseEntriesCsv } from './csvEntries'
import type { Entry } from './types'

describe('CSV entry import and export', () => {
  it('round-trips exported entries with quoted values', () => {
    const entries: Entry[] = [
      {
        id: 'entry-1',
        amount: 12.5,
        category: 'lunch',
        kind: 'refund',
        note: 'Chicken rice, kopi',
        date: '2026-05-11',
      },
      {
        id: 'entry-2',
        amount: 4,
        category: null,
        kind: 'expense',
        note: '  He said "thanks"  ',
        date: '2026-05-12',
      },
    ]

    const csv = entriesToCsv(entries)

    expect(parseEntriesCsv(csv)).toEqual(entries)
  })

  it('merges imported entries without duplicating existing ids', () => {
    const existing: Entry[] = [
      {
        id: 'entry-1',
        amount: 10,
        category: 'transport',
        note: 'Bus',
        date: '2026-05-10',
      },
    ]
    const imported: Entry[] = [
      {
        id: 'entry-1',
        amount: 10,
        category: 'transport',
        note: 'Bus',
        date: '2026-05-10',
      },
      {
        id: 'entry-2',
        amount: 8.75,
        category: 'others',
        note: 'Notebook',
        date: '2026-05-11',
      },
    ]

    expect(mergeImportedEntries(existing, imported)).toEqual({
      entries: [existing[0], imported[1]],
      importedCount: 1,
      duplicateCount: 1,
    })
  })

  it('deduplicates repeated ids within the imported CSV before any write', () => {
    const repeated: Entry = {
      id: 'entry-2',
      amount: 8.75,
      category: 'others',
      note: 'Notebook',
      date: '2026-05-11',
    }

    expect(mergeImportedEntries([], [repeated, { ...repeated, note: 'Duplicate row' }])).toEqual({
      entries: [repeated],
      importedCount: 1,
      duplicateCount: 1,
    })
  })

  it('rejects rows with invalid entry data', () => {
    const csv = [
      '"id","amount","category","note","date"',
      '"bad-1","nope","lunch","Lunch","2026-05-11"',
    ].join('\n')

    expect(() => parseEntriesCsv(csv)).toThrow('Row 2 has an invalid amount')
  })

  it('rejects impossible calendar dates', () => {
    const csv = [
      '"id","amount","category","note","date"',
      '"bad-1","12","lunch","Lunch","2026-02-31"',
    ].join('\n')

    expect(() => parseEntriesCsv(csv)).toThrow('Row 2 has an invalid date')
  })

  it('imports the legacy five-column format as expenses', () => {
    const csv = [
      '"id","amount","category","note","date"',
      '"legacy-1","12","lunch","Lunch","2026-05-11"',
    ].join('\n')

    expect(parseEntriesCsv(csv)[0]).toMatchObject({ id: 'legacy-1', kind: 'expense' })
  })

  it('rejects an unknown entry kind', () => {
    const csv = [
      '"id","amount","category","note","date","kind"',
      '"bad-1","12","lunch","Lunch","2026-05-11","income"',
    ].join('\n')

    expect(() => parseEntriesCsv(csv)).toThrow('Row 2 has an invalid kind')
  })

  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)'])('neutralizes spreadsheet formula note %s on export', note => {
    const csv = entriesToCsv([{ id: 'entry-1', amount: 1, category: null, note, date: '2026-05-11' }])

    expect(csv).toContain(`"'${note}"`)
    expect(parseEntriesCsv(csv)[0].note).toBe(`'${note}`)
  })
})
