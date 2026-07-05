/* eslint-disable react-refresh/only-export-components */
import type { Session } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { applyEntriesChange, type EntryChange } from './applyEntriesChange'
import * as sharedApi from './sharedApi'
import type { ActiveBudgetData, NewSharedEntry, Profile, SharedBudget } from './types'

export interface SharedBudgetsContextValue {
  configured: boolean
  authReady: boolean
  session: Session | null
  profile: Profile | null
  budgets: SharedBudget[]
  active: ActiveBudgetData | null
  error: string | null
  refreshProfile: () => Promise<void>
  createBudget: (name: string, monthlyLimit: number | null) => Promise<void>
  joinBudget: (code: string) => Promise<void>
  openBudget: (id: string) => Promise<void>
  closeBudget: () => void
  addEntry: (input: NewSharedEntry) => Promise<void>
  editEntry: (id: string, patch: Partial<NewSharedEntry>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  addCategory: (input: { label: string; budgetAmount: number | null; icon: string }) => Promise<void>
  updateActiveBudget: (patch: { name?: string; monthlyLimit?: number | null }) => Promise<void>
  regenerateCode: () => Promise<void>
  removeMember: (userId: string) => Promise<void>
  leaveActiveBudget: () => Promise<void>
  deleteActiveBudget: () => Promise<void>
  signOut: () => Promise<void>
}

export const SharedBudgetsContext = createContext<SharedBudgetsContextValue | null>(null)

export function SharedBudgetsProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!configured)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [budgets, setBudgets] = useState<SharedBudget[]>([])
  const [active, setActive] = useState<ActiveBudgetData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const run = useCallback(async <T,>(op: () => Promise<T>): Promise<T> => {
    try {
      const result = await op()
      setError(null)
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      throw e
    }
  }, [])

  const closeBudget = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    setActive(null)
  }, [])

  useEffect(() => {
    if (!configured) {
      return
    }
    let cancelled = false
    void sharedApi.getSession().then(s => {
      if (cancelled) return
      setSession(s)
      setAuthReady(true)
    })
    const unsubscribeAuth = sharedApi.onAuthChange(s => setSession(s))
    return () => {
      cancelled = true
      unsubscribeAuth()
    }
  }, [configured])

  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!userId) {
      queueMicrotask(() => {
        setProfile(null)
        setBudgets([])
        closeBudget()
      })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [nextProfile, nextBudgets] = await Promise.all([
          sharedApi.getMyProfile(),
          sharedApi.listMyBudgets(),
        ])
        if (cancelled) return
        setProfile(nextProfile)
        setBudgets(nextBudgets)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load shared budgets')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, closeBudget])

  useEffect(
    () => () => {
      unsubscribeRef.current?.()
    },
    [],
  )

  const refreshProfile = useCallback(async () => {
    setProfile(await sharedApi.getMyProfile())
  }, [])

  const onEntryChange = useCallback((change: EntryChange) => {
    setActive(prev => (prev ? { ...prev, entries: applyEntriesChange(prev.entries, change) } : prev))
  }, [])

  const openBudget = useCallback(
    async (id: string) =>
      run(async () => {
        unsubscribeRef.current?.()
        const data = await sharedApi.fetchBudgetData(id)
        setActive(data)
        unsubscribeRef.current = sharedApi.subscribeToBudget(id, {
          onEntryChange,
          onMembersChange: () => {
            void sharedApi
              .fetchMembers(id)
              .then(members => setActive(prev => (prev ? { ...prev, members } : prev)))
          },
        })
      }),
    [onEntryChange, run],
  )

  const createBudget = useCallback(
    async (name: string, monthlyLimit: number | null) =>
      run(async () => {
        const budget = await sharedApi.createBudget(name, monthlyLimit)
        setBudgets(prev => [...prev, budget])
      }),
    [run],
  )

  const joinBudget = useCallback(
    async (code: string) =>
      run(async () => {
        const budget = await sharedApi.joinBudget(code)
        setBudgets(prev => (prev.some(b => b.id === budget.id) ? prev : [...prev, budget]))
      }),
    [run],
  )

  const addEntry = useCallback(
    async (input: NewSharedEntry) =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        const entry = await sharedApi.createSharedEntry(active.budget.id, input)
        onEntryChange({ type: 'INSERT', entry })
      }),
    [active, onEntryChange, run],
  )

  const editEntry = useCallback(
    async (id: string, patch: Partial<NewSharedEntry>) =>
      run(async () => {
        const entry = await sharedApi.updateSharedEntry(id, patch)
        onEntryChange({ type: 'UPDATE', entry })
      }),
    [onEntryChange, run],
  )

  const removeEntry = useCallback(
    async (id: string) =>
      run(async () => {
        await sharedApi.deleteSharedEntry(id)
        onEntryChange({ type: 'DELETE', id })
      }),
    [onEntryChange, run],
  )

  const addCategory = useCallback(
    async (input: { label: string; budgetAmount: number | null; icon: string }) =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        const category = await sharedApi.createCategory(active.budget.id, input)
        setActive(prev => (prev ? { ...prev, categories: [...prev.categories, category] } : prev))
      }),
    [active, run],
  )

  const updateActiveBudget = useCallback(
    async (patch: { name?: string; monthlyLimit?: number | null }) =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        await sharedApi.updateBudget(active.budget.id, patch)
        const patchBudget = (budget: SharedBudget): SharedBudget => ({
          ...budget,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.monthlyLimit !== undefined ? { monthlyLimit: patch.monthlyLimit } : {}),
        })
        setActive(prev => (prev ? { ...prev, budget: patchBudget(prev.budget) } : prev))
        setBudgets(prev => prev.map(b => (b.id === active.budget.id ? patchBudget(b) : b)))
      }),
    [active, run],
  )

  const regenerateCode = useCallback(
    async () =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        const code = await sharedApi.regenerateInviteCode(active.budget.id)
        setActive(prev => (prev ? { ...prev, budget: { ...prev.budget, inviteCode: code } } : prev))
      }),
    [active, run],
  )

  const removeMember = useCallback(
    async (memberUserId: string) =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        await sharedApi.removeMember(active.budget.id, memberUserId)
        setActive(prev =>
          prev ? { ...prev, members: prev.members.filter(m => m.userId !== memberUserId) } : prev,
        )
      }),
    [active, run],
  )

  const leaveActiveBudget = useCallback(
    async () =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        if (!session) throw new Error('Not signed in')
        const budgetId = active.budget.id
        await sharedApi.removeMember(budgetId, session.user.id)
        closeBudget()
        setBudgets(prev => prev.filter(b => b.id !== budgetId))
      }),
    [active, closeBudget, run, session],
  )

  const deleteActiveBudget = useCallback(
    async () =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        const budgetId = active.budget.id
        await sharedApi.deleteBudget(budgetId)
        closeBudget()
        setBudgets(prev => prev.filter(b => b.id !== budgetId))
      }),
    [active, closeBudget, run],
  )

  const signOut = useCallback(async () => {
    closeBudget()
    await sharedApi.signOut()
  }, [closeBudget])

  return (
    <SharedBudgetsContext.Provider
      value={{
        configured,
        authReady,
        session,
        profile,
        budgets,
        active,
        error,
        refreshProfile,
        createBudget,
        joinBudget,
        openBudget,
        closeBudget,
        addEntry,
        editEntry,
        removeEntry,
        addCategory,
        updateActiveBudget,
        regenerateCode,
        removeMember,
        leaveActiveBudget,
        deleteActiveBudget,
        signOut,
      }}
    >
      {children}
    </SharedBudgetsContext.Provider>
  )
}

export function useSharedBudgets(): SharedBudgetsContextValue {
  const ctx = useContext(SharedBudgetsContext)
  if (!ctx) throw new Error('useSharedBudgets must be used within SharedBudgetsProvider')
  return ctx
}
