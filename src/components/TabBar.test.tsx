import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TabBar, { type Tab } from './TabBar'

const destinations: Array<{ label: string; tab: Tab }> = [
  { label: 'Home', tab: 'home' },
  { label: 'History', tab: 'history' },
  { label: 'Add entry', tab: 'add' },
  { label: 'Insights', tab: 'insights' },
  { label: 'Settings', tab: 'settings' },
]

describe('TabBar', () => {
  it.each(destinations)('marks $label active and navigates to $tab', ({ label, tab }) => {
    const onChange = vi.fn()
    render(<TabBar active={tab} onChange={onChange} />)

    const button = screen.getByRole('button', { name: label })
    expect(button).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(button)
    expect(onChange).toHaveBeenCalledWith(tab)
  })

  it('keeps secondary tools out of primary navigation', () => {
    render(<TabBar active="home" onChange={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Poker' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Shared budgets' })).not.toBeInTheDocument()
  })
})
