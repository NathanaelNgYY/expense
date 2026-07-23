// src/captureNudge.ts
// U5: decide whether to offer automatic capture to someone who has only ever typed
// entries in. Pure — no DOM, no storage — mirroring `captureHealth.ts` next door.
import type { Entry } from './types'

export const CAPTURE_NUDGE_MIN_MANUAL_ENTRIES = 3

function isAutomaticCapture(entry: Entry): boolean {
  return entry.source === 'apple-pay' || entry.source === 'dbs-email'
}

/**
 * Manual means *not automatic*, so entries cached before the `source` field existed
 * still count — they were typed by hand, and skipping them would hide the card from
 * exactly the long-standing manual users it is for.
 */
export function manualEntryCount(entries: Entry[]): number {
  return entries.reduce((count, entry) => (isAutomaticCapture(entry) ? count : count + 1), 0)
}

/**
 * Offer automatic capture once the user has typed a few entries and has never had a
 * capture land. A single automatic capture, ever, retires the card permanently: it
 * means ingest already works.
 *
 * Disjoint from `getCaptureHealthWarning` by construction — that one needs three or
 * more automatic captures, this one needs zero — so the two cards can never appear
 * together. `captureNudge.test.ts` asserts it.
 */
export function shouldShowCaptureNudge(entries: Entry[], dismissed: boolean): boolean {
  if (dismissed) return false
  if (entries.some(isAutomaticCapture)) return false
  return manualEntryCount(entries) >= CAPTURE_NUDGE_MIN_MANUAL_ENTRIES
}
