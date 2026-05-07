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

export function sessionsForMonth(
  sessions: PokerSession[],
  year: number,
  month: number,
): PokerSession[] {
  return sessions.filter(session => {
    const date = new Date(`${session.date}T00:00`)
    return date.getFullYear() === year && date.getMonth() === month
  })
}

export function monthlyPnl(sessions: PokerSession[], year: number, month: number): number {
  return totalPnl(sessionsForMonth(sessions, year, month))
}

export function winRate(sessions: PokerSession[]): number | null {
  if (sessions.length === 0) return null
  const wins = sessions.filter(session => session.result === 'win').length
  return (wins / sessions.length) * 100
}

function chronologicalSessions(sessions: PokerSession[]): PokerSession[] {
  return [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  )
}

export function currentResultStreak(
  sessions: PokerSession[],
): { result: PokerSession['result']; count: number } | null {
  const sorted = chronologicalSessions(sessions)
  const latest = sorted.at(-1)
  if (!latest) return null

  let count = 0
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].result !== latest.result) break
    count += 1
  }

  return { result: latest.result, count }
}

export function biggestSession(
  sessions: PokerSession[],
): { session: PokerSession; pnl: number } | null {
  if (sessions.length === 0) return null
  const session = sessions.reduce((largest, candidate) =>
    Math.abs(sessionPnl(candidate)) > Math.abs(sessionPnl(largest)) ? candidate : largest,
  )
  return { session, pnl: sessionPnl(session) }
}

export function bankrollTrend(sessions: PokerSession[]): number[] {
  let running = 0
  return chronologicalSessions(sessions).map(session => {
    running += sessionPnl(session)
    return running
  })
}
