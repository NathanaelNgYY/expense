import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SaveToast from './SaveToast'

const ENTRY = { id: 'abc', amount: 5.8, categoryLabel: 'Lunch', kind: 'expense' as const }

describe('SaveToast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('confirms the amount and category that were saved', () => {
    render(<SaveToast entry={ENTRY} onUndo={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved S$5.80 to Lunch')
  })

  test('omits the category clause when the entry is uncategorised', () => {
    render(<SaveToast entry={{ ...ENTRY, categoryLabel: null }} onUndo={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved S$5.80')
    expect(screen.getByRole('status')).not.toHaveTextContent('to')
  })

  test('groups thousands in the confirmed amount', () => {
    render(<SaveToast entry={{ ...ENTRY, amount: 1234.5 }} onUndo={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('S$1,234.50')
  })

  test('confirms a refund as money returned', () => {
    render(<SaveToast entry={{ ...ENTRY, kind: 'refund' }} onUndo={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Refunded S$5.80 to Lunch')
  })

  test('undo reports the saved entry back to the caller', () => {
    const onUndo = vi.fn()
    render(<SaveToast entry={ENTRY} onUndo={onUndo} onDismiss={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    expect(onUndo).toHaveBeenCalledOnce()
  })

  test('dismisses itself once the window to undo has passed', () => {
    const onDismiss = vi.fn()
    render(<SaveToast entry={ENTRY} onUndo={vi.fn()} onDismiss={onDismiss} durationMs={5000} />)

    expect(onDismiss).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(5000))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  test('does not fire the dismiss timer after unmount', () => {
    const onDismiss = vi.fn()
    const { unmount } = render(<SaveToast entry={ENTRY} onUndo={vi.fn()} onDismiss={onDismiss} />)

    unmount()
    act(() => void vi.advanceTimersByTime(10000))

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
