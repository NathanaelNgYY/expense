import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BudgetIcon, { CUSTOM_ICON_NAMES, ICON_COMPONENTS } from './BudgetIcon'

describe('BudgetIcon', () => {
  it('exposes a non-empty curated icon set, all resolvable', () => {
    expect(CUSTOM_ICON_NAMES.length).toBeGreaterThanOrEqual(12)
    for (const name of CUSTOM_ICON_NAMES) expect(ICON_COMPONENTS[name]).toBeTruthy()
  })

  it('renders an svg for a built-in name', () => {
    const { container } = render(<BudgetIcon name="lunch" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders an svg for a custom icon name', () => {
    const { container } = render(<BudgetIcon name={CUSTOM_ICON_NAMES[0]} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('falls back to an svg for an unknown name', () => {
    const { container } = render(<BudgetIcon name="totally-unknown" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
