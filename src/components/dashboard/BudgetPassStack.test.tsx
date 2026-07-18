import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BudgetPassStack, { type BudgetPass } from './BudgetPassStack'

const personal: BudgetPass = {
  id: 'personal',
  title: 'Personal',
  subtitle: 'July 2026',
  amount: 900,
  limit: 3000,
  pct: 30,
  usageLabel: 'allocated',
}

describe('BudgetPassStack', () => {
  it('leads with remaining money and preserves the allocation label', () => {
    render(<BudgetPassStack passes={[personal]} onSelect={() => undefined} />)

    expect(screen.getByText('Left to spend')).toBeInTheDocument()
    expect(screen.getByText('S$2,100')).toBeInTheDocument()
    expect(screen.getByText(/S\$900 of S\$3,000 allocated/)).toBeInTheDocument()
  })

  it('opens a background pass through its accessible switch control', () => {
    const onSelect = vi.fn()
    render(
      <BudgetPassStack
        passes={[personal, { ...personal, id: 'shared-1', title: 'Trip', amount: null, limit: null }]}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Trip' }))
    expect(onSelect).toHaveBeenCalledWith('shared-1')
    expect(screen.getByText('Tap to open')).toBeInTheDocument()
  })

  it('calls out overspending without showing a negative remaining amount', () => {
    render(
      <BudgetPassStack
        passes={[{ ...personal, amount: 3400, pct: 100 }]}
        onSelect={() => undefined}
      />,
    )

    expect(screen.getByText('Over budget by')).toBeInTheDocument()
    expect(screen.getByText('S$400')).toHaveClass('pass-amt--over')
  })
})
