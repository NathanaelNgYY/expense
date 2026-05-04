// src/App.tsx
import { useState } from 'react'
import TabBar from './components/TabBar'
import type { Tab } from './components/TabBar'
import Dashboard from './screens/Dashboard'
import AddEntry from './screens/AddEntry'
import History from './screens/History'
import Settings from './screens/Settings'

function initialTab(): Tab {
  const params = new URLSearchParams(window.location.search)
  return params.get('add') === 'true' ? 'add' : 'home'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [showSettings, setShowSettings] = useState(false)

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
      {tab === 'history' && <History />}
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
