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
import { buildCategoryOptions } from './categoryDisplay'
import { entriesForCurrency } from './shared/currency'
import { parseAddDeepLink, resolveCategoryId } from './deepLink'
import { formatHash, type Route, type SettingsSub } from './router'
import { currentRoute, goBack, navigate, replaceRoute, useRoute } from './useRoute'

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
// Lazy despite living on the eager Home path: it is a modal that only renders once
// entries have loaded and an uncategorised capture exists, so it is never first-paint
// content — and moving it out is what keeps the initial chunk under budget now that
// routing lives there.
const UncategorizedReviewDialog = lazyWithRetry(
  () => import('./components/UncategorizedReviewDialog'),
  'uncategorized-review',
)

function initialTab(): Tab {
  return parseAddDeepLink(window.location.search).add ? 'add' : 'home'
}

/**
 * Settle the address bar before the first render (U1). A cold load can arrive three
 * ways: with a real hash, with the legacy `?add=true` Shortcuts link and no hash, or
 * with nothing. All three end up on a canonical hash, and all three *replace* so no
 * junk entry is left for back to land on.
 *
 * Module scope, not an effect: the hash has to be right before `useRoute` first reads
 * it, or the shell paints Home and then jumps.
 */
function normaliseInitialRoute(): void {
  const raw = window.location.hash
  const parsed = currentRoute()
  const target: Route = raw ? parsed : { tab: initialTab(), sub: null }
  // `raw &&` — an empty hash is not "unknown", it is simply absent.
  if (!raw || formatHash(parsed) !== raw) replaceRoute(target)
}

function AppShell() {
  const { entries, editEntry, removeEntry } = useEntries()
  const { customCategories, overrides, activeCurrency } = useBudgetConfig()
  const route = useRoute()
  const tab = route.tab
  const [prefill, setPrefill] = useState<{ amount?: number; category: string | null }>(() => {
    const link = parseAddDeepLink(window.location.search)
    const options = buildCategoryOptions(overrides, customCategories)
    return {
      amount: link.amount,
      category: link.category ? resolveCategoryId(link.category, options) : null,
    }
  })
  const [showOnboarding, setShowOnboarding] = useState(() =>
    shouldShowBudgetOnboarding(initialTab() === 'add'),
  )
  const [addEntryDate, setAddEntryDate] = useState<string | undefined>()
  // Poker and Shared render through the shell (wrapped in a SettingsHeader) while the
  // other four children render inside Settings — a split U1 deliberately left alone.
  const settingsTool =
    route.sub === 'poker' || route.sub === 'shared' ? route.sub : null
  const settingsSubscreen = settingsTool ? null : route.sub
  // Lives in the shell, not in AddEntry: the confirmation has to outlive the screen that
  // triggered it, because saving navigates straight home.
  const [toast, setToast] = useState<ToastEntry | null>(null)
  const activeEntries = entriesForCurrency(entries, activeCurrency)
  const categoryOptions = buildCategoryOptions(overrides, customCategories)

  const clearPrefill = useCallback(() => setPrefill({ category: null }), [])

  function handleSave(saved?: SavedEntrySummary) {
    setAddEntryDate(undefined)
    clearPrefill()
    setToast(saved ?? null)
    // Replace, not push: back must not return to an Add screen whose entry is
    // already saved. Strips the quick-add query while keeping the new hash.
    window.history.replaceState({}, '', `${window.location.pathname}#/home`)
    replaceRoute({ tab: 'home', sub: null })
  }

  const dismissToast = useCallback(() => setToast(null), [])

  function handleTabChange(nextTab: Tab) {
    setAddEntryDate(undefined)
    clearPrefill()
    navigate({ tab: nextTab, sub: null })
  }

  function handleOpenAutomaticTracking() {
    navigate({ tab: 'settings', sub: 'automatic' })
  }

  function handleAddForDate(date: string) {
    clearPrefill()
    setAddEntryDate(date)
    navigate({ tab: 'add', sub: null })
  }

  function handleUndo() {
    if (toast) void removeEntry(toast.id)
    setToast(null)
  }

  function handleOnboardingFinish(destination: 'home' | 'add') {
    setShowOnboarding(false)
    // Replace: the first-run gate is not somewhere back should return to.
    replaceRoute({ tab: destination, sub: null })
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
              onAddEntry={() => navigate({ tab: 'add', sub: null })}
              onOpenAutomaticTracking={handleOpenAutomaticTracking}
            />
          )}
          {tab === 'add' && (
            <AddEntry
              initialDate={addEntryDate}
              initialAmount={prefill.amount}
              initialCategory={prefill.category}
              onSave={handleSave}
            />
          )}
          {tab === 'history' && <History onAddForDate={handleAddForDate} />}
          {tab === 'insights' && <Insights />}
          {tab === 'settings' && settingsTool === null && (
            <Settings
              subscreen={settingsSubscreen}
              onOpenSubscreen={(sub: SettingsSub) => navigate({ tab: 'settings', sub })}
              onLeaveSubscreen={goBack}
              onOpenPoker={() => navigate({ tab: 'settings', sub: 'poker' })}
              onOpenShared={() => navigate({ tab: 'settings', sub: 'shared' })}
            />
          )}
          {tab === 'settings' && settingsTool !== null && (
            <div className="screen settings-tool-shell">
              <SettingsHeader
                title={settingsTool === 'poker' ? 'Poker tracker' : 'Shared budgets'}
                backLabel="Settings"
                onBack={goBack}
              />
              {settingsTool === 'poker' ? <Poker /> : <SharedScreen />}
            </div>
          )}
        </Suspense>
      </main>
      {toast && <SaveToast entry={toast} onUndo={handleUndo} onDismiss={dismissToast} />}
      {/* No fallback: a modal that has not arrived yet should show nothing, not a
          spinner over the dashboard. */}
      <Suspense fallback={null}>
        <UncategorizedReviewDialog
          entries={activeEntries}
          categoryOptions={categoryOptions}
          onCategorize={(entry, categoryId) => editEntry(entry.id, { category: categoryId })}
        />
      </Suspense>
      <TabBar active={tab} onChange={handleTabChange} />
    </div>
  )
}

export default function App() {
  normaliseInitialRoute()
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
