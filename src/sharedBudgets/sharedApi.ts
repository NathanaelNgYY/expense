import type { RealtimePostgresChangesPayload, Session } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabaseClient'
import { getCachedEntries } from '../storage'
import type { EntryChange } from './applyEntriesChange'
import type {
  ActiveBudgetData,
  BudgetMember,
  NewSharedEntry,
  Profile,
  SharedBudget,
  SharedCategory,
  SharedEntry,
} from './types'

interface SupabaseErrorLike {
  message: string
}

interface SupabaseResult<T> {
  data: T | null
  error: SupabaseErrorLike | null
}

interface BudgetRow {
  id: string
  name: string
  monthly_limit: number | string | null
  currency: string
  invite_code: string
  owner_id: string
  created_at: string
}

/** A budget row plus the embedded member-count aggregate, which PostgREST
 *  returns as a one-element array. */
interface BudgetListRow extends BudgetRow {
  budget_members?: { count: number }[]
}

interface EntryRow {
  id: string
  budget_id: string
  user_id: string
  amount: number | string
  category_id: string | null
  note: string
  date: string
  created_at: string
  updated_at: string
}

interface CategoryRow {
  id: string
  budget_id: string
  label: string
  budget_amount: number | string | null
  icon: string
}

interface MemberRow {
  budget_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  profiles: { display_name: string } | null
}

function num(value: number | string): number {
  return typeof value === 'number' ? value : parseFloat(value)
}

export function mapBudget(row: BudgetRow): SharedBudget {
  return {
    id: row.id,
    name: row.name,
    monthlyLimit: row.monthly_limit === null ? null : num(row.monthly_limit),
    currency: row.currency,
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  }
}

export function mapEntry(row: EntryRow): SharedEntry {
  return {
    id: row.id,
    budgetId: row.budget_id,
    userId: row.user_id,
    amount: num(row.amount),
    categoryId: row.category_id,
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapCategory(row: CategoryRow): SharedCategory {
  return {
    id: row.id,
    budgetId: row.budget_id,
    label: row.label,
    budgetAmount: row.budget_amount === null ? null : num(row.budget_amount),
    icon: row.icon,
  }
}

export function mapMember(row: MemberRow): BudgetMember {
  return {
    userId: row.user_id,
    role: row.role,
    displayName: row.profiles?.display_name ?? '',
    joinedAt: row.joined_at,
  }
}

function friendly(message: string): Error {
  if (message.includes('invalid_code')) return new Error('Code not found')
  if (message.includes('not_owner')) return new Error('Only the owner can do that')
  return new Error(message)
}

function ok<T>(res: SupabaseResult<T>): T {
  if (res.error) throw friendly(res.error.message)
  return res.data as T
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession()
  return data.session
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

export async function requestOtp(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) throw friendly(error.message)
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  const credentials = {
    provider: 'google',
    options: { redirectTo: window.location.origin },
  } as const

  // Linking is only worth doing when the anonymous account actually holds something.
  //
  // `ensureUserId()` mints an anonymous session on app open, long before the user taps anything,
  // so without this check *every* sign-in becomes a link — and linking an identity that already
  // belongs to an account (very often the user's own, from a previous sign-in on another device
  // or storage jar) fails with `identity_already_exists`. Every retry re-mints an empty
  // anonymous session and collides again, which is the loop users actually hit.
  //
  // An empty anonymous account is worth nothing, so drop it and sign in plainly instead.
  if (session?.user.is_anonymous && getCachedEntries().length === 0) {
    await supabase.auth.signOut()
    const { error } = await supabase.auth.signInWithOAuth(credentials)
    if (error) throw friendly(error.message)
    return
  }

  const { error } = session?.user.is_anonymous
    ? await supabase.auth.linkIdentity(credentials)
    : await supabase.auth.signInWithOAuth(credentials)
  if (error) throw friendly(error.message)
}

/**
 * Recovery for `identity_already_exists`: the Google account belongs to a real user while this
 * device is holding a throwaway anonymous one.
 *
 * Deliberately never reads the current session. `EntriesContext.refresh()` calls `ensureUserId()`
 * on focus, pageshow, visibilitychange and online, each of which mints a fresh anonymous user
 * when none exists — so signing out and then *checking* what we have races that straight back
 * into the `linkIdentity` branch that just failed, and the user sees the same error forever.
 * Going directly to `signInWithOAuth` replaces whatever session exists on the way back.
 */
export async function signInWithGoogleAsExistingAccount(): Promise<void> {
  const supabase = getSupabase()
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw friendly(error.message)
}

export async function verifyOtpCode(email: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code.trim(), type: 'email' })
  if (error) throw friendly(error.message)
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) throw friendly(error.message)
}

