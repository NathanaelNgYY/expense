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
    dialogRef.current?.showModal()
    cancelRef.current?.focus()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      onCancel={event => {
        // Esc. Prevent the native close so React state stays the source of truth.
        event.preventDefault()
        onCancel()
      }}
      onClick={event => {
        // A click on the ::backdrop registers with the <dialog> itself as target.
        if (event.target === dialogRef.current) onCancel()
      }}
    >
      <h2 id="confirm-dialog-title" className="confirm-dialog__title">{options.title}</h2>
      {options.message && <p className="confirm-dialog__message">{options.message}</p>}
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
