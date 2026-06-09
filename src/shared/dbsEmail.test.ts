import { describe, it, expect } from 'vitest'
import { parseDbsEmail } from './dbsEmail'

const SAMPLE = `Dear Customer,
We refer to the transaction made with your DBS/POSB Card.
Amount: SGD 23.45
To: NTUC FAIRPRICE
Date & Time: 09 Jun 2026 08:15
Thank you.`

describe('parseDbsEmail', () => {
  it('extracts amount and merchant', () => {
    const result = parseDbsEmail(SAMPLE)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.amount).toBe(23.45)
      expect(result.merchant).toBe('NTUC FAIRPRICE')
    }
  })

  it('fails when no amount present', () => {
    const result = parseDbsEmail('Hello, this is not a transaction alert.')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-amount')
  })

  // Real DBS PayNow alert: amount has no space after SGD, recipient is on a
  // "To:" line with a trailing "(UEN ending ...)", and a "From:" line precedes it.
  const PAYNOW = `Dear Customer,

We refer to your PAYNOW dated 05 Jun. We are pleased to confirm that the transaction was completed.

Date & Time:    05 Jun 18:15 (SGT)
Amount:    SGD5.70
From:    My Account A/C ending 0450
To:    LFH SEAFOOD (UEN ending 006C)

If unauthorised, please call our DBS hotline.`

  it('parses a real PayNow alert (no space after SGD, strips UEN, ignores From line)', () => {
    const result = parseDbsEmail(PAYNOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.amount).toBe(5.7)
      expect(result.merchant).toBe('LFH SEAFOOD')
    }
  })

  it('handles CRLF line endings', () => {
    const result = parseDbsEmail(PAYNOW.replace(/\n/g, '\r\n'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.merchant).toBe('LFH SEAFOOD')
  })
})
