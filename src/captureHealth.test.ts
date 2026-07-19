import { describe, expect, it } from 'vitest'
import { getCaptureHealthWarning } from './captureHealth'
import type { Entry } from './types'

function captured(date: string, source: Entry['source'] = 'apple-pay'): Entry {
  return {
    id: `${source}-${date}`,
    amount: 5,
    category: 'lunch',
    note: '',
    date,
    source,
  }
}

describe('getCaptureHealthWarning', () => {
  it('warns when a regular automatic-capture cadence has been quiet for over seven days', () => {
    const entries = [
      captured('2026-07-01'),
      captured('2026-07-04', 'dbs-email'),
      captured('2026-07-08'),
    ]

    expect(getCaptureHealthWarning(entries, '2026-07-16')).toEqual({
      inactiveDays: 8,
      lastCaptureDate: '2026-07-08',
    })
  })

  it('does not warn at the seven-day boundary', () => {
    const entries = [
      captured('2026-07-01'),
      captured('2026-07-04'),
      captured('2026-07-08'),
    ]

    expect(getCaptureHealthWarning(entries, '2026-07-15')).toBeNull()
  })

  it('does not warn without three distinct recent automatic-capture days', () => {
    const entries = [
      captured('2026-06-01'),
      captured('2026-07-07'),
      captured('2026-07-08'),
      captured('2026-07-08', 'dbs-email'),
    ]

    expect(getCaptureHealthWarning(entries, '2026-07-20')).toBeNull()
  })

  it('ignores manual, malformed, and future-dated entries', () => {
    const entries = [
      captured('2026-07-01', 'manual'),
      captured('2026-07-03', 'manual'),
      captured('2026-07-05', 'manual'),
      captured('not-a-date'),
      captured('2026-08-01'),
    ]

    expect(getCaptureHealthWarning(entries, '2026-07-20')).toBeNull()
  })
})
