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
  })
})
