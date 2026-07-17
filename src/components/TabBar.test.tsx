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
    expect(button).toHaveAttribute('aria-current', 'page')

    fireEvent.click(button)
    expect(onChange).toHaveBeenCalledWith(tab)
  })

  it('keeps secondary tools out of primary navigation', () => {
    render(<TabBar active="home" onChange={() => undefined} />)

    expect(screen.queryByRole('button', { name: 'Poker' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Shared budgets' })).not.toBeInTheDocument()
  })

  it('exposes aria-current only on the active tab', () => {
    render(<TabBar active="history" onChange={() => undefined} />)

    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute('aria-current', 'page')
    for (const label of ['Home', 'Add entry', 'Insights', 'Settings']) {
      expect(screen.getByRole('button', { name: label })).not.toHaveAttribute('aria-current')
      expect(screen.getByRole('button', { name: label })).not.toHaveAttribute('aria-pressed')
    }
  })

  describe('keyboard focus movement', () => {
    function renderAndFocus(label: string) {
      const onChange = vi.fn()
      render(<TabBar active="home" onChange={onChange} />)
      const button = screen.getByRole('button', { name: label })
      button.focus()
      return { button, onChange }
    }

    it('ArrowRight moves focus to the next tab without activating it', () => {
      const { button, onChange } = renderAndFocus('Home')
      fireEvent.keyDown(button, { key: 'ArrowRight' })
      expect(screen.getByRole('button', { name: 'History' })).toHaveFocus()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('ArrowRight wraps from the last tab to the first', () => {
      const { button } = renderAndFocus('Settings')
      fireEvent.keyDown(button, { key: 'ArrowRight' })
      expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus()
    })

    it('ArrowLeft wraps from the first tab to the last', () => {
      const { button } = renderAndFocus('Home')
      fireEvent.keyDown(button, { key: 'ArrowLeft' })
      expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
    })

    it('Home and End jump to the first and last tabs', () => {
      const { button } = renderAndFocus('Insights')
      fireEvent.keyDown(button, { key: 'Home' })
      expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus()
      fireEvent.keyDown(screen.getByRole('button', { name: 'Home' }), { key: 'End' })
      expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
    })

    it('ignores keys it does not own', () => {
      const { button, onChange } = renderAndFocus('Home')
      fireEvent.keyDown(button, { key: 'Tab' })
      fireEvent.keyDown(button, { key: 'ArrowDown' })
      expect(button).toHaveFocus()
      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
