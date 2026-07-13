// src/screens/settings/AppearanceSettings.tsx
import SettingsHeader from './SettingsHeader'
import ThemePicker from '../../theme/ThemePicker'

interface Props {
  onDone: () => void
}

export default function AppearanceSettings({ onDone }: Props) {
  return (
    <>
      <SettingsHeader title="Appearance" backLabel="Settings" onBack={onDone} />
      <ThemePicker />
      <p className="settings-hint">Applies immediately. No save needed.</p>
    </>
  )
}
