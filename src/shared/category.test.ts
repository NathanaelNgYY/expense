import { describe, it, expect } from 'vitest'
import { guessCategory } from './category'

describe('guessCategory', () => {
  it('classifies transport merchants', () => {
    expect(guessCategory('SimplyGo MRT')).toBe('transport')
    expect(guessCategory('Grab Ride')).toBe('transport')
  })
  it('classifies lunch merchants', () => {
    expect(guessCategory('Ya Kun Kaya Toast')).toBe('lunch')
    expect(guessCategory('McDonald\'s')).toBe('lunch')
  })
  it('classifies grocery as others', () => {
    expect(guessCategory('FairPrice Finest')).toBe('others')
  })
  it('falls back to others for unknown', () => {
    expect(guessCategory('Some Random Shop')).toBe('others')
  })
})
