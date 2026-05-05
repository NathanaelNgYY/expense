export function toLocalDateString(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromLocalDateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, month - 1, day)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)

  return next
}

export function clampDateString(value: string, min: string, max: string): string {
  if (value < min) return min
  if (value > max) return max

  return value
}

export function isFutureDateString(value: string): boolean {
  return value > toLocalDateString()
}
