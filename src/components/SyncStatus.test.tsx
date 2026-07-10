import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SyncStatus from './SyncStatus'

describe('SyncStatus', () => {
  test('stays out of the way when everything is synced', () => {
    const { container } = render(
      <SyncStatus sync={{ pendingCount: 0, failed: false }} onRetry={() => undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('says nothing while a queued entry is still in flight and nothing has failed', () => {
    const { container } = render(
      <SyncStatus sync={{ pendingCount: 1, failed: false }} onRetry={() => undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('reports how many entries have not reached the server', () => {
    render(<SyncStatus sync={{ pendingCount: 2, failed: true }} onRetry={() => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 entries not synced')
  })

  test('uses the singular for a single unsynced entry', () => {
    render(<SyncStatus sync={{ pendingCount: 1, failed: true }} onRetry={() => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 entry not synced')
  })

  test('reassures the user their data is safe locally', () => {
    render(<SyncStatus sync={{ pendingCount: 1, failed: true }} onRetry={() => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent(/saved on this device/i)
  })

  test('a failure with an empty queue is a read failure, not lost writes', () => {
    render(<SyncStatus sync={{ pendingCount: 0, failed: true }} onRetry={() => undefined} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/offline/i)
    expect(status).not.toHaveTextContent(/not synced/i)
  })

  test('retry is reachable and invokes the callback', () => {
    const onRetry = vi.fn()
    render(<SyncStatus sync={{ pendingCount: 3, failed: true }} onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(onRetry).toHaveBeenCalledOnce()
  })
})
