import { describe, it, expect } from 'vitest'
import {
  sessionDurationHours,
  sessionPnl,
  totalPnl,
  totalHours,
  hourlyRate,
} from './pokerCompute'
import type { PokerSession } from './types'

function session(overrides: Partial<PokerSession> = {}): PokerSession {
  return {
    id: '1',
    date: '2026-05-05',
    startTime: '18:00',
    endTime: '20:00',
    stakes: '1/2',
    buyIn: 200,
    result: 'win',
    amount: 150,
    ...overrides,
  }
}

describe('sessionDurationHours', () => {
  it('returns correct hours for same-day session', () => {
    expect(sessionDurationHours('18:00', '20:30')).toBeCloseTo(2.5)
  })

  it('handles midnight crossover', () => {
    expect(sessionDurationHours('22:00', '01:00')).toBeCloseTo(3)
  })

  it('returns 0 for identical start and end time', () => {
    expect(sessionDurationHours('18:00', '18:00')).toBe(0)
  })
})

describe('sessionPnl', () => {
  it('returns positive amount for a win', () => {
    expect(sessionPnl(session({ result: 'win', amount: 150 }))).toBe(150)
  })

  it('returns negative amount for a loss', () => {
    expect(sessionPnl(session({ result: 'loss', amount: 80 }))).toBe(-80)
  })
})

describe('totalPnl', () => {
  it('sums P&L across sessions', () => {
    const sessions = [
      session({ result: 'win', amount: 200 }),
      session({ result: 'loss', amount: 50 }),
    ]
    expect(totalPnl(sessions)).toBe(150)
  })

  it('returns 0 for empty sessions', () => {
    expect(totalPnl([])).toBe(0)
  })
})

describe('totalHours', () => {
  it('sums hours across sessions', () => {
    const sessions = [
      session({ startTime: '18:00', endTime: '20:00' }),
      session({ startTime: '14:00', endTime: '15:30' }),
    ]
    expect(totalHours(sessions)).toBeCloseTo(3.5)
  })

  it('returns 0 for empty sessions', () => {
    expect(totalHours([])).toBe(0)
  })
})

describe('hourlyRate', () => {
  it('returns P&L divided by total hours', () => {
    const sessions = [
      session({ result: 'win', amount: 100, startTime: '18:00', endTime: '20:00' }),
    ]
    expect(hourlyRate(sessions)).toBeCloseTo(50)
  })

  it('returns null for empty sessions', () => {
    expect(hourlyRate([])).toBeNull()
  })

  it('returns null when total hours is 0', () => {
    const sessions = [session({ startTime: '18:00', endTime: '18:00' })]
    expect(hourlyRate(sessions)).toBeNull()
  })
})
