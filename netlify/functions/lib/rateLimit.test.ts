import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, resetRateLimits, type RateLimitPolicy } from './rateLimit'

const policy: RateLimitPolicy = {
  name: 'test',
  limit: 2,
  windowMs: 1_000,
}

function req(ip: string): Request {
  return new Request('http://x/api/entries', {
    headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` },
  })
}

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('blocks requests after the fixed window limit is exceeded', () => {
    expect(checkRateLimit(req('203.0.113.1'), policy, 1_000).limited).toBe(false)
    expect(checkRateLimit(req('203.0.113.1'), policy, 1_100).limited).toBe(false)

    const blocked = checkRateLimit(req('203.0.113.1'), policy, 1_200)

    expect(blocked.limited).toBe(true)
    expect(blocked.retryAfterSeconds).toBe(1)
  })

  it('allows the same client again after the window resets', () => {
    checkRateLimit(req('203.0.113.1'), policy, 1_000)
    checkRateLimit(req('203.0.113.1'), policy, 1_100)

    expect(checkRateLimit(req('203.0.113.1'), policy, 2_001).limited).toBe(false)
  })

  it('tracks different client IPs separately', () => {
    checkRateLimit(req('203.0.113.1'), policy, 1_000)
    checkRateLimit(req('203.0.113.1'), policy, 1_100)

    expect(checkRateLimit(req('203.0.113.2'), policy, 1_200).limited).toBe(false)
  })
})
