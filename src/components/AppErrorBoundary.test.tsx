import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AppErrorBoundary from './AppErrorBoundary'

function CrashingScreen(): never {
  throw new Error('private technical details')
}

const recoveryActions = {
  onReload: () => undefined,
  onBackup: () => undefined,
}

describe('AppErrorBoundary', () => {
  it('renders children normally when nothing crashes', () => {
    render(
      <AppErrorBoundary {...recoveryActions}>
        <p>Budget is ready</p>
      </AppErrorBoundary>,
    )

    expect(screen.getByText('Budget is ready')).toBeInTheDocument()
  })

  it('replaces a crashed screen with friendly recovery actions and no technical details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppErrorBoundary {...recoveryActions}>
        <CrashingScreen />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText(/entries are still saved on this device/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload app/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download backup/i })).toBeInTheDocument()
    expect(screen.queryByText(/private technical details/i)).not.toBeInTheDocument()
  })

  it('runs the reload and full-backup recovery actions', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReload = vi.fn()
    const onBackup = vi.fn()
    render(
      <AppErrorBoundary onReload={onReload} onBackup={onBackup}>
        <CrashingScreen />
      </AppErrorBoundary>,
    )

    fireEvent.click(screen.getByRole('button', { name: /download backup/i }))
    fireEvent.click(screen.getByRole('button', { name: /reload app/i }))

    expect(onBackup).toHaveBeenCalledOnce()
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('reports the original error and React component stack for developers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    render(
      <AppErrorBoundary {...recoveryActions} onError={onError}>
        <CrashingScreen />
      </AppErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'private technical details' }),
      expect.objectContaining({ componentStack: expect.stringContaining('CrashingScreen') }),
    )
  })
})
