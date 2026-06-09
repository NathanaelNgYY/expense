import { describe, it, expect } from 'vitest'
import { sgtDateString } from './sgtDate'

describe('sgtDateString', () => {
  it('returns the calendar date in Singapore time', () => {
    // 2026-06-09T23:30:00Z is 2026-06-10 07:30 in SGT
    expect(sgtDateString('2026-06-09T23:30:00Z')).toBe('2026-06-10')
  })
  it('keeps the date for an SGT-offset timestamp', () => {
    expect(sgtDateString('2026-06-09T08:15:00+08:00')).toBe('2026-06-09')
  })
})
