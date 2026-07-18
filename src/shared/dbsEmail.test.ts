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

  it('flags a card alert as the "card" channel', () => {
    const result = parseDbsEmail(SAMPLE)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.channel).toBe('card')
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
    const result = parseDbsEmail(PAYNOW, '2026-06-07T03:00:00Z')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.amount).toBe(5.7)
      expect(result.merchant).toBe('LFH SEAFOOD')
      expect(result.recipientKind).toBe('business')
      expect(result.occurredAt).toBe('2026-06-05T10:15:00.000Z')
    }
  })

  it('flags a PayNow alert as the "paynow" channel', () => {
    const result = parseDbsEmail(PAYNOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.channel).toBe('paynow')
  })

  it('handles CRLF line endings', () => {
    const result = parseDbsEmail(PAYNOW.replace(/\n/g, '\r\n'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.merchant).toBe('LFH SEAFOOD')
  })

  // Real person-to-person PayNow alert (from the user's actual inbox, redacted):
  // recipient is a personal name with a trailing "(MOBILE ending ...)".
  const PAYNOW_MOBILE = `Dear Customer,

We refer to your PAYNOW dated 10 Jun. We are pleased to confirm that the transaction was completed.

Date & Time:    10 Jun 13:28 (SGT)
Amount:    SGD7.20
From:    My Account A/C ending 0450
To:    KHXX JIX SHEXX (MOBILE ending 5998)

If unauthorised, please call our DBS hotline. To view transaction details, please login to digibank.`

  it('parses a person-to-person PayNow alert (strips "MOBILE ending" parenthetical)', () => {
    const result = parseDbsEmail(PAYNOW_MOBILE, '2026-06-12T03:00:00Z')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.amount).toBe(7.2)
      expect(result.merchant).toBe('KHXX JIX SHEXX')
      expect(result.channel).toBe('paynow')
      expect(result.recipientKind).toBe('person')
      expect(result.occurredAt).toBe('2026-06-10T05:28:00.000Z')
    }
  })

  it('parses a flattened PayNow email body without relying on line breaks', () => {
    const flattened = PAYNOW.replace(/\s*\n\s*/g, ' ')
    const result = parseDbsEmail(flattened, '2026-06-07T03:00:00Z')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.merchant).toBe('LFH SEAFOOD')
      expect(result.recipientKind).toBe('business')
    }
  })

  it('parses the payee from an inline transfer sentence', () => {
    const result = parseDbsEmail(
      'You have made a PayNow transfer of SGD 5.70 to AH HUAT KOPI on 11 Jul.',
      '2026-07-12T03:00:00Z',
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.merchant).toBe('AH HUAT KOPI')
  })

  it('infers the previous year for a late December alert received in January', () => {
    const result = parseDbsEmail(
      PAYNOW.replace('05 Jun 18:15', '31 Dec 23:55'),
      '2027-01-02T03:00:00Z',
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.occurredAt).toBe('2026-12-31T15:55:00.000Z')
  })
})
