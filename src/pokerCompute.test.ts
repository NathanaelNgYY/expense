import { describe, it, expect } from 'vitest'
import {
  sessionDurationHours,
  sessionPnl,
  totalPnl,
  totalHours,
  hourlyRate,
  sessionsForMonth,
  monthlyPnl,
  winRate,
  currentResultStreak,
  biggestSession,
  bankrollTrend,
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

describe('sessionsForMonth', () => {
  it('returns sessions in the requested month', () => {
    const sessions = [
      session({ id: 'may', date: '2026-05-05' }),
      session({ id: 'apr', date: '2026-04-30' }),
      session({ id: 'may-2', date: '2026-05-31' }),
    ]

    expect(sessionsForMonth(sessions, 2026, 4).map(s => s.id)).toEqual(['may', 'may-2'])
  })
})

describe('monthlyPnl', () => {
  it('sums only sessions in the requested month', () => {
    const sessions = [
      session({ result: 'win', amount: 200, date: '2026-05-05' }),
      session({ result: 'loss', amount: 50, date: '2026-05-06' }),
      session({ result: 'win', amount: 999, date: '2026-04-30' }),
    ]

    expect(monthlyPnl(sessions, 2026, 4)).toBe(150)
  })
})

describe('winRate', () => {
  it('returns null when there are no sessions', () => {
    expect(winRate([])).toBeNull()
  })

  it('returns percentage of winning sessions', () => {
    const sessions = [
      session({ result: 'win' }),
      session({ result: 'loss' }),
      session({ result: 'win' }),
    ]

    expect(winRate(sessions)).toBeCloseTo(66.666)
  })
})

describe('currentResultStreak', () => {
  it('returns null when there are no sessions', () => {
    expect(currentResultStreak([])).toBeNull()
  })

  it('counts the latest contiguous streak by date and start time', () => {
    const sessions = [
      session({ id: 'old-win', result: 'win', date: '2026-05-01', startTime: '18:00' }),
      session({ id: 'loss', result: 'loss', date: '2026-05-02', startTime: '18:00' }),
      session({ id: 'win-1', result: 'win', date: '2026-05-03', startTime: '18:00' }),
      session({ id: 'win-2', result: 'win', date: '2026-05-03', startTime: '22:00' }),
    ]

    expect(currentResultStreak(sessions)).toEqual({ result: 'win', count: 2 })
  })
})

describe('biggestSession', () => {
  it('returns null when there are no sessions', () => {
    expect(biggestSession([])).toBeNull()
  })

  it('returns the session with the largest absolute P&L', () => {
    const sessions = [
      session({ id: 'small-win', result: 'win', amount: 80 }),
      session({ id: 'big-loss', result: 'loss', amount: 200 }),
      session({ id: 'medium-win', result: 'win', amount: 150 }),
    ]

    expect(biggestSession(sessions)).toEqual({ session: sessions[1], pnl: -200 })
  })
})

describe('bankrollTrend', () => {
  it('returns cumulative P&L in chronological order', () => {
    const sessions = [
      session({ result: 'win', amount: 50, date: '2026-05-02', startTime: '18:00' }),
      session({ result: 'loss', amount: 20, date: '2026-05-01', startTime: '18:00' }),
      session({ result: 'win', amount: 30, date: '2026-05-02', startTime: '20:00' }),
    ]

    expect(bankrollTrend(sessions)).toEqual([-20, 30, 60])
  })
})
