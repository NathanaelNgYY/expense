// src/App.tsx
import { useState } from 'react'
import TabBar from './components/TabBar'
import type { Tab } from './components/TabBar'
import Dashboard from './screens/Dashboard'
import AddEntry from './screens/AddEntry'
import History from './screens/History'
import Settings from './screens/Settings'
import Poker from './screens/Poker'
import { alreadyImported, buildApplePayEntry, parseApplePayImport } from './applePayImport'
import { getEntries, saveEntries } from './storage'

export type ApplePayImportStatus =
  | {
      kind: 'saved' | 'duplicate'
      entryId: string
      amount: number
      merchant: string
      message: string
    }
  | {
      kind: 'error'
      message: string
    }

interface InitialAppState {
  tab: Tab
  importStatus: ApplePayImportStatus | null
}

function initialTabFromParams(params: URLSearchParams): Tab {
  return params.get('add') === 'true' ? 'add' : 'home'
}

function initialAppState(): InitialAppState {
  const params = new URLSearchParams(window.location.search)

  if (params.get('auto') !== 'applepay') {
    return {
      tab: initialTabFromParams(params),
      importStatus: null,
    }
  }

  const result = parseApplePayImport(params)
  window.history.replaceState({}, '', window.location.pathname)

  if (!result.ok) {
    return {
      tab: 'home',
      importStatus: {
        kind: 'error',
        message: 'Could not save Apple Pay transaction',
      },
    }
  }

  const entries = getEntries()

  if (alreadyImported(entries, result.payload.importKey)) {
    const existingEntry = entries.find(entry => entry.importKey === result.payload.importKey)

    if (existingEntry) {
      return {
        tab: 'home',
        importStatus: {
          kind: 'duplicate',
          entryId: existingEntry.id,
          amount: existingEntry.amount,
          merchant: existingEntry.note || 'Apple Pay',
          message: 'Already saved',
        },
      }
    }
  }

  const entry = buildApplePayEntry(result.payload)
  saveEntries([...entries, entry])

  return {
    tab: 'home',
    importStatus: {
      kind: 'saved',
      entryId: entry.id,
      amount: entry.amount,
      merchant: entry.note || 'Apple Pay',
      message: 'Saved from Apple Pay',
    },
  }
}

export default function App() {
  const [initialState] = useState(initialAppState)
  const [tab, setTab] = useState<Tab>(initialState.tab)
  const [showSettings, setShowSettings] = useState(false)
  const [importStatus, setImportStatus] = useState<ApplePayImportStatus | null>(
    initialState.importStatus,
  )
  const [entryToEditId, setEntryToEditId] = useState<string | null>(null)

  function handleSave() {
    setTab('home')
    window.history.replaceState({}, '', window.location.pathname)
  }

  function handleEditImportedEntry(entryId: string) {
    setEntryToEditId(entryId)
    setImportStatus(null)
    setShowSettings(false)
    setTab('history')
  }

  if (showSettings) {
    return (
      <div className="app">
        <Settings onBack={() => setShowSettings(false)} />
      </div>
    )
  }

  return (
    <div className="app">
      {tab === 'home' && (
        <Dashboard
          onSettings={() => setShowSettings(true)}
          importStatus={importStatus}
          onEditImportedEntry={handleEditImportedEntry}
        />
      )}
      {tab === 'add' && <AddEntry onSave={handleSave} />}
      {tab === 'history' && (
        <History
          initialEditingEntryId={entryToEditId}
          onEditHandled={() => setEntryToEditId(null)}
        />
      )}
      {tab === 'poker' && <Poker />}
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
