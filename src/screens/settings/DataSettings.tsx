// src/screens/settings/DataSettings.tsx
import { useRef, useState, type ChangeEvent } from 'react'
import { Braces, Clipboard, Download, FileText, Upload } from 'lucide-react'
import SettingsHeader from './SettingsHeader'
import { entriesToCsv, parseEntriesCsv } from '../../csvEntries'
import { downloadJsonBackup, parseImportPayload, applyImport } from '../../dataTransfer'
import { useEntries } from '../../EntriesContext'

interface Props {
  onDone: () => void
}

interface ActionRowProps {
  icon: React.ReactNode
  label: string
  sub: string
  trailing: React.ReactNode
  disabled?: boolean
  onClick: () => void
}

function ActionRow({ icon, label, sub, trailing, disabled = false, onClick }: ActionRowProps) {
  return (
    <button type="button" className="settings-action-row" disabled={disabled} onClick={onClick}>
      {icon}
      <span className="settings-row-text">
        <span className="settings-action-label">{label}</span>
        <span className="settings-row-sub">{sub}</span>
      </span>
      {trailing}
    </button>
  )
}

export default function DataSettings({ onDone }: Props) {
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState(false)
  const [showPasteImport, setShowPasteImport] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [jsonBusy, setJsonBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const jsonFileInputRef = useRef<HTMLInputElement>(null)
  const { entries, addEntry, refresh } = useEntries()

  function handleExport() {
    const blob = new Blob([entriesToCsv(entries)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'budget-entries.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (!file) return

    try {
      const importedEntries = parseEntriesCsv(await file.text())
      const existingIds = new Set(entries.map(e => e.id))
      const newEntries = importedEntries.filter(e => !existingIds.has(e.id))
      const duplicateCount = importedEntries.length - newEntries.length

      for (const e of newEntries) {
        await addEntry({ id: e.id, amount: e.amount, category: e.category, note: e.note, date: e.date })
      }

      setImportError(false)
      setImportMessage(
        newEntries.length === 0
          ? `No new entries imported. ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped.`
          : `Imported ${newEntries.length} entr${newEntries.length === 1 ? 'y' : 'ies'}.`,
      )
    } catch (error) {
      setImportError(true)
      setImportMessage(error instanceof Error ? error.message : 'Could not import this CSV file.')
    }
  }

  function handleExportJson() {
    downloadJsonBackup()
  }

  async function importJsonText(text: string) {
    setJsonBusy(true)
    try {
      const result = await applyImport(parseImportPayload(text))
      // The import is already durable server-side and in the localStorage cache (applyImport's
      // job) by this point — refresh() only pulls that into the rendered `entries` list. If it
      // fails (offline/auth), don't claim the list is up to date; say so instead of lying.
      const refreshed = await refresh()
      setImportError(false)
      const countsMessage =
        `Imported ${result.newEntries} entr${result.newEntries === 1 ? 'y' : 'ies'} and ` +
        `${result.newPokerSessions} poker session${result.newPokerSessions === 1 ? '' : 's'}.`
      setImportMessage(
        refreshed
          ? countsMessage
          : `${countsMessage} They're saved — the list will update on the next successful sync.`,
      )
      setShowPasteImport(false)
      setPasteText('')
    } catch (error) {
      setImportError(true)
      setImportMessage(error instanceof Error ? error.message : 'Could not import this data.')
    } finally {
      setJsonBusy(false)
    }
  }

  async function handleImportJsonFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    await importJsonText(await file.text())
  }

  const downloadGlyph = <Download className="ui-icon settings-row-trailing-icon" aria-hidden="true" strokeWidth={2.2} />
  const uploadGlyph = <Upload className="ui-icon settings-row-trailing-icon" aria-hidden="true" strokeWidth={2.2} />

  return (
    <>
      <SettingsHeader title="Data & Backup" backLabel="Settings" onBack={onDone} />

      <h3 className="section-title">Export</h3>
      <div className="ios-list">
        <ActionRow
          icon={<FileText className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="CSV — entries only"
          sub="Opens in Excel, Sheets, Numbers"
          trailing={downloadGlyph}
          onClick={handleExport}
        />
        <ActionRow
          icon={<Braces className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="JSON — full backup"
          sub="Entries, budgets, categories, poker sessions"
          trailing={downloadGlyph}
          onClick={handleExportJson}
        />
      </div>

      <h3 className="section-title">Import</h3>
      <input ref={importInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleImportFile} />
      <input ref={jsonFileInputRef} type="file" accept=".json,application/json" hidden onChange={handleImportJsonFile} />
      <div className="ios-list">
        <ActionRow
          icon={<FileText className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="CSV file"
          sub="Entries exported from this app"
          trailing={uploadGlyph}
          onClick={() => importInputRef.current?.click()}
        />
        <ActionRow
          icon={<Braces className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="JSON backup file"
          sub="Restores entries, budgets and poker sessions"
          trailing={uploadGlyph}
          disabled={jsonBusy}
          onClick={() => jsonFileInputRef.current?.click()}
        />
        <ActionRow
          icon={<Clipboard className="ui-icon" aria-hidden="true" strokeWidth={2} />}
          label="Paste from clipboard"
          sub="For exports shared as text"
          trailing={uploadGlyph}
          onClick={() => setShowPasteImport(v => !v)}
        />
      </div>

      {showPasteImport && (
        <div className="settings-row settings-row--stacked">
          <label className="settings-label" htmlFor="paste-import-box">Pasted export</label>
          <textarea
            id="paste-import-box"
            className="settings-input settings-input--wide"
            rows={4}
            value={pasteText}
            onChange={event => setPasteText(event.target.value)}
          />
          <button
            className="export-btn"
            type="button"
            disabled={jsonBusy || pasteText.trim() === ''}
            onClick={() => void importJsonText(pasteText)}
          >
            Import
          </button>
        </div>
      )}

      <p className="settings-hint">Duplicates are skipped automatically on import.</p>

      {importMessage && (
        <p className={`save-feedback ${importError ? 'save-feedback--error' : ''}`} role="status">
          {importMessage}
        </p>
      )}
    </>
  )
}
