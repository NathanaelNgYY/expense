import { useEffect, useState } from 'react'
import AuthGate, { DisplayNamePrompt } from './AuthGate'
import BudgetDetail from './BudgetDetail'
import BudgetList from './BudgetList'
import { useSharedBudgets } from './SharedBudgetsContext'

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online) return null
  return <p className="offline-banner">Shared budgets need a connection</p>
}

export default function SharedScreen() {
  const { configured, authReady, session, profile, active } = useSharedBudgets()

  if (!configured) {
    return (
      <div className="screen">
        <p className="screen-title">SHARED BUDGETS</p>
        <p className="muted">
          Shared budgets are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
          (see README).
        </p>
      </div>
    )
  }

  if (!authReady) return <div className="screen" />

  if (!session) {
    return (
      <div className="screen">
        <AuthGate />
      </div>
    )
  }

  if (profile && profile.displayName === '') {
    return (
      <div className="screen">
        <DisplayNamePrompt />
      </div>
    )
  }

  return (
    <>
      <OfflineBanner />
      {active ? <BudgetDetail /> : <BudgetList />}
    </>
  )
}
