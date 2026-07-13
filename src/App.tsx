// src/App.tsx
import { lazy, Suspense, useCallback, useState } from 'react'
import TabBar from './components/TabBar'
import type { Tab } from './components/TabBar'
import SaveToast, { type ToastEntry } from './components/SaveToast'
import Dashboard from './screens/Dashboard'
import AddEntry from './screens/AddEntry'
import type { SavedEntrySummary } from './screens/AddEntry'
import { EntriesProvider, useEntries } from './EntriesContext'
import { SharedBudgetsProvider } from './sharedBudgets/SharedBudgetsContext'
import { ThemeProvider } from './theme/ThemeContext'

const History = lazy(() => import('./screens/History'))
const Settings = lazy(() => import('./screens/Settings'))
const Poker = lazy(() => import('./screens/Poker'))
const SharedScreen = lazy(() => import('./sharedBudgets/SharedScreen'))

function initialTab(): Tab {
  const params = new URLSearchParams(window.location.search)
  return params.get('add') === 'true' ? 'add' : 'home'
}

function AppShell() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [addEntryDate, setAddEntryDate] = useState<string | undefined>()
  const [showSettings, setShowSettings] = useState(false)
  // Lives in the shell, not in AddEntry: the confirmation has to outlive the screen that
  // triggered it, because saving navigates straight home.
  const [toast, setToast] = useState<ToastEntry | null>(null)
  const { removeEntry } = useEntries()

  function handleSave(saved?: SavedEntrySummary) {
    setTab('home')
    setAddEntryDate(undefined)
    setToast(saved ?? null)
    window.history.replaceState({}, '', window.location.pathname)
  }

  const dismissToast = useCallback(() => setToast(null), [])

  function handleTabChange(nextTab: Tab) {
    setAddEntryDate(undefined)
    setTab(nextTab)
  }

  function handleAddForDate(date: string) {
    setAddEntryDate(date)
    setTab('add')
  }

  function handleUndo() {
    if (toast) void removeEntry(toast.id)
    setToast(null)
  }

  if (showSettings) {
    return (
      <div className="app">
        <main><Suspense fallback={null}><Settings onBack={() => setShowSettings(false)} /></Suspense></main>
      </div>
    )
  }

  return (
    <div className="app">
      <main>
        <Suspense fallback={null}>
          {tab === 'home' && (
            <Dashboard onSettings={() => setShowSettings(true)} onAddEntry={() => setTab('add')} />
          )}
          {tab === 'add' && <AddEntry initialDate={addEntryDate} onSave={handleSave} />}
          {tab === 'history' && <History onAddForDate={handleAddForDate} />}
          {tab === 'poker' && <Poker />}
          {tab === 'shared' && <SharedScreen />}
        </Suspense>
      </main>
      {toast && <SaveToast entry={toast} onUndo={handleUndo} onDismiss={dismissToast} />}
      <TabBar active={tab} onChange={handleTabChange} />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <EntriesProvider>
        <SharedBudgetsProvider>
          <AppShell />
        </SharedBudgetsProvider>
      </EntriesProvider>
    </ThemeProvider>
  )
}
