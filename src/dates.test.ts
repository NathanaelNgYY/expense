import { describe, it, expect, vi } from 'vitest'
import { isFutureDateString } from './dates'

// Pin "today" via the SGT helper so the assertion is independent of the runner's timezone.
// Before the fix, isFutureDateString reads device-local toLocalDateString() and ignores this
// mock, so the "today is not future" case fails (RED). After the fix it delegates to
// sgtTodayString and honors the mocked date.
vi.mock('./shared/sgtDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared/sgtDate')>()
  return { ...actual, sgtTodayString: () => '2026-08-01' }
})

describe('isFutureDateString (SGT)', () => {
  it('treats the SGT today as not future', () => {
    expect(isFutureDateString('2026-08-01')).toBe(false)
  })
  it('treats a date before SGT today as not future', () => {
    expect(isFutureDateString('2026-07-31')).toBe(false)
  })
  it('treats a date after SGT today as future', () => {
    expect(isFutureDateString('2026-08-02')).toBe(true)
  })
})
