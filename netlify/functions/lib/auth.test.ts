import { describe, it, expect } from 'vitest'
import { isAuthorized } from './auth'

describe('isAuthorized', () => {
  it('accepts a matching bearer token', () => {
    expect(isAuthorized('Bearer secret123', 'secret123')).toBe(true)
  })
  it('rejects a wrong token', () => {
    expect(isAuthorized('Bearer nope', 'secret123')).toBe(false)
  })
  it('rejects a missing header', () => {
    expect(isAuthorized(null, 'secret123')).toBe(false)
  })
  it('rejects when no server token configured', () => {
    expect(isAuthorized('Bearer anything', undefined)).toBe(false)
  })
})
