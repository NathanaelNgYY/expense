// src/App.tsx
import { Suspense, useCallback, useState } from 'react'
import TabBar from './components/TabBar'
import type { Tab } from './components/TabBar'
import SaveToast, { type ToastEntry } from './components/SaveToast'
import LazyFallback from './components/LazyFallback'
import Dashboard from './screens/Dashboard'
import AddEntry from './screens/AddEntry'
import type { SavedEntrySummary } from './screens/AddEntry'
import { EntriesProvider, useEntries } from './EntriesContext'
import { BudgetConfigProvider, useBudgetConfig } from './BudgetConfigContext'
import { SharedBudgetsProvider } from './sharedBudgets/SharedBudgetsContext'
import { ThemeProvider } from './theme/ThemeContext'
import AppErrorBoundary from './components/AppErrorBoundary'
import { ConfirmProvider } from './components/ConfirmDialog'
import SettingsHeader from './screens/settings/SettingsHeader'
import { downloadJsonBackup } from './dataTransfer'
import { reportReactError } from './monitoring'
import { shouldShowBudgetOnboarding } from './onboarding/onboardingState'
import { lazyWithRetry } from './lazyWithRetry'
import UncategorizedReviewDialog from './components/UncategorizedReviewDialog'
import { buildCategoryOptions } from './categoryDisplay'

// lazyWithRetry (not bare React.lazy): a stale chunk after a deploy — or a
// transient mobile-network blip — would otherwise crash the lazy route to the
// error boundary. It retries, then reloads once onto the fresh index.html.
const History = lazyWithRetry(() => import('./screens/History'), 'history')
const Insights = lazyWithRetry(() => import('./screens/Insights'), 'insights')
const Settings = lazyWithRetry(() => import('./screens/Settings'), 'settings')
const Poker = lazyWithRetry(() => import('./screens/Poker'), 'poker')
const SharedScreen = lazyWithRetry(() => import('./sharedBudgets/SharedScreen'), 'shared')
const FirstRunBudgetOnboarding = lazyWithRetry(
  () => import('./onboarding/FirstRunBudgetOnboarding'),
  'onboarding',
)

function initialTab(): Tab {
  const params = new URLSearchParams(window.location.search)
  return params.get('add') === 'true' ? 'add' : 'home'
}

function AppShell() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [showOnboarding, setShowOnboarding] = useState(() =>
    shouldShowBudgetOnboarding(initialTab() === 'add'),
  )
  const [addEntryDate, setAddEntryDate] = useState<string | undefined>()
  const [settingsTool, setSettingsTool] = useState<'poker' | 'shared' | null>(null)
  const [settingsSubscreen, setSettingsSubscreen] = useState<'hub' | 'automatic'>('hub')
  // Lives in the shell, not in AddEntry: the confirmation has to outlive the screen that
  // triggered it, because saving navigates straight home.
  const [toast, setToast] = useState<ToastEntry | null>(null)
  const { entries, editEntry, removeEntry } = useEntries()
  const { customCategories, overrides } = useBudgetConfig()
  const categoryOptions = buildCategoryOptions(overrides, customCategories)

  function handleSave(saved?: SavedEntrySummary) {
    setTab('home')
    setAddEntryDate(undefined)
    setToast(saved ?? null)
    window.history.replaceState({}, '', window.location.pathname)
  }

  const dismissToast = useCallback(() => setToast(null), [])

  function handleTabChange(nextTab: Tab) {
    setAddEntryDate(undefined)
    if (nextTab !== 'settings') setSettingsTool(null)
    setSettingsSubscreen('hub')
    setTab(nextTab)
  }

  function handleOpenAutomaticTracking() {
    setSettingsTool(null)
    setSettingsSubscreen('automatic')
    setTab('settings')
  }

  function handleAddForDate(date: string) {
    setAddEntryDate(date)
    setTab('add')
  }

  function handleUndo() {
    if (toast) void removeEntry(toast.id)
    setToast(null)
  }

  function handleOnboardingFinish(destination: 'home' | 'add') {
    setShowOnboarding(false)
    setTab(destination)
  }

  if (showOnboarding) {
    return (
      <div className="app app--onboarding">
        <main>
          <Suspense fallback={<LazyFallback />}>
            <FirstRunBudgetOnboarding onFinish={handleOnboardingFinish} />
          </Suspense>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <main>
        <Suspense fallback={<LazyFallback />}>
          {tab === 'home' && (
            <Dashboard
              onAddEntry={() => setTab('add')}
              onOpenAutomaticTracking={handleOpenAutomaticTracking}
            />
          )}
          {tab === 'add' && <AddEntry initialDate={addEntryDate} onSave={handleSave} />}
          {tab === 'history' && <History onAddForDate={handleAddForDate} />}
          {tab === 'insights' && <Insights />}
          {tab === 'settings' && settingsTool === null && (
            <Settings
              initialSubscreen={settingsSubscreen}
              onOpenPoker={() => setSettingsTool('poker')}
              onOpenShared={() => setSettingsTool('shared')}
            />
          )}
          {tab === 'settings' && settingsTool !== null && (
            <div className="screen settings-tool-shell">
              <SettingsHeader
                title={settingsTool === 'poker' ? 'Poker tracker' : 'Shared budgets'}
                backLabel="Settings"
                onBack={() => setSettingsTool(null)}
              />
              {settingsTool === 'poker' ? <Poker /> : <SharedScreen />}
            </div>
          )}
        </Suspense>
      </main>
      {toast && <SaveToast entry={toast} onUndo={handleUndo} onDismiss={dismissToast} />}
      <UncategorizedReviewDialog
        entries={entries}
        categoryOptions={categoryOptions}
        onCategorize={(entry, categoryId) => editEntry(entry.id, { category: categoryId })}
      />
      <TabBar active={tab} onChange={handleTabChange} />
    </div>
  )
}

export default function App() {
  return (
    <AppErrorBoundary
      onReload={() => window.location.reload()}
      onBackup={downloadJsonBackup}
      onError={reportReactError}
    >
      <ThemeProvider>
        <EntriesProvider>
          <BudgetConfigProvider>
            <SharedBudgetsProvider>
              <ConfirmProvider>
                <AppShell />
              </ConfirmProvider>
            </SharedBudgetsProvider>
          </BudgetConfigProvider>
        </EntriesProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
