import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BudgetUsageRing from './BudgetUsageRing'

describe('BudgetUsageRing', () => {
  it('describes personal usage as allocated income rather than spending', () => {
    render(<BudgetUsageRing allocated={842} total={1320} />)

    expect(screen.getByText('64%')).toBeInTheDocument()
    expect(screen.getByText('S$842.00 / S$1,320.00')).toBeInTheDocument()
    expect(screen.getByLabelText('64% of monthly income allocated')).toBeInTheDocument()
  })

  it('keeps the visual ring bounded when spending exceeds the budget', () => {
    const { container } = render(<BudgetUsageRing allocated={1500} total={1000} />)

    expect(screen.getByText('150%')).toBeInTheDocument()
    expect(container.querySelector('.budget-usage-ring')).toHaveStyle({
      '--budget-progress': '100%',
    })
  })
})