export async function getMyProfile(): Promise<Profile | null> {
  const session = await getSession()
  if (!session) return null
  const res = await getSupabase()
    .from('profiles')
    .select('id, display_name')
    .eq('id', session.user.id)
    .maybeSingle()
  const row = ok<{ id: string; display_name: string } | null>(res)
  return row ? { id: row.id, displayName: row.display_name } : null
}

export async function saveDisplayName(name: string): Promise<void> {
  const session = await getSession()
  if (!session) throw new Error('Not signed in')
  const res = await getSupabase()
    .from('profiles')
    .update({ display_name: name.trim() })
    .eq('id', session.user.id)
  if (res.error) throw friendly(res.error.message)
}

export async function listMyBudgets(): Promise<SharedBudget[]> {
  // The embedded aggregate rides along on the same request, so the list still
  // costs one round trip. members_select RLS already scopes it to budgets we
  // belong to, and a budget always has at least its owner.
  const res = await getSupabase()
    .from('budgets')
    .select('*, budget_members(count)')
    .order('created_at')
  return ok<BudgetListRow[]>(res).map(row => ({
    ...mapBudget(row),
    memberCount: row.budget_members?.[0]?.count ?? 1,
  }))
}

export async function createBudget(
  name: string,
  monthlyLimit: number | null,
): Promise<SharedBudget> {
  const session = await getSession()
  if (!session) throw new Error('Not signed in')
  const res = await getSupabase()
    .from('budgets')
    .insert({ name, monthly_limit: monthlyLimit, owner_id: session.user.id })
    .select()
    .single()
  return mapBudget(ok<BudgetRow>(res))
}

export async function joinBudget(code: string): Promise<SharedBudget> {
  const res = await getSupabase().rpc('join_budget', { p_code: code.trim() })
  return mapBudget(ok<BudgetRow>(res))
}

export async function fetchMembers(budgetId: string): Promise<BudgetMember[]> {
  const res = await getSupabase()
    .from('budget_members')
    .select('*, profiles(display_name)')
    .eq('budget_id', budgetId)
    .order('joined_at')
  return ok<MemberRow[]>(res).map(mapMember)
}

export async function fetchBudgetData(budgetId: string): Promise<ActiveBudgetData> {
  const supabase = getSupabase()
  const [budgetRes, entriesRes, categoriesRes, members] = await Promise.all([
    supabase.from('budgets').select('*').eq('id', budgetId).single(),
    supabase
      .from('shared_entries')
      .select('*')
      .eq('budget_id', budgetId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('shared_categories').select('*').eq('budget_id', budgetId).order('label'),
    fetchMembers(budgetId),
  ])

  return {
    budget: mapBudget(ok<BudgetRow>(budgetRes)),
    entries: ok<EntryRow[]>(entriesRes).map(mapEntry),
    categories: ok<CategoryRow[]>(categoriesRes).map(mapCategory),
    members,
  }
}

export async function updateBudget(
  budgetId: string,
  patch: { name?: string; monthlyLimit?: number | null },
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.monthlyLimit !== undefined) row.monthly_limit = patch.monthlyLimit
  const res = await getSupabase().from('budgets').update(row).eq('id', budgetId)
  if (res.error) throw friendly(res.error.message)
}

