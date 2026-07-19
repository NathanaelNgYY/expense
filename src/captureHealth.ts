import type { Entry } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export const CAPTURE_HEALTH_INACTIVITY_DAYS = 7
export const CAPTURE_HEALTH_CADENCE_WINDOW_DAYS = 14
export const CAPTURE_HEALTH_MIN_ACTIVE_DAYS = 3

export interface CaptureHealthWarning {
  inactiveDays: number
  lastCaptureDate: string
}

function utcDay(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null

  return timestamp / DAY_MS
}

function isAutomaticCapture(entry: Entry): boolean {
  return entry.source === 'apple-pay' || entry.source === 'dbs-email'
}

/**
 * Detects a likely stopped Shortcut from the offline entry cache. Three distinct capture days
 * establish a cadence; a quiet week then becomes noteworthy without alarming new or sparse users.
 */
export function getCaptureHealthWarning(
  entries: Entry[],
  today: string,
): CaptureHealthWarning | null {
  const todayDay = utcDay(today)
  if (todayDay === null) return null

  const captureDays = new Map<number, string>()
  for (const entry of entries) {
    if (!isAutomaticCapture(entry)) continue
    const day = utcDay(entry.date)
    if (day === null || day > todayDay) continue
    captureDays.set(day, entry.date)
  }

  if (captureDays.size < CAPTURE_HEALTH_MIN_ACTIVE_DAYS) return null

  const lastCaptureDay = Math.max(...captureDays.keys())
  const inactiveDays = todayDay - lastCaptureDay
  if (inactiveDays <= CAPTURE_HEALTH_INACTIVITY_DAYS) return null

  const cadenceStart = lastCaptureDay - CAPTURE_HEALTH_CADENCE_WINDOW_DAYS + 1
  const activeDays = [...captureDays.keys()].filter(day => day >= cadenceStart && day <= lastCaptureDay)
  if (activeDays.length < CAPTURE_HEALTH_MIN_ACTIVE_DAYS) return null

  return {
    inactiveDays,
    lastCaptureDate: captureDays.get(lastCaptureDay)!,
  }
}
