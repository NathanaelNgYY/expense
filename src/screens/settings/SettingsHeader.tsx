import { ChevronLeft } from 'lucide-react'

interface Props {
  title: string
  backLabel: string
  onBack: () => void
}

export default function SettingsHeader({ title, backLabel, onBack }: Props) {
  return (
    <div className="settings-header">
      <button className="back-btn" type="button" onClick={onBack}>
        <ChevronLeft aria-hidden="true" size={21} strokeWidth={2.4} />
        {backLabel}
      </button>
      <h1 className="settings-title">{title}</h1>
      <div className="settings-header-spacer" />
    </div>
  )
}
