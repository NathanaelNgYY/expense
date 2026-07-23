import { describe, expect, it } from 'vitest'
import {
  CAPTURE_NUDGE_MIN_MANUAL_ENTRIES,
  manualEntryCount,
  shouldShowCaptureNudge,
} from './captureNudge'
import { getCaptureHealthWarning } from './captureHealth'
import type { Entry } from './types'

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: crypto.randomUUID(),
    amount: 5,
    category: 'lunch',
    note: '',
    date: '2026-07-20',
    ...overrides,
  } as Entry
}

const manual = (n: number) => Array.from({ length: n }, () => entry({ source: 'manual' }))

describe('manualEntryCount', () => {
  it('counts anything that is not an automatic capture', () => {
    expect(
      manualEntryCount([
        entry({ source: 'manual' }),
        entry({ source: 'apple-pay' }),
        entry({ source: 'dbs-email' }),
      ]),
    ).toBe(1)
  })

  it('counts legacy entries with no source at all', () => {
    // Cached rows predating the `source` field were typed by hand. Treating an
    // absent source as "unknown, skip" would hide the card from exactly the
    // long-standing manual users it exists for.
    expect(manualEntryCount([entry({ source: undefined })])).toBe(1)
  })
})

describe('shouldShowCaptureNudge', () => {
  it('stays hidden below the threshold', () => {
    expect(
      shouldShowCaptureNudge(manual(CAPTURE_NUDGE_MIN_MANUAL_ENTRIES - 1), false),
    ).toBe(false)
  })

  it('appears once the threshold is reached', () => {
    expect(shouldShowCaptureNudge(manual(CAPTURE_NUDGE_MIN_MANUAL_ENTRIES), false)).toBe(true)
  })

  it('stays visible past the threshold until it is dismissed', () => {
    expect(shouldShowCaptureNudge(manual(12), false)).toBe(true)
  })

  it.each([
    ['apple-pay' as const],
    ['dbs-email' as const],
  ])('never appears once a %s capture has ever landed', source => {
    // The user already has ingest working; this card would be nonsense.
    const entries = [...manual(9), entry({ source })]
    expect(shouldShowCaptureNudge(entries, false)).toBe(false)
  })

  it('stays hidden after dismissal', () => {
    expect(shouldShowCaptureNudge(manual(9), true)).toBe(false)
  })

  it('handles an empty ledger', () => {
    expect(shouldShowCaptureNudge([], false)).toBe(false)
  })
})

describe('the two capture cards are mutually exclusive', () => {
  // The nudge means "you never set this up"; the health warning means "it broke".
  // Showing both at once would be incoherent. That is impossible by construction —
  // the warning needs >= 3 automatic captures and the nudge needs exactly 0 — so it
  // is asserted here rather than defended with a redundant guard at the render site.
  // If someone later loosens either threshold, this fails.
  it('cannot both be true for any ledger', () => {
    const ledgers: Entry[][] = [
      [],
      manual(3),
      manual(20),
      [...manual(3), entry({ source: 'apple-pay', date: '2026-07-01' })],
      [
        ...manual(3),
        entry({ source: 'apple-pay', date: '2026-07-01' }),
        entry({ source: 'apple-pay', date: '2026-07-02' }),
        entry({ source: 'dbs-email', date: '2026-07-03' }),
      ],
    ]

    for (const entries of ledgers) {
      const nudge = shouldShowCaptureNudge(entries, false)
      const warning = getCaptureHealthWarning(entries, '2026-07-23') !== null
      expect(nudge && warning).toBe(false)
    }
  })
})
