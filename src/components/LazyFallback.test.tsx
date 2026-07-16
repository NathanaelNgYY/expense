import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { lazy, Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import LazyFallback from './LazyFallback'

const NeverResolves = lazy(() => new Promise<{ default: () => null }>(() => {}))

describe('LazyFallback', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing during the first 150ms', () => {
    render(<LazyFallback />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an accessible loading status after the delay', () => {
    render(<LazyFallback />)
    act(() => {
      vi.advanceTimersByTime(150)
    })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading')
  })

  it('cancels the timer on unmount without acting up', () => {
    const { unmount } = render(<LazyFallback />)
    unmount()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('appears inside Suspense while a lazy chunk is pending', () => {
    render(
      <Suspense fallback={<LazyFallback />}>
        <NeverResolves />
      </Suspense>,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
