import { describe, expect, it } from 'vitest'
import { friendlyError } from './friendlyError'

describe('friendlyError', () => {
  it('turns the join_budget RPC failure into something actionable', () => {
    expect(friendlyError(new Error('invalid_code'))).toBe(
      'No budget uses that code. Check it with whoever sent it.',
    )
  })

  it('explains an owner-only rejection', () => {
    expect(friendlyError(new Error('not_owner'))).toMatch(/Only the person who created/)
  })

  it('names the real problem when the request never left the device', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/Cannot reach the server/)
  })

  it('reports an RLS rejection as a permission problem, not a mystery', () => {
    expect(friendlyError(new Error('new row violates row-level security policy'))).toMatch(
      /do not have permission/,
    )
  })

  // Unmapped faults stay diagnosable: flattening every unknown error into a
  // generic apology would hide real bugs from the person who has to fix them.
  it('passes an unrecognised message through unchanged', () => {
    expect(friendlyError(new Error('column foo does not exist'))).toBe(
      'column foo does not exist',
    )
  })

  it('falls back only when there is no message at all', () => {
    expect(friendlyError(new Error(''))).toBe('Something went wrong. Try again.')
    expect(friendlyError(undefined)).toBe('Something went wrong. Try again.')
  })
})
