export function sgtDateString(iso: string): string {
  const date = new Date(iso)
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// The SGT (Asia/Singapore) calendar date `YYYY-MM-DD` for an instant.
export function sgtTodayString(now: Date = new Date()): string {
  return sgtDateString(now.toISOString())
}

// A Date whose LOCAL calendar fields equal the SGT calendar date (local-midnight of that day).
// Once a "now" value is sgtToday(), everything downstream — getMonth(), date-fns
// startOfWeek/endOfWeek, addDays, toLocalDateString — computes on the correct calendar date.
// Date-granularity only: time-of-day is midnight. Do not use this where SGT hour matters.
export function sgtToday(now: Date = new Date()): Date {
  const [year, month, day] = sgtTodayString(now).split('-').map(Number)
  return new Date(year, month - 1, day)
}
