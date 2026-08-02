import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  backLabel?: string
  onBack?: () => void
  /** Optional trailing action, e.g. a Done button on a terminal step. */
  trailing?: ReactNode
}

export default function SettingsHeader({ title, backLabel, onBack, trailing }: Props) {
  return (
    <div className="settings-header">
      {onBack ? (
        <button className="back-btn" type="button" onClick={onBack}>
          <ChevronLeft aria-hidden="true" size={21} strokeWidth={2.4} />
          {backLabel}
        </button>
      ) : <div className="settings-header-spacer" />}
      <h1 className="settings-title">{title}</h1>
      {trailing ?? <div className="settings-header-spacer" />}
    </div>
  )
}
