import { describe, expect, it } from 'vitest'
import { formatStakesLabel } from './pokerDisplay'

describe('formatStakesLabel', () => {
  it('adds a leading dollar sign for numeric slash stakes', () => {
    expect(formatStakesLabel('0.5/0.5')).toBe('$0.5/0.5')
  })

  it('does not duplicate an existing dollar sign', () => {
    expect(formatStakesLabel('$0.5/0.5')).toBe('$0.5/0.5')
  })

  it('leaves custom non-numeric stakes unchanged', () => {
    expect(formatStakesLabel('home game')).toBe('home game')
  })
})
