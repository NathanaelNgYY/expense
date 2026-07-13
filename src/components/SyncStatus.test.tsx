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

  // The count is of queued mutations, not entries — one entry edited twice is two changes.
  test('reports how many changes have not reached the server', () => {
    render(<SyncStatus sync={{ pendingCount: 2, failed: true }} onRetry={() => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 changes not synced')
  })

  test('uses the singular for a single unsynced change', () => {
    render(<SyncStatus sync={{ pendingCount: 1, failed: true }} onRetry={() => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 change not synced')
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

  test('an auth failure explains itself instead of offering a retry that cannot work', () => {
    render(<SyncStatus sync={{ pendingCount: 3, failed: true, reason: 'auth' }} onRetry={() => undefined} />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/sync resumes automatically/i)
    expect(status).toHaveTextContent(/saved on this device/i)
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  test('an offline failure still offers retry', () => {
    render(<SyncStatus sync={{ pendingCount: 3, failed: true, reason: 'offline' }} onRetry={() => undefined} />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  test('a migration failure names the missing entries and never claims the user is offline', () => {
    render(
      <SyncStatus
        sync={{ pendingCount: 0, failed: true, reason: 'migration', migrationMissingCount: 2 }}
        onRetry={() => undefined}
      />,
    )

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent("2 entries couldn't be uploaded")
    expect(status).toHaveTextContent(/saved on this device/i)
    expect(status).not.toHaveTextContent(/offline/i)
  })

  test('a migration failure offers an immediate full-backup action', () => {
    const onBackup = vi.fn()
    render(
      <SyncStatus
        sync={{ pendingCount: 0, failed: true, reason: 'migration', migrationMissingCount: 1 }}
        onRetry={() => undefined}
        onBackup={onBackup}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /download backup/i }))
    expect(onBackup).toHaveBeenCalledOnce()
  })
})
