// src/screens/Settings.tsx
import { useState, type ReactNode } from 'react'
import { ChevronRight, Database, Palette, Radio, Spade, Trash2, Undo2, Users, Wallet } from 'lucide-react'
import SettingsHeader from './settings/SettingsHeader'
import BudgetSettings from './settings/BudgetSettings'
import AppearanceSettings from './settings/AppearanceSettings'
import DataSettings from './settings/DataSettings'
import { useEntries } from '../EntriesContext'
import { sgtToday } from '../shared/sgtDate'
import { useTheme } from '../theme/ThemeContext'
import { THEMES } from '../theme/themeRegistry'
import IngestStatusCard from './settings/IngestStatusCard'
import AutomaticCaptureSettings from './settings/AutomaticCaptureSettings'
import { useConfirm } from '../components/ConfirmDialog'
import type { Entry } from '../types'

interface Props {
  onBack?: () => void
  onOpenPoker: () => void
  onOpenShared: () => void
}

// Two levels, no router: the hub pushes one subscreen at a time and every subscreen comes
// straight back here. Each subscreen owns its own state and reads its own contexts, so the
// shell passes navigation callbacks and nothing else.
type SettingsSubscreen = 'hub' | 'automatic' | 'budget' | 'appearance' | 'data'

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

export default function Settings({ onBack, onOpenPoker, onOpenShared }: Props) {
  const [subscreen, setSubscreen] = useState<SettingsSubscreen>('hub')
  const [resetSnapshot, setResetSnapshot] = useState<Entry[] | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const { entries, removeEntry, restoreEntry } = useEntries()
  const { theme } = useTheme()
  const themeName = THEMES.find(option => option.id === theme)?.name ?? THEMES[0].name
  const confirm = useConfirm()

  async function handleReset() {
    const now = sgtToday()
    const toRemove = entries.filter(entry =>
      isEntryInMonth(entry.date, now.getFullYear(), now.getMonth()),
    )
    if (toRemove.length === 0) {
      setResetMessage('No entries to reset this month')
      return
    }

    const noun = toRemove.length === 1 ? 'entry' : 'entries'
    if (!(await confirm({
      title: `Delete ${toRemove.length} ${noun} from this month?`,
      message: 'You can undo this while Settings remains open.',
      confirmLabel: 'Delete',
      destructive: true,
    }))) return

    for (const entry of toRemove) {
      await removeEntry(entry.id)
    }
    setResetSnapshot(toRemove)
    setResetMessage(`Deleted ${toRemove.length} ${noun}`)
  }

  async function handleUndoReset() {
    if (!resetSnapshot) return
    const snapshot = resetSnapshot
    setResetSnapshot(null)
    for (const entry of snapshot) {
      await restoreEntry(entry)
    }
    const noun = snapshot.length === 1 ? 'entry' : 'entries'
    setResetMessage(`Restored ${snapshot.length} ${noun}`)
  }

  const goHub = () => setSubscreen('hub')

  return (
    <div className="screen settings">
      {subscreen === 'budget' && <BudgetSettings onDone={goHub} />}
      {subscreen === 'automatic' && <AutomaticCaptureSettings onDone={goHub} />}
      {subscreen === 'appearance' && <AppearanceSettings onDone={goHub} />}
      {subscreen === 'data' && <DataSettings onDone={goHub} />}
      {subscreen === 'hub' && (
        <>
          <SettingsHeader title="Settings" backLabel="Back" onBack={onBack} />

          <IngestStatusCard />

          <div className="ios-list">
            <NavRow
              icon={<Radio className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Automatic Tracking"
              sub="Apple Pay, DBS alerts, connection status"
              onClick={() => setSubscreen('automatic')}
            />
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

          <h2 className="section-title">More tools</h2>
          <div className="ios-list">
            <NavRow
              icon={<Spade className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Poker tracker"
              sub="Sessions, P&L, trends"
              onClick={onOpenPoker}
            />
            <NavRow
              icon={<Users className="ui-icon" aria-hidden="true" strokeWidth={2.2} />}
              label="Shared budgets"
              sub="Groups, members, shared expenses"
              onClick={onOpenShared}
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
            {resetMessage && (
              <div className="entry-ledger-feedback settings-reset-feedback" role="status" aria-live="polite">
                <span>{resetMessage}</span>
                {resetSnapshot && (
                  <button type="button" onClick={() => void handleUndoReset()}>
                    <Undo2 size={16} aria-hidden="true" />
                    Undo
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
