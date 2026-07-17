// src/components/ConfirmDialog.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel: string
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Promise-based replacement for window.confirm. All call sites were inline
 * `if (!confirm(…)) return` guards, so the API keeps that shape:
 * `if (!(await confirm({ … }))) return`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider')
  return confirm
}

interface PendingConfirm {
  options: ConfirmOptions
  resolve: (result: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback<ConfirmFn>(
    options =>
      new Promise<boolean>(resolve =>
        setPending(prev => {
          // Resolving an already-superseded promise is a no-op for its caller
          // (nothing awaits a stale `false` twice), and StrictMode's double
          // invocation of this updater just calls it again harmlessly.
          prev?.resolve(false)
          return { options, resolve }
        }),
      ),
    [],
  )

  function settle(result: boolean) {
    pending?.resolve(result)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          options={pending.options}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

interface DialogProps {
  options: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ options, onConfirm, onCancel }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // showModal gives us the top layer, a real focus trap, and Esc for free;
  // Cancel gets initial focus so a reflexive double-tap can't destroy data.
  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    dialog?.showModal()
    cancelRef.current?.focus()
    return () => {
      // This component unmounts (rather than the caller calling native
      // close()) whenever `pending` is cleared, which skips the dialog
      // close algorithm's own focus restoration. Do it ourselves so focus
      // doesn't drop to <body> after Cancel/Confirm.
      dialog?.close()
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={options.message ? 'confirm-dialog-message' : undefined}
      onCancel={event => {
        // Esc. Prevent the native close so React state stays the source of truth.
        event.preventDefault()
        onCancel()
      }}
      onClose={() => {
        // Safety net for UA-forced closes (e.g. CloseWatcher ignoring
        // preventDefault). Guard on `open`: dialog.close() queues the close
        // event asynchronously, so StrictMode's mount→cleanup→remount cycle
        // delivers a stale close event AFTER the effect re-ran showModal().
        // If the dialog is open again by the time the event fires, it's that
        // stale event — ignore it, or the dialog cancels itself on mount.
        if (!dialogRef.current?.open) onCancel()
      }}
      onClick={event => {
        // A click on the ::backdrop registers with the <dialog> itself as target.
        if (event.target === dialogRef.current) onCancel()
      }}
    >
      <h2 id="confirm-dialog-title" className="confirm-dialog__title">{options.title}</h2>
      {options.message && (
        <p id="confirm-dialog-message" className="confirm-dialog__message">{options.message}</p>
      )}
      <div className="confirm-dialog__actions">
        <button
          ref={cancelRef}
          type="button"
          className="confirm-dialog__btn"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={
            options.destructive
              ? 'confirm-dialog__btn confirm-dialog__btn--destructive'
              : 'confirm-dialog__btn confirm-dialog__btn--primary'
          }
          onClick={onConfirm}
        >
          {options.confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