export async function deleteBudget(budgetId: string): Promise<void> {
  const res = await getSupabase().from('budgets').delete().eq('id', budgetId)
  if (res.error) throw friendly(res.error.message)
}

export async function regenerateInviteCode(budgetId: string): Promise<string> {
  const res = await getSupabase().rpc('regenerate_invite_code', { p_budget_id: budgetId })
  return ok<string>(res)
}

export async function removeMember(budgetId: string, userId: string): Promise<void> {
  const res = await getSupabase()
    .from('budget_members')
    .delete()
    .eq('budget_id', budgetId)
    .eq('user_id', userId)
  if (res.error) throw friendly(res.error.message)
}

export async function createSharedEntry(
  budgetId: string,
  input: NewSharedEntry,
): Promise<SharedEntry> {
  const session = await getSession()
  if (!session) throw new Error('Not signed in')
  const res = await getSupabase()
    .from('shared_entries')
    .insert({
      budget_id: budgetId,
      user_id: session.user.id,
      amount: input.amount,
      category_id: input.categoryId,
      note: input.note,
      date: input.date,
    })
    .select()
    .single()
  return mapEntry(ok<EntryRow>(res))
}

export async function updateSharedEntry(
  id: string,
  patch: Partial<NewSharedEntry>,
): Promise<SharedEntry> {
  const row: Record<string, unknown> = {}
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId
  if (patch.note !== undefined) row.note = patch.note
  if (patch.date !== undefined) row.date = patch.date
  const res = await getSupabase().from('shared_entries').update(row).eq('id', id).select().single()
  return mapEntry(ok<EntryRow>(res))
}

export async function deleteSharedEntry(id: string): Promise<void> {
  const res = await getSupabase().from('shared_entries').delete().eq('id', id)
  if (res.error) throw friendly(res.error.message)
}

export async function createCategory(
  budgetId: string,
  input: { label: string; budgetAmount: number | null; icon: string },
): Promise<SharedCategory> {
  const res = await getSupabase()
    .from('shared_categories')
    .insert({
      budget_id: budgetId,
      label: input.label,
      budget_amount: input.budgetAmount,
      icon: input.icon,
    })
    .select()
    .single()
  return mapCategory(ok<CategoryRow>(res))
}

export async function updateCategory(
  id: string,
  patch: Partial<{ label: string; budgetAmount: number | null; icon: string }>,
): Promise<SharedCategory> {
  const row: Record<string, unknown> = {}
  if (patch.label !== undefined) row.label = patch.label
  if (patch.budgetAmount !== undefined) row.budget_amount = patch.budgetAmount
  if (patch.icon !== undefined) row.icon = patch.icon
  const res = await getSupabase().from('shared_categories').update(row).eq('id', id).select().single()
  return mapCategory(ok<CategoryRow>(res))
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await getSupabase().from('shared_categories').delete().eq('id', id)
  if (res.error) throw friendly(res.error.message)
}

export interface BudgetRealtimeHandlers {
  onEntryChange: (change: EntryChange) => void
  onMembersChange: () => void
}

export function subscribeToBudget(
  budgetId: string,
  handlers: BudgetRealtimeHandlers,
): () => void {
  const supabase = getSupabase()
  const channel = supabase
    .channel(`budget-${budgetId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_entries', filter: `budget_id=eq.${budgetId}` },
      (payload: RealtimePostgresChangesPayload<EntryRow>) => {
        if (payload.eventType === 'DELETE') {
          handlers.onEntryChange({ type: 'DELETE', id: (payload.old as EntryRow).id })
          return
        }
        handlers.onEntryChange({ type: payload.eventType, entry: mapEntry(payload.new) })
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budget_members', filter: `budget_id=eq.${budgetId}` },
      () => handlers.onMembersChange(),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
