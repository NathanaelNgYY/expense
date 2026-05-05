import type { PokerSession } from './types'

export function sessionDurationHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMins = sh * 60 + sm
  const endMins = eh * 60 + em
  const diffMins = endMins >= startMins ? endMins - startMins : endMins + 24 * 60 - startMins
  return diffMins / 60
}

export function sessionPnl(session: PokerSession): number {
  return session.result === 'win' ? session.amount : -session.amount
}

export function totalPnl(sessions: PokerSession[]): number {
  return sessions.reduce((sum, s) => sum + sessionPnl(s), 0)
}

export function totalHours(sessions: PokerSession[]): number {
  return sessions.reduce((sum, s) => sum + sessionDurationHours(s.startTime, s.endTime), 0)
}

export function hourlyRate(sessions: PokerSession[]): number | null {
  const hours = totalHours(sessions)
  if (hours === 0) return null
  return totalPnl(sessions) / hours
}
