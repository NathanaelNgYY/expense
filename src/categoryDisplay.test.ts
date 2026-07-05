import { describe, expect, it } from 'vitest'
import { buildCategoryOptions, categoryIcon, categoryLabel } from './categoryDisplay'
import type { CustomCategory } from './types'

const custom: CustomCategory[] = [{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]

describe('categoryLabel', () => {
  it('uses the built-in default when there is no override', () => {
    expect(categoryLabel('lunch')).toBe('Lunch')
  })

  it('prefers a user override over the default', () => {
    expect(categoryLabel('lunch', { lunch: { label: 'Food' } })).toBe('Food')
  })

  it('falls back to a custom category label', () => {
    expect(categoryLabel('cat_gym_1', {}, custom)).toBe('Gym')
  })

  it('returns the raw id when nothing matches', () => {
    expect(categoryLabel('cat_unknown')).toBe('cat_unknown')
  })
})

describe('categoryIcon', () => {
  it('returns the id itself for a basic category by default', () => {
    expect(categoryIcon('transport')).toBe('transport')
  })

  it('prefers an override icon', () => {
    expect(categoryIcon('transport', { transport: { icon: 'Car' } })).toBe('Car')
  })

  it('uses the custom category icon', () => {
    expect(categoryIcon('cat_gym_1', {}, custom)).toBe('Dumbbell')
  })

  it('returns the raw id for an unknown category', () => {
    expect(categoryIcon('cat_unknown')).toBe('cat_unknown')
  })
})

describe('buildCategoryOptions', () => {
  it('lists basics (with overrides applied) followed by custom categories', () => {
    const options = buildCategoryOptions({ lunch: { label: 'Food', icon: 'Coffee' } }, custom)
    expect(options[0]).toEqual({ id: 'lunch', label: 'Food', icon: 'Coffee' })
    expect(options.at(-1)).toEqual({ id: 'cat_gym_1', label: 'Gym', icon: 'Dumbbell' })
  })

  it('keeps built-in defaults for categories without an override', () => {
    const options = buildCategoryOptions({}, [])
    expect(options.find(o => o.id === 'transport')).toEqual({
      id: 'transport',
      label: 'Transport',
      icon: 'transport',
    })
  })
})
