// src/App.tsx
import { useState } from 'react'
import TabBar from './components/TabBar'
import type { Tab } from './components/TabBar'
import Dashboard from './screens/Dashboard'
import AddEntry from './screens/AddEntry'
import History from './screens/History'
import Settings from './screens/Settings'
import Poker from './screens/Poker'
import { EntriesProvider } from './EntriesContext'

function initialTab(): Tab {
  const params = new URLSearchParams(window.location.search)
  return params.get('add') === 'true' ? 'add' : 'home'
}

function AppShell() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [showSettings, setShowSettings] = useState(false)
  const [entryToEditId, setEntryToEditId] = useState<string | null>(null)

  function handleSave() {
    setTab('home')
    window.history.replaceState({}, '', window.location.pathname)
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
      {tab === 'home' && <Dashboard onSettings={() => setShowSettings(true)} />}
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

export default function App() {
  return (
    <EntriesProvider>
      <AppShell />
    </EntriesProvider>
  )
}
