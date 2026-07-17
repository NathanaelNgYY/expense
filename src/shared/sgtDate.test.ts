import { describe, it, expect } from 'vitest'
import { sgtDateString, sgtTodayString, sgtToday } from './sgtDate'

describe('sgtDateString', () => {
  it('returns the calendar date in Singapore time', () => {
    // 2026-06-09T23:30:00Z is 2026-06-10 07:30 in SGT
    expect(sgtDateString('2026-06-09T23:30:00Z')).toBe('2026-06-10')
  })
  it('keeps the date for an SGT-offset timestamp', () => {
    expect(sgtDateString('2026-06-09T08:15:00+08:00')).toBe('2026-06-09')
  })
})

describe('sgtTodayString', () => {
  it('returns the SGT calendar date for an instant that crosses midnight in SGT', () => {
    // 16:30Z is 00:30 next day in SGT (UTC+8)
    expect(sgtTodayString(new Date('2026-07-31T16:30:00Z'))).toBe('2026-08-01')
  })
  it('returns the SGT calendar date for an instant still on the same SGT day', () => {
    // 15:00Z is 23:00 same day in SGT
    expect(sgtTodayString(new Date('2026-07-31T15:00:00Z'))).toBe('2026-07-31')
  })
})

describe('sgtToday', () => {
  it('returns a Date whose local calendar fields equal the SGT date', () => {
    const d = sgtToday(new Date('2026-07-31T16:30:00Z'))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August, 0-based
    expect(d.getDate()).toBe(1)
  })
})
