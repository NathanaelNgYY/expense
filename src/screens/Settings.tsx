// src/screens/Settings.tsx
import { useState, type ReactNode } from 'react'
import { ChevronRight, Database, Palette, Trash2, Wallet } from 'lucide-react'
import SettingsHeader from './settings/SettingsHeader'
import BudgetSettings from './settings/BudgetSettings'
import AppearanceSettings from './settings/AppearanceSettings'
import DataSettings from './settings/DataSettings'
import { useEntries } from '../EntriesContext'
import { useTheme } from '../theme/ThemeContext'
import { THEMES } from '../theme/themeRegistry'
import IngestStatusCard from './settings/IngestStatusCard'

interface Props {
  onBack: () => void
}

// Two levels, no router: the hub pushes one subscreen at a time and every subscreen comes
// straight back here. Each subscreen owns its own state and reads its own contexts, so the
// shell passes navigation callbacks and nothing else.
type SettingsSubscreen = 'hub' | 'budget' | 'appearance' | 'data'

function isEntryInMonth(date: string, year: number, month: number): boolean {
  const [entryYear, entryMonth] = date.split('-').map(Number)
  return entryYear === year && entryMonth === month + 1
}

interface NavRowProps {
  icon: ReactNode
  label: string
  sub: string
  onClick: () => void
}

function NavRow({ icon, label, sub, onClick }: NavRowProps) {
  return (
    <button type="button" className="settings-nav-row" onClick={onClick}>
      {icon}
      <span className="settings-row-text">
        <span>{label}</span>
        <span className="settings-row-sub">{sub}</span>
      </span>
      <ChevronRight className="ui-icon settings-nav-chevron" aria-hidden="true" strokeWidth={2.4} />
    </button>
  )
}

export default function Settings({ onBack }: Props) {
  const [subscreen, setSubscreen] = useState<SettingsSubscreen>('hub')
  const { entries, removeEntry } = useEntries()
  const { theme } = useTheme()
  const themeName = THEMES.find(option => option.id === theme)?.name ?? THEMES[0].name

  async function handleReset() {
    if (!confirm("Delete all entries for the current month? This can't be undone.")) return

    const now = new Date()
    const toRemove = entries.filter(entry =>
      isEntryInMonth(entry.date, now.getFullYear(), now.getMonth()),
    )
    for (const entry of toRemove) {
      await removeEntry(entry.id)
    }
  }

  const goHub = () => setSubscreen('hub')

  return (
    <div className="screen settings">
      {subscreen === 'budget' && <BudgetSettings onDone={goHub} />}
      {subscreen === 'appearance' && <AppearanceSettings onDone={goHub} />}
      {subscreen === 'data' && <DataSettings onDone={goHub} />}
      {subscreen === 'hub' && (
        <>
          <SettingsHeader title="Settings" backLabel="Back" onBack={onBack} />

          <IngestStatusCard />

          <div className="ios-list">
            <NavRow
              icon={<Wallet className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Budget & Categories"
              sub="Income, monthly budgets, custom categories"
              onClick={() => setSubscreen('budget')}
            />
            <NavRow
              icon={<Palette className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Appearance"
              sub={themeName}
              onClick={() => setSubscreen('appearance')}
            />
            <NavRow
              icon={<Database className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Data & Backup"
              sub="Export, import, restore"
              onClick={() => setSubscreen('data')}
            />
          </div>

          {/* Destructive actions were previously three identical pills apart from red text.
              Colour alone is not a differentiator — this one sits alone, pushed to the bottom
              so it is never the thing a thumb lands on by accident. */}
          <section className="danger-zone settings-danger--push" aria-labelledby="danger-zone-title">
            <h3 id="danger-zone-title" className="danger-zone__title">Danger zone</h3>
            <p className="danger-zone__body">
              Deletes every entry logged this month. Exported CSVs are unaffected.
            </p>
            <button className="danger-btn" type="button" onClick={() => void handleReset()}>
              <Trash2 aria-hidden="true" size={18} strokeWidth={2.3} />
              Reset This Month&apos;s Data
            </button>
          </section>
        </>
      )}
    </div>
  )
}
