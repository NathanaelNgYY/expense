import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfirmProvider, useConfirm } from './ConfirmDialog'

function Harness({ onResult }: { onResult: (result: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button
      type="button"
      onClick={() => {
        void confirm({
          title: 'Delete 3 entries?',
          message: 'You can undo this afterwards.',
          confirmLabel: 'Delete',
          destructive: true,
        }).then(onResult)
      }}
    >
      trigger
    </button>
  )
}

function renderHarness() {
  const onResult = vi.fn()
  render(
    <ConfirmProvider>
      <Harness onResult={onResult} />
    </ConfirmProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
  return onResult
}

describe('ConfirmDialog', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  it('opens a modal dialog named by its title, with message and both buttons', async () => {
    renderHarness()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Delete 3 entries?')
    expect(dialog).toHaveAccessibleDescription('You can undo this afterwards.')
    expect(screen.getByText('You can undo this afterwards.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('focuses Cancel initially — the safe default', async () => {
    renderHarness()
    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('resolves true and closes when the action button is pressed', async () => {
    const onResult = renderHarness()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves false and closes when Cancel is pressed', async () => {
    const onResult = renderHarness()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores focus to the opener when the dialog closes', async () => {
    renderHarness()
    const trigger = screen.getByRole('button', { name: 'trigger' })
    // fireEvent.click doesn't move focus the way a real click does, so focus
    // the opener explicitly to model what happens in a real browser.
    trigger.focus()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('resolves false and unmounts when the UA force-closes the dialog (native close event)', async () => {
    const onResult = renderHarness()
    const dialog = await screen.findByRole('dialog')
    // The jsdom polyfill's close() doesn't dispatch a `close` event, so simulate
    // a UA-forced close (e.g. CloseWatcher second-Esc ignoring preventDefault):
    // the UA closes the dialog first (open=false), then fires `close`. The
    // component ignores close events that arrive while the dialog is open —
    // those are stale events from StrictMode's mount→cleanup→remount cycle.
    dialog.removeAttribute('open')
    fireEvent(dialog, new Event('close'))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores a stale close event that fires while the dialog is open (StrictMode remount)', async () => {
    const onResult = renderHarness()
    const dialog = await screen.findByRole('dialog')
    // StrictMode's mount→cleanup→remount cycle calls dialog.close(), which
    // queues an async close event that lands AFTER the remount reopened the
    // dialog. That stale event must not cancel the freshly opened dialog.
    fireEvent(dialog, new Event('close'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onResult).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('resolves false on Esc (the dialog cancel event)', async () => {
    const onResult = renderHarness()
    const dialog = await screen.findByRole('dialog')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves false on backdrop tap (click lands on the dialog element itself)', async () => {
    const onResult = renderHarness()
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(dialog)
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks the action button destructive when asked', async () => {
    renderHarness()
    const action = await screen.findByRole('button', { name: 'Delete' })
    expect(action.className).toContain('confirm-dialog__btn--destructive')
  })

  it('useConfirm throws without a provider', () => {
    function Bare() {
      useConfirm()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/ConfirmProvider/)
  })

  it('resolves pending confirm with false when a second confirm is called', async () => {
    const onFirstResult = vi.fn()
    const onSecondResult = vi.fn()

    function TwoButtonHarnessWithSpies() {
      const confirm = useConfirm()
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void confirm({
                title: 'First confirm?',
                confirmLabel: 'Yes',
              }).then(onFirstResult)
            }}
          >
            first
          </button>
          <button
            type="button"
            onClick={() => {
              void confirm({
                title: 'Second confirm?',
                confirmLabel: 'Yes',
              }).then(onSecondResult)
            }}
          >
            second
          </button>
        </>
      )
    }

    render(
      <ConfirmProvider>
        <TwoButtonHarnessWithSpies />
      </ConfirmProvider>,
    )

    // Click first button to open first dialog
    fireEvent.click(screen.getByRole('button', { name: 'first' }))
    let dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('First confirm?')

    // Click second button to open second dialog (without closing the first)
    fireEvent.click(screen.getByRole('button', { name: 'second' }))

    // First promise should resolve with false
    await waitFor(() => expect(onFirstResult).toHaveBeenCalledWith(false))

    // Dialog should now show the second title
    dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Second confirm?')

    // The second dialog's own promise still settles normally.
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(onSecondResult).toHaveBeenCalledWith(true))
  })
})
