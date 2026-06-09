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
})
