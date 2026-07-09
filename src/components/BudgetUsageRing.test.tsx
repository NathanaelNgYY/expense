import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BudgetUsageRing from './BudgetUsageRing'

describe('BudgetUsageRing', () => {
  it('shows spent amount, total budget, and percentage', () => {
    render(<BudgetUsageRing spent={842} total={1320} />)

    expect(screen.getByText('64%')).toBeInTheDocument()
    expect(screen.getByText('S$842.00 / S$1,320.00')).toBeInTheDocument()
    expect(screen.getByLabelText('64% of monthly budget spent')).toBeInTheDocument()
  })

  it('keeps the visual ring bounded when spending exceeds the budget', () => {
    const { container } = render(<BudgetUsageRing spent={1500} total={1000} />)

    expect(screen.getByText('150%')).toBeInTheDocument()
    expect(container.querySelector('.budget-usage-ring')).toHaveStyle({
      '--budget-progress': '100%',
    })
  })
})
