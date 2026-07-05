# Shared Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared budget "pots" (create / join by invite code / realtime shared entries with per-member attribution) backed by Supabase, alongside the untouched personal budget.

**Architecture:** The client talks to Supabase directly via `supabase-js` (auth = passwordless email OTP, data = Postgres with Row Level Security, live updates = Realtime). All new client code lives in `src/sharedBudgets/`; a thin `sharedApi.ts` data-access layer isolates supabase-js so everything above it is testable with plain mocks. No Netlify Functions changes. Spec: `docs/superpowers/specs/2026-07-05-shared-budgets-design.md`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, `@supabase/supabase-js` v2, Supabase (Postgres + Auth + Realtime).

## Global Constraints

- Repo root for all commands: `budget-tracker/` (the git repo). Run `npm`/`npx` there.
- **Branch:** create `feature/shared-budgets` from `feature/custom-categories` HEAD (the shared UI reuses `BudgetIcon` + custom-category patterns that are not on `main`). Use a git worktree — the main checkout has unrelated uncommitted WIP in `src/index.css`, `src/screens/AddEntry.tsx`, `src/screens/AddEntry.test.tsx` that must not be touched or committed.
- Personal-budget code paths must not change behavior: `EntriesContext.tsx`, `api.ts`, `storage.ts`, `syncQueue.ts`, `netlify/**` are read-only for this feature (App.tsx/TabBar.tsx/index.css get additive changes only).
- All money display: `S$` prefix, 2 decimals (matches existing screens).
- Dates on entries are `YYYY-MM-DD` strings; "current month" = SGT month via `sgtDateString` (`src/shared/sgtDate.ts`). No raw `Date` arithmetic.
- Tests colocated as `*.test.ts(x)`; run with `npx vitest run <path>`; full suite `npm test`.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client-safe anon key; security is RLS).
- Commit after every task. Never commit `.env.local`.

---

### Task 1: Supabase schema migration (SQL file)

**Files:**
- Create: `supabase/migrations/001_shared_budgets.sql`

**Interfaces:**
- Consumes: nothing (pure SQL, checked into repo; the user runs it once in the Supabase SQL editor).
- Produces: tables `profiles`, `budgets`, `budget_members`, `shared_categories`, `shared_entries`; RPC functions `join_budget(p_code)`, `regenerate_invite_code(p_budget_id)`; helper `is_member(p_budget_id)`. Column names here are the snake_case source of truth that Task 2's row types and Task 5's mappers must match exactly.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/001_shared_budgets.sql` with exactly:

```sql
-- Shared Budgets schema + RLS. Run once in the Supabase SQL editor.
--
-- MANUAL RLS SMOKE TEST (after running, with two test accounts A and B):
--   1. As A: create a budget -> A sees it in budget list; B does not.
--   2. As B: join with A's invite code -> B now sees the budget, members = A + B.
--   3. As B: add an entry -> A sees it (realtime) and can edit/delete it.
--   4. As B: try UPDATE budgets SET name=... -> 0 rows (owner-only).
--   5. As B: join_budget('XXXXXX') (bad code) -> error 'invalid_code'.
--   6. As A: regenerate_invite_code -> old code no longer joins.
--   7. As A: remove B from members -> B's budget list no longer shows it.
--
-- SUPABASE DASHBOARD SETUP (one-time, not SQL):
--   Auth > Email Templates > Magic Link: body must contain {{ .Token }} so the
--   email carries the 6-digit OTP code the app asks for.

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- budgets ----------
create or replace function public.generate_invite_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random()*31)+1)::int, 1), '')
  from generate_series(1, 6)
$$;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_limit numeric,
  currency text not null default 'SGD',
  invite_code text not null unique default public.generate_invite_code(),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.budget_members (
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (budget_id, user_id)
);

create table public.shared_categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  label text not null,
  budget_amount numeric,
  icon text not null default 'others'
);

create table public.shared_entries (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount numeric not null,
  category_id uuid references public.shared_categories(id) on delete set null,
  note text not null default '',
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shared_entries_budget_date on public.shared_entries (budget_id, date desc);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger shared_entries_updated before update on public.shared_entries
for each row execute function public.set_updated_at();

-- Owner membership is created automatically when a budget is inserted.
create or replace function public.handle_new_budget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.budget_members (budget_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create trigger on_budget_created after insert on public.budgets
for each row execute function public.handle_new_budget();

-- ---------- membership helpers (security definer: avoid RLS self-recursion) ----------
create or replace function public.is_member(p_budget_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from budget_members
    where budget_id = p_budget_id and user_id = auth.uid()
  )
$$;

create or replace function public.shares_budget_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from budget_members a
    join budget_members b using (budget_id)
    where a.user_id = auth.uid() and b.user_id = p_user_id
  )
$$;

-- ---------- RPCs ----------
-- Join by invite code. SECURITY DEFINER because a non-member cannot SELECT the
-- budget row under RLS to find it.
create or replace function public.join_budget(p_code text) returns public.budgets
language plpgsql security definer set search_path = public as $$
declare
  b public.budgets;
begin
  select * into b from budgets where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'invalid_code';
  end if;
  insert into budget_members (budget_id, user_id, role)
  values (b.id, auth.uid(), 'member')
  on conflict do nothing;
  return b;
end $$;

create or replace function public.regenerate_invite_code(p_budget_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  update budgets set invite_code = public.generate_invite_code()
  where id = p_budget_id and owner_id = auth.uid()
  returning invite_code into new_code;
  if new_code is null then
    raise exception 'not_owner';
  end if;
  return new_code;
end $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_members enable row level security;
alter table public.shared_categories enable row level security;
alter table public.shared_entries enable row level security;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.shares_budget_with(id));
create policy profiles_update on public.profiles for update
  using (id = auth.uid());

create policy budgets_select on public.budgets for select
  using (owner_id = auth.uid() or public.is_member(id));
create policy budgets_insert on public.budgets for insert
  with check (owner_id = auth.uid());
create policy budgets_update on public.budgets for update
  using (owner_id = auth.uid());
create policy budgets_delete on public.budgets for delete
  using (owner_id = auth.uid());

create policy members_select on public.budget_members for select
  using (public.is_member(budget_id));
-- No INSERT policy: memberships are created only by the security-definer
-- functions handle_new_budget() and join_budget().
create policy members_delete on public.budget_members for delete
  using (exists (select 1 from public.budgets b where b.id = budget_id and b.owner_id = auth.uid()));

create policy categories_all on public.shared_categories for all
  using (public.is_member(budget_id))
  with check (public.is_member(budget_id));

create policy entries_select on public.shared_entries for select
  using (public.is_member(budget_id));
create policy entries_insert on public.shared_entries for insert
  with check (public.is_member(budget_id) and user_id = auth.uid());
-- Trusted-group model: any member can edit/delete any entry (spec decision).
create policy entries_update on public.shared_entries for update
  using (public.is_member(budget_id));
create policy entries_delete on public.shared_entries for delete
  using (public.is_member(budget_id));

-- ---------- realtime ----------
-- replica identity full so DELETE events carry the old row (needed for the
-- budget_id filter to match on deletes).
alter table public.shared_entries replica identity full;
alter publication supabase_realtime add table public.shared_entries;
alter publication supabase_realtime add table public.budget_members;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/001_shared_budgets.sql
git commit -m "feat: Supabase schema + RLS for shared budgets"
```

---

### Task 2: supabase-js dependency, client wrapper, shared types

**Files:**
- Create: `src/lib/supabaseClient.ts`
- Create: `src/lib/supabaseClient.test.ts`
- Create: `src/sharedBudgets/types.ts`
- Modify: `package.json` (via `npm install`)

**Interfaces:**
- Consumes: env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Produces: `isSupabaseConfigured(): boolean`, `getSupabase(): SupabaseClient` (lazy singleton; throws `Error('Supabase is not configured')` if env missing). Types `Profile`, `SharedBudget`, `BudgetMember`, `SharedCategory`, `SharedEntry`, `NewSharedEntry`, `ActiveBudgetData` used by every later task.

- [ ] **Step 1: Install the dependency**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/supabaseClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

describe('supabaseClient', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reports unconfigured and throws when env vars are missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(isSupabaseConfigured()).toBe(false)
    expect(() => getSupabase()).toThrow('Supabase is not configured')
  })

  it('reports configured when both env vars are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    expect(isSupabaseConfigured()).toBe(true)
    expect(getSupabase()).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/supabaseClient.test.ts`
Expected: FAIL — cannot resolve `./supabaseClient`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/supabaseClient.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Read lazily (not at module top level) so tests can stub env vars.
function env() {
  return {
    url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '',
    anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '',
  }
}

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = env()
  return Boolean(url && anonKey)
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  if (!client) {
    const { url, anonKey } = env()
    client = createClient(url, anonKey)
  }
  return client
}
```

Create `src/sharedBudgets/types.ts`:

```ts
// Client-side (camelCase) shapes for the Supabase shared-budget tables.
// Snake_case row shapes live in sharedApi.ts, which maps rows to these.
export interface Profile {
  id: string
  displayName: string
}

export interface SharedBudget {
  id: string
  name: string
  monthlyLimit: number | null
  currency: string
  inviteCode: string
  ownerId: string
  createdAt: string
}

export interface BudgetMember {
  userId: string
  role: 'owner' | 'member'
  displayName: string
  joinedAt: string
}

export interface SharedCategory {
  id: string
  budgetId: string
  label: string
  budgetAmount: number | null
  icon: string
}

export interface SharedEntry {
  id: string
  budgetId: string
  userId: string
  amount: number
  categoryId: string | null
  note: string
  date: string // YYYY-MM-DD
  createdAt: string
  updatedAt: string
}

export interface NewSharedEntry {
  amount: number
  categoryId: string | null
  note: string
  date: string
}

export interface ActiveBudgetData {
  budget: SharedBudget
  entries: SharedEntry[]
  categories: SharedCategory[]
  members: BudgetMember[]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/supabaseClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/supabaseClient.ts src/lib/supabaseClient.test.ts src/sharedBudgets/types.ts
git commit -m "feat: supabase client wrapper + shared budget types"
```

---

### Task 3: Month filtering & per-member totals (pure domain math)

**Files:**
- Create: `src/sharedBudgets/memberTotals.ts`
- Create: `src/sharedBudgets/memberTotals.test.ts`

**Interfaces:**
- Consumes: `SharedEntry`, `BudgetMember` from `./types`; `sgtDateString` from `../shared/sgtDate`.
- Produces:
  - `currentSgtMonth(): string` — `'YYYY-MM'` for now in SGT.
  - `entriesForMonth(entries: SharedEntry[], month: string): SharedEntry[]`
  - `totalSpent(entries: SharedEntry[]): number`
  - `computeMemberTotals(entries: SharedEntry[], members: BudgetMember[]): MemberTotal[]` where `interface MemberTotal { userId: string; displayName: string; total: number }` — one row per member (0 when no entries), sorted by total descending.

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/memberTotals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeMemberTotals, currentSgtMonth, entriesForMonth, totalSpent } from './memberTotals'
import type { BudgetMember, SharedEntry } from './types'

function entry(overrides: Partial<SharedEntry>): SharedEntry {
  return {
    id: 'e1',
    budgetId: 'b1',
    userId: 'u1',
    amount: 10,
    categoryId: null,
    note: '',
    date: '2026-07-03',
    createdAt: '2026-07-03T00:00:00Z',
    updatedAt: '2026-07-03T00:00:00Z',
    ...overrides,
  }
}

const members: BudgetMember[] = [
  { userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' },
  { userId: 'u2', role: 'member', displayName: 'Mum', joinedAt: '2026-07-01T00:00:00Z' },
]

describe('currentSgtMonth', () => {
  it('returns YYYY-MM', () => {
    expect(currentSgtMonth()).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('entriesForMonth', () => {
  it('keeps only entries whose date is in the month', () => {
    const list = [entry({ id: 'a', date: '2026-07-31' }), entry({ id: 'b', date: '2026-06-30' })]
    expect(entriesForMonth(list, '2026-07').map(e => e.id)).toEqual(['a'])
  })
})

describe('totalSpent', () => {
  it('sums amounts', () => {
    expect(totalSpent([entry({ amount: 1.5 }), entry({ id: 'e2', amount: 2 })])).toBeCloseTo(3.5)
  })
})

describe('computeMemberTotals', () => {
  it('includes every member, zero when no entries, sorted by total desc', () => {
    const list = [
      entry({ id: 'a', userId: 'u2', amount: 20 }),
      entry({ id: 'b', userId: 'u2', amount: 5 }),
    ]
    expect(computeMemberTotals(list, members)).toEqual([
      { userId: 'u2', displayName: 'Mum', total: 25 },
      { userId: 'u1', displayName: 'Nat', total: 0 },
    ])
  })

  it('ignores entries from departed members', () => {
    const list = [entry({ userId: 'gone', amount: 99 })]
    const totals = computeMemberTotals(list, members)
    expect(totals.every(t => t.total === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/memberTotals.test.ts`
Expected: FAIL — cannot resolve `./memberTotals`.

- [ ] **Step 3: Write the implementation**

Create `src/sharedBudgets/memberTotals.ts`:

```ts
import { sgtDateString } from '../shared/sgtDate'
import type { BudgetMember, SharedEntry } from './types'

export interface MemberTotal {
  userId: string
  displayName: string
  total: number
}

export function currentSgtMonth(): string {
  return sgtDateString(new Date().toISOString()).slice(0, 7)
}

export function entriesForMonth(entries: SharedEntry[], month: string): SharedEntry[] {
  return entries.filter(e => e.date.startsWith(month))
}

export function totalSpent(entries: SharedEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0)
}

export function computeMemberTotals(entries: SharedEntry[], members: BudgetMember[]): MemberTotal[] {
  const byUser = new Map<string, number>()
  for (const e of entries) byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + e.amount)
  return members
    .map(m => ({ userId: m.userId, displayName: m.displayName, total: byUser.get(m.userId) ?? 0 }))
    .sort((a, b) => b.total - a.total)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/memberTotals.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/memberTotals.ts src/sharedBudgets/memberTotals.test.ts
git commit -m "feat: shared budget month filtering + per-member totals"
```

---

### Task 4: Realtime entries reducer (pure)

**Files:**
- Create: `src/sharedBudgets/applyEntriesChange.ts`
- Create: `src/sharedBudgets/applyEntriesChange.test.ts`

**Interfaces:**
- Consumes: `SharedEntry` from `./types`.
- Produces:
  - `type EntryChange = { type: 'INSERT'; entry: SharedEntry } | { type: 'UPDATE'; entry: SharedEntry } | { type: 'DELETE'; id: string }`
  - `applyEntriesChange(entries: SharedEntry[], change: EntryChange): SharedEntry[]` — idempotent upsert/remove (INSERT of an existing id replaces it; DELETE of a missing id is a no-op), result sorted by `date` desc then `createdAt` desc. Task 6 applies both realtime events and local write results through this, so echoes never duplicate.

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/applyEntriesChange.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyEntriesChange } from './applyEntriesChange'
import type { SharedEntry } from './types'

function entry(id: string, date: string, createdAt = '2026-07-01T00:00:00Z'): SharedEntry {
  return {
    id,
    budgetId: 'b1',
    userId: 'u1',
    amount: 1,
    categoryId: null,
    note: '',
    date,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('applyEntriesChange', () => {
  it('inserts and sorts by date desc then createdAt desc', () => {
    const a = entry('a', '2026-07-01')
    const b = entry('b', '2026-07-02')
    const c = entry('c', '2026-07-02', '2026-07-02T09:00:00Z')
    let list = applyEntriesChange([], { type: 'INSERT', entry: a })
    list = applyEntriesChange(list, { type: 'INSERT', entry: b })
    list = applyEntriesChange(list, { type: 'INSERT', entry: c })
    expect(list.map(e => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('is idempotent: re-INSERT of same id replaces instead of duplicating', () => {
    const a = entry('a', '2026-07-01')
    const list = applyEntriesChange([a], { type: 'INSERT', entry: { ...a, amount: 9 } })
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe(9)
  })

  it('UPDATE upserts the new row', () => {
    const a = entry('a', '2026-07-01')
    const list = applyEntriesChange([a], { type: 'UPDATE', entry: { ...a, note: 'edited' } })
    expect(list[0].note).toBe('edited')
  })

  it('DELETE removes; deleting a missing id is a no-op', () => {
    const a = entry('a', '2026-07-01')
    expect(applyEntriesChange([a], { type: 'DELETE', id: 'a' })).toEqual([])
    expect(applyEntriesChange([a], { type: 'DELETE', id: 'zzz' })).toEqual([a])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/applyEntriesChange.test.ts`
Expected: FAIL — cannot resolve `./applyEntriesChange`.

- [ ] **Step 3: Write the implementation**

Create `src/sharedBudgets/applyEntriesChange.ts`:

```ts
import type { SharedEntry } from './types'

export type EntryChange =
  | { type: 'INSERT'; entry: SharedEntry }
  | { type: 'UPDATE'; entry: SharedEntry }
  | { type: 'DELETE'; id: string }

function sortEntries(entries: SharedEntry[]): SharedEntry[] {
  return [...entries].sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt.localeCompare(a.createdAt),
  )
}

// Idempotent by id: realtime echoes of our own writes replace rather than duplicate.
export function applyEntriesChange(entries: SharedEntry[], change: EntryChange): SharedEntry[] {
  if (change.type === 'DELETE') return entries.filter(e => e.id !== change.id)
  const rest = entries.filter(e => e.id !== change.entry.id)
  return sortEntries([...rest, change.entry])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/applyEntriesChange.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/applyEntriesChange.ts src/sharedBudgets/applyEntriesChange.test.ts
git commit -m "feat: idempotent realtime reducer for shared entries"
```

---

### Task 5: Data-access layer `sharedApi.ts`

**Files:**
- Create: `src/sharedBudgets/sharedApi.ts`
- Create: `src/sharedBudgets/sharedApi.test.ts`

**Interfaces:**
- Consumes: `getSupabase` from `../lib/supabaseClient`; types from `./types`; `EntryChange` from `./applyEntriesChange`.
- Produces (everything Tasks 6–10 call — exact signatures):
  ```ts
  // auth
  getSession(): Promise<Session | null>
  onAuthChange(cb: (session: Session | null) => void): () => void
  requestOtp(email: string): Promise<void>
  verifyOtpCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
  // profile
  getMyProfile(): Promise<Profile | null>
  saveDisplayName(name: string): Promise<void>
  // budgets
  listMyBudgets(): Promise<SharedBudget[]>
  createBudget(name: string, monthlyLimit: number | null): Promise<SharedBudget>
  joinBudget(code: string): Promise<SharedBudget>
  fetchBudgetData(budgetId: string): Promise<ActiveBudgetData>
  fetchMembers(budgetId: string): Promise<BudgetMember[]>
  updateBudget(budgetId: string, patch: { name?: string; monthlyLimit?: number | null }): Promise<void>
  deleteBudget(budgetId: string): Promise<void>
  regenerateInviteCode(budgetId: string): Promise<string>
  removeMember(budgetId: string, userId: string): Promise<void>
  // entries & categories
  createSharedEntry(budgetId: string, input: NewSharedEntry): Promise<SharedEntry>
  updateSharedEntry(id: string, patch: Partial<NewSharedEntry>): Promise<SharedEntry>
  deleteSharedEntry(id: string): Promise<void>
  createCategory(budgetId: string, input: { label: string; budgetAmount: number | null; icon: string }): Promise<SharedCategory>
  // realtime
  interface BudgetRealtimeHandlers { onEntryChange(change: EntryChange): void; onMembersChange(): void }
  subscribeToBudget(budgetId: string, handlers: BudgetRealtimeHandlers): () => void
  // row mappers exported for tests
  mapBudget, mapEntry, mapCategory, mapMember
  ```

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/sharedApi.test.ts` (tests the pure mappers plus the rpc plumbing of `joinBudget`; the rest of the module is thin supabase-js glue exercised via Task 6's mocked-api tests and the manual RLS smoke test):

```ts
import { describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../lib/supabaseClient', () => ({
  getSupabase: () => ({ rpc }),
  isSupabaseConfigured: () => true,
}))

import { joinBudget, mapBudget, mapEntry, mapMember } from './sharedApi'

const budgetRow = {
  id: 'b1',
  name: 'Family',
  monthly_limit: 500,
  currency: 'SGD',
  invite_code: 'ABC234',
  owner_id: 'u1',
  created_at: '2026-07-01T00:00:00Z',
}

describe('mappers', () => {
  it('mapBudget converts snake_case row to SharedBudget', () => {
    expect(mapBudget(budgetRow)).toEqual({
      id: 'b1',
      name: 'Family',
      monthlyLimit: 500,
      currency: 'SGD',
      inviteCode: 'ABC234',
      ownerId: 'u1',
      createdAt: '2026-07-01T00:00:00Z',
    })
  })

  it('mapBudget passes through null monthly_limit', () => {
    expect(mapBudget({ ...budgetRow, monthly_limit: null }).monthlyLimit).toBeNull()
  })

  it('mapEntry coerces numeric amount strings to numbers', () => {
    const row = {
      id: 'e1',
      budget_id: 'b1',
      user_id: 'u1',
      amount: '12.50', // Postgres numeric can arrive as string
      category_id: null,
      note: 'lunch',
      date: '2026-07-03',
      created_at: '2026-07-03T04:00:00Z',
      updated_at: '2026-07-03T04:00:00Z',
    }
    expect(mapEntry(row).amount).toBe(12.5)
  })

  it('mapMember flattens the embedded profile display name', () => {
    const row = {
      budget_id: 'b1',
      user_id: 'u2',
      role: 'member' as const,
      joined_at: '2026-07-02T00:00:00Z',
      profiles: { display_name: 'Mum' },
    }
    expect(mapMember(row)).toEqual({
      userId: 'u2',
      role: 'member',
      displayName: 'Mum',
      joinedAt: '2026-07-02T00:00:00Z',
    })
  })
})

describe('joinBudget', () => {
  it('calls the join_budget rpc and maps the returned row', async () => {
    rpc.mockResolvedValue({ data: budgetRow, error: null })
    const budget = await joinBudget('  abc234 ')
    expect(rpc).toHaveBeenCalledWith('join_budget', { p_code: 'abc234' })
    expect(budget.inviteCode).toBe('ABC234')
  })

  it('throws a friendly error on invalid_code', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_code' } })
    await expect(joinBudget('NOPE')).rejects.toThrow('Code not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/sharedApi.test.ts`
Expected: FAIL — cannot resolve `./sharedApi`.

- [ ] **Step 3: Write the implementation**

Create `src/sharedBudgets/sharedApi.ts`:

```ts
import type { RealtimePostgresChangesPayload, Session } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabaseClient'
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

// ---------- row shapes (snake_case, as stored in Postgres) ----------
interface BudgetRow {
  id: string
  name: string
  monthly_limit: number | string | null
  currency: string
  invite_code: string
  owner_id: string
  created_at: string
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

// Postgres numeric columns can arrive as strings; normalise once here.
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

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw friendly(res.error.message)
  return res.data as T
}

// ---------- auth ----------
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
    options: { shouldCreateUser: true },
  })
  if (error) throw friendly(error.message)
}

export async function verifyOtpCode(email: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code.trim(), type: 'email' })
  if (error) throw friendly(error.message)
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut()
}

// ---------- profile ----------
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

// ---------- budgets ----------
export async function listMyBudgets(): Promise<SharedBudget[]> {
  const res = await getSupabase().from('budgets').select('*').order('created_at')
  return ok<BudgetRow[]>(res).map(mapBudget)
}

export async function createBudget(name: string, monthlyLimit: number | null): Promise<SharedBudget> {
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

// ---------- entries & categories ----------
export async function createSharedEntry(budgetId: string, input: NewSharedEntry): Promise<SharedEntry> {
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

export async function updateSharedEntry(id: string, patch: Partial<NewSharedEntry>): Promise<SharedEntry> {
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
    .insert({ budget_id: budgetId, label: input.label, budget_amount: input.budgetAmount, icon: input.icon })
    .select()
    .single()
  return mapCategory(ok<CategoryRow>(res))
}

// ---------- realtime ----------
export interface BudgetRealtimeHandlers {
  onEntryChange: (change: EntryChange) => void
  onMembersChange: () => void
}

export function subscribeToBudget(budgetId: string, handlers: BudgetRealtimeHandlers): () => void {
  const supabase = getSupabase()
  const channel = supabase
    .channel(`budget-${budgetId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_entries', filter: `budget_id=eq.${budgetId}` },
      (payload: RealtimePostgresChangesPayload<EntryRow>) => {
        if (payload.eventType === 'DELETE') {
          handlers.onEntryChange({ type: 'DELETE', id: (payload.old as EntryRow).id })
        } else {
          handlers.onEntryChange({ type: payload.eventType, entry: mapEntry(payload.new as EntryRow) })
        }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/sharedApi.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/sharedApi.ts src/sharedBudgets/sharedApi.test.ts
git commit -m "feat: supabase data-access layer for shared budgets"
```

---

### Task 6: `SharedBudgetsContext`

**Files:**
- Create: `src/sharedBudgets/SharedBudgetsContext.tsx`
- Create: `src/sharedBudgets/SharedBudgetsContext.test.tsx`

**Interfaces:**
- Consumes: everything from `./sharedApi` (Task 5 signatures), `applyEntriesChange`, `isSupabaseConfigured`.
- Produces (used by all UI tasks):
  ```ts
  interface SharedBudgetsContextValue {
    configured: boolean
    authReady: boolean          // false until the initial getSession resolves
    session: Session | null
    profile: Profile | null
    budgets: SharedBudget[]
    active: ActiveBudgetData | null
    error: string | null        // last operation error, cleared on next success
    refreshProfile(): Promise<void>
    createBudget(name: string, monthlyLimit: number | null): Promise<void>
    joinBudget(code: string): Promise<void>
    openBudget(id: string): Promise<void>
    closeBudget(): void
    addEntry(input: NewSharedEntry): Promise<void>
    editEntry(id: string, patch: Partial<NewSharedEntry>): Promise<void>
    removeEntry(id: string): Promise<void>
    addCategory(input: { label: string; budgetAmount: number | null; icon: string }): Promise<void>
    updateActiveBudget(patch: { name?: string; monthlyLimit?: number | null }): Promise<void>
    regenerateCode(): Promise<void>
    removeMember(userId: string): Promise<void>
    deleteActiveBudget(): Promise<void>
    signOut(): Promise<void>
  }
  function useSharedBudgets(): SharedBudgetsContextValue
  // ALSO export the raw context for component tests:
  export const SharedBudgetsContext: React.Context<SharedBudgetsContextValue | null>
  export function SharedBudgetsProvider({ children }): JSX.Element
  ```
- AuthGate (Task 7) calls `sharedApi.requestOtp/verifyOtpCode` directly; the context only *observes* the session via `onAuthChange`.

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/SharedBudgetsContext.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveBudgetData, SharedBudget } from './types'

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => {
    throw new Error('context must go through sharedApi')
  },
}))

const api = {
  getSession: vi.fn(),
  onAuthChange: vi.fn(),
  getMyProfile: vi.fn(),
  listMyBudgets: vi.fn(),
  fetchBudgetData: vi.fn(),
  fetchMembers: vi.fn(),
  subscribeToBudget: vi.fn(),
  createBudget: vi.fn(),
  joinBudget: vi.fn(),
  createSharedEntry: vi.fn(),
  updateSharedEntry: vi.fn(),
  deleteSharedEntry: vi.fn(),
  createCategory: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  regenerateInviteCode: vi.fn(),
  removeMember: vi.fn(),
  saveDisplayName: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtpCode: vi.fn(),
  signOut: vi.fn(),
}
vi.mock('./sharedApi', () => api)

import { SharedBudgetsProvider, useSharedBudgets } from './SharedBudgetsContext'
import type { BudgetRealtimeHandlers } from './sharedApi'

const session = { user: { id: 'u1', email: 'nat@example.com' } } as Session

const budget: SharedBudget = {
  id: 'b1',
  name: 'Family',
  monthlyLimit: 500,
  currency: 'SGD',
  inviteCode: 'ABC234',
  ownerId: 'u1',
  createdAt: '2026-07-01T00:00:00Z',
}

const activeData: ActiveBudgetData = {
  budget,
  entries: [],
  categories: [],
  members: [{ userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' }],
}

let ctx: ReturnType<typeof useSharedBudgets>
function Probe() {
  ctx = useSharedBudgets()
  return <div data-testid="budget-count">{ctx.budgets.length}</div>
}

let realtimeHandlers: BudgetRealtimeHandlers | null = null
const unsubscribe = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  realtimeHandlers = null
  api.getSession.mockResolvedValue(session)
  api.onAuthChange.mockReturnValue(() => {})
  api.getMyProfile.mockResolvedValue({ id: 'u1', displayName: 'Nat' })
  api.listMyBudgets.mockResolvedValue([budget])
  api.fetchBudgetData.mockResolvedValue(activeData)
  api.subscribeToBudget.mockImplementation((_id: string, handlers: BudgetRealtimeHandlers) => {
    realtimeHandlers = handlers
    return unsubscribe
  })
})

describe('SharedBudgetsProvider', () => {
  it('loads profile and budgets once a session exists', async () => {
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('budget-count')).toHaveTextContent('1'))
    expect(ctx.profile?.displayName).toBe('Nat')
    expect(ctx.authReady).toBe(true)
  })

  it('openBudget fetches data and subscribes; realtime entry INSERT lands in state', async () => {
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(() => ctx.openBudget('b1'))
    expect(api.subscribeToBudget).toHaveBeenCalledWith('b1', expect.any(Object))
    act(() =>
      realtimeHandlers!.onEntryChange({
        type: 'INSERT',
        entry: {
          id: 'e1',
          budgetId: 'b1',
          userId: 'u2',
          amount: 7,
          categoryId: null,
          note: 'kopi',
          date: '2026-07-05',
          createdAt: '2026-07-05T01:00:00Z',
          updatedAt: '2026-07-05T01:00:00Z',
        },
      }),
    )
    expect(ctx.active?.entries.map(e => e.id)).toEqual(['e1'])
  })

  it('closeBudget unsubscribes and clears active state', async () => {
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(() => ctx.openBudget('b1'))
    act(() => ctx.closeBudget())
    expect(unsubscribe).toHaveBeenCalled()
    expect(ctx.active).toBeNull()
  })

  it('addEntry applies the created entry to active state', async () => {
    api.createSharedEntry.mockResolvedValue({
      id: 'e9',
      budgetId: 'b1',
      userId: 'u1',
      amount: 12,
      categoryId: null,
      note: '',
      date: '2026-07-05',
      createdAt: '2026-07-05T02:00:00Z',
      updatedAt: '2026-07-05T02:00:00Z',
    })
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(() => ctx.openBudget('b1'))
    await act(() => ctx.addEntry({ amount: 12, categoryId: null, note: '', date: '2026-07-05' }))
    expect(api.createSharedEntry).toHaveBeenCalledWith('b1', {
      amount: 12,
      categoryId: null,
      note: '',
      date: '2026-07-05',
    })
    expect(ctx.active?.entries.map(e => e.id)).toEqual(['e9'])
  })

  it('surfaces operation failures via error', async () => {
    api.joinBudget.mockRejectedValue(new Error('Code not found'))
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(async () => {
      await ctx.joinBudget('NOPE').catch(() => {})
    })
    expect(ctx.error).toBe('Code not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/SharedBudgetsContext.test.tsx`
Expected: FAIL — cannot resolve `./SharedBudgetsContext`.

- [ ] **Step 3: Write the implementation**

Create `src/sharedBudgets/SharedBudgetsContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
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
  deleteActiveBudget: () => Promise<void>
  signOut: () => Promise<void>
}

export const SharedBudgetsContext = createContext<SharedBudgetsContextValue | null>(null)

export function SharedBudgetsProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [budgets, setBudgets] = useState<SharedBudget[]>([])
  const [active, setActive] = useState<ActiveBudgetData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Wraps every user-triggered operation: clears/sets error and rethrows so
  // callers can also react (e.g. keep a form open).
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

  // Observe auth state; AuthGate performs the actual sign-in calls.
  useEffect(() => {
    if (!configured) {
      setAuthReady(true)
      return
    }
    let cancelled = false
    void sharedApi.getSession().then(s => {
      if (cancelled) return
      setSession(s)
      setAuthReady(true)
    })
    const unsub = sharedApi.onAuthChange(s => setSession(s))
    return () => {
      cancelled = true
      unsub()
    }
  }, [configured])

  const closeBudget = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    setActive(null)
  }, [])

  // Load (or clear) account-level data when the signed-in user changes.
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setBudgets([])
      closeBudget()
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [p, list] = await Promise.all([sharedApi.getMyProfile(), sharedApi.listMyBudgets()])
        if (cancelled) return
        setProfile(p)
        setBudgets(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load shared budgets')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, closeBudget])

  // Clean up any live subscription on unmount.
  useEffect(() => () => unsubscribeRef.current?.(), [])

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
    [run, onEntryChange],
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
    [run, active, onEntryChange],
  )

  const editEntry = useCallback(
    async (id: string, patch: Partial<NewSharedEntry>) =>
      run(async () => {
        const entry = await sharedApi.updateSharedEntry(id, patch)
        onEntryChange({ type: 'UPDATE', entry })
      }),
    [run, onEntryChange],
  )

  const removeEntry = useCallback(
    async (id: string) =>
      run(async () => {
        await sharedApi.deleteSharedEntry(id)
        onEntryChange({ type: 'DELETE', id })
      }),
    [run, onEntryChange],
  )

  const addCategory = useCallback(
    async (input: { label: string; budgetAmount: number | null; icon: string }) =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        const category = await sharedApi.createCategory(active.budget.id, input)
        setActive(prev => (prev ? { ...prev, categories: [...prev.categories, category] } : prev))
      }),
    [run, active],
  )

  const updateActiveBudget = useCallback(
    async (patch: { name?: string; monthlyLimit?: number | null }) =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        await sharedApi.updateBudget(active.budget.id, patch)
        setActive(prev =>
          prev
            ? {
                ...prev,
                budget: {
                  ...prev.budget,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.monthlyLimit !== undefined ? { monthlyLimit: patch.monthlyLimit } : {}),
                },
              }
            : prev,
        )
        setBudgets(prev =>
          prev.map(b =>
            b.id === active.budget.id
              ? {
                  ...b,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.monthlyLimit !== undefined ? { monthlyLimit: patch.monthlyLimit } : {}),
                }
              : b,
          ),
        )
      }),
    [run, active],
  )

  const regenerateCode = useCallback(
    async () =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        const code = await sharedApi.regenerateInviteCode(active.budget.id)
        setActive(prev => (prev ? { ...prev, budget: { ...prev.budget, inviteCode: code } } : prev))
      }),
    [run, active],
  )

  const removeMember = useCallback(
    async (userId: string) =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        await sharedApi.removeMember(active.budget.id, userId)
        setActive(prev =>
          prev ? { ...prev, members: prev.members.filter(m => m.userId !== userId) } : prev,
        )
      }),
    [run, active],
  )

  const deleteActiveBudget = useCallback(
    async () =>
      run(async () => {
        if (!active) throw new Error('No open budget')
        const id = active.budget.id
        await sharedApi.deleteBudget(id)
        closeBudget()
        setBudgets(prev => prev.filter(b => b.id !== id))
      }),
    [run, active, closeBudget],
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/SharedBudgetsContext.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/SharedBudgetsContext.tsx src/sharedBudgets/SharedBudgetsContext.test.tsx
git commit -m "feat: shared budgets context with realtime subscription"
```

---

### Task 7: `AuthGate` (email → OTP code → display name)

**Files:**
- Create: `src/sharedBudgets/AuthGate.tsx`
- Create: `src/sharedBudgets/AuthGate.test.tsx`

**Interfaces:**
- Consumes: `requestOtp`, `verifyOtpCode`, `saveDisplayName` from `./sharedApi`; `useSharedBudgets` (for `profile`, `refreshProfile`).
- Produces: default export `AuthGate()` — no props. Renders the email step, then the code step, and — used separately by Task 11 — named export `DisplayNamePrompt()` for when `profile.displayName === ''`.

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/AuthGate.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SharedBudgetsContextValue } from './SharedBudgetsContext'
import { SharedBudgetsContext } from './SharedBudgetsContext'

const api = {
  requestOtp: vi.fn(),
  verifyOtpCode: vi.fn(),
  saveDisplayName: vi.fn(),
}
vi.mock('./sharedApi', () => api)

import AuthGate, { DisplayNamePrompt } from './AuthGate'

const baseCtx = {
  refreshProfile: vi.fn(),
} as unknown as SharedBudgetsContextValue

function renderWithCtx(ui: React.ReactElement) {
  return render(<SharedBudgetsContext.Provider value={baseCtx}>{ui}</SharedBudgetsContext.Provider>)
}

beforeEach(() => vi.clearAllMocks())

describe('AuthGate', () => {
  it('requests a code then shows the code step', async () => {
    api.requestOtp.mockResolvedValue(undefined)
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(api.requestOtp).toHaveBeenCalledWith('nat@example.com'))
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument()
  })

  it('verifies the entered code', async () => {
    api.requestOtp.mockResolvedValue(undefined)
    api.verifyOtpCode.mockResolvedValue(undefined)
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByPlaceholderText('6-digit code')
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(api.verifyOtpCode).toHaveBeenCalledWith('nat@example.com', '123456'))
  })

  it('shows the error message when sending fails', async () => {
    api.requestOtp.mockRejectedValue(new Error('rate limited'))
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText('rate limited')).toBeInTheDocument()
  })
})

describe('DisplayNamePrompt', () => {
  it('saves the name and refreshes the profile', async () => {
    api.saveDisplayName.mockResolvedValue(undefined)
    renderWithCtx(<DisplayNamePrompt />)
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Nat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(api.saveDisplayName).toHaveBeenCalledWith('Nat'))
    expect(baseCtx.refreshProfile).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/AuthGate.test.tsx`
Expected: FAIL — cannot resolve `./AuthGate`.

- [ ] **Step 3: Write the implementation**

Create `src/sharedBudgets/AuthGate.tsx`:

```tsx
import { useState } from 'react'
import * as sharedApi from './sharedApi'
import { useSharedBudgets } from './SharedBudgetsContext'

// Email OTP sign-in. Typing a 6-digit code (instead of tapping a magic link)
// keeps the session inside the installed PWA — a link tap would open Safari.
export default function AuthGate() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shared-auth">
      <p className="screen-title">SHARED BUDGETS</p>
      {step === 'email' ? (
        <>
          <p className="muted">Sign in with your email to use shared budgets.</p>
          <input
            type="email"
            className="note-input"
            placeholder="you@email.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || !email.includes('@')}
            onClick={() =>
              void submit(async () => {
                await sharedApi.requestOtp(email.trim())
                setStep('code')
              })
            }
          >
            Send code
          </button>
        </>
      ) : (
        <>
          <p className="muted">Enter the 6-digit code sent to {email.trim()}.</p>
          <input
            type="text"
            inputMode="numeric"
            className="note-input"
            placeholder="6-digit code"
            autoComplete="one-time-code"
            value={code}
            onChange={e => setCode(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || code.trim().length < 6}
            onClick={() => void submit(() => sharedApi.verifyOtpCode(email.trim(), code))}
          >
            Verify
          </button>
          <button type="button" className="link-btn" onClick={() => setStep('email')}>
            Use a different email
          </button>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

// Shown (by SharedScreen) after first sign-in until a display name is saved,
// so entries can be attributed to a human-readable name.
export function DisplayNamePrompt() {
  const { refreshProfile } = useSharedBudgets()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="shared-auth">
      <p className="screen-title">WHAT'S YOUR NAME?</p>
      <p className="muted">Shown next to entries you add in shared budgets.</p>
      <input
        type="text"
        className="note-input"
        placeholder="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <button
        type="button"
        className="save-btn"
        disabled={busy || name.trim().length === 0}
        onClick={() => {
          setBusy(true)
          setError(null)
          void sharedApi
            .saveDisplayName(name.trim())
            .then(() => refreshProfile())
            .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong'))
            .finally(() => setBusy(false))
        }}
      >
        Save name
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/AuthGate.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/AuthGate.tsx src/sharedBudgets/AuthGate.test.tsx
git commit -m "feat: email OTP auth gate + display name prompt"
```

---

### Task 8: `BudgetList` (list, create, join)

**Files:**
- Create: `src/sharedBudgets/BudgetList.tsx`
- Create: `src/sharedBudgets/BudgetList.test.tsx`

**Interfaces:**
- Consumes: `useSharedBudgets` — `budgets`, `createBudget`, `joinBudget`, `openBudget`, `signOut`, `error`.
- Produces: default export `BudgetList()` — no props.

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/BudgetList.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BudgetList from './BudgetList'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'
import type { SharedBudget } from './types'

const budget: SharedBudget = {
  id: 'b1',
  name: 'Family',
  monthlyLimit: 500,
  currency: 'SGD',
  inviteCode: 'ABC234',
  ownerId: 'u1',
  createdAt: '2026-07-01T00:00:00Z',
}

const ctx = {
  budgets: [budget],
  error: null,
  createBudget: vi.fn().mockResolvedValue(undefined),
  joinBudget: vi.fn().mockResolvedValue(undefined),
  openBudget: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
} as unknown as SharedBudgetsContextValue

function renderList() {
  return render(
    <SharedBudgetsContext.Provider value={ctx}>
      <BudgetList />
    </SharedBudgetsContext.Provider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('BudgetList', () => {
  it('lists budgets and opens one on tap', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: /Family/ }))
    expect(ctx.openBudget).toHaveBeenCalledWith('b1')
  })

  it('creates a budget from the New budget form', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'New budget' }))
    fireEvent.change(screen.getByPlaceholderText('Budget name'), { target: { value: 'Trip' } })
    fireEvent.change(screen.getByPlaceholderText('Monthly limit (optional)'), {
      target: { value: '300' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(ctx.createBudget).toHaveBeenCalledWith('Trip', 300))
  })

  it('creates with null limit when the limit field is empty', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'New budget' }))
    fireEvent.change(screen.getByPlaceholderText('Budget name'), { target: { value: 'Trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(ctx.createBudget).toHaveBeenCalledWith('Trip', null))
  })

  it('joins with a code', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Join with code' }))
    fireEvent.change(screen.getByPlaceholderText('Invite code'), { target: { value: 'XYZ789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(ctx.joinBudget).toHaveBeenCalledWith('XYZ789'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/BudgetList.test.tsx`
Expected: FAIL — cannot resolve `./BudgetList`.

- [ ] **Step 3: Write the implementation**

Create `src/sharedBudgets/BudgetList.tsx`:

```tsx
import { useState } from 'react'
import { Users } from 'lucide-react'
import { useSharedBudgets } from './SharedBudgetsContext'

export default function BudgetList() {
  const { budgets, error, createBudget, joinBudget, openBudget, signOut } = useSharedBudgets()
  const [form, setForm] = useState<'none' | 'create' | 'join'>('none')
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      setForm('none')
      setName('')
      setLimit('')
      setCode('')
    } catch {
      // context.error carries the message; keep the form open
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen shared-list">
      <p className="screen-title">SHARED BUDGETS</p>

      {budgets.length === 0 && form === 'none' && (
        <p className="muted">No shared budgets yet. Create one or join with a code.</p>
      )}

      <div className="shared-budget-cards">
        {budgets.map(b => (
          <button
            key={b.id}
            type="button"
            className="shared-budget-card"
            onClick={() => void openBudget(b.id)}
          >
            <Users className="ui-icon" aria-hidden="true" />
            <span className="shared-budget-name">{b.name}</span>
            <span className="muted">
              {b.monthlyLimit !== null ? `S$${b.monthlyLimit.toFixed(2)}/mo` : 'No limit'}
            </span>
          </button>
        ))}
      </div>

      {form === 'create' && (
        <div className="shared-form">
          <input
            type="text"
            className="note-input"
            placeholder="Budget name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            type="number"
            className="note-input"
            placeholder="Monthly limit (optional)"
            inputMode="decimal"
            value={limit}
            onChange={e => setLimit(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || name.trim().length === 0}
            onClick={() =>
              void submit(() =>
                createBudget(name.trim(), limit.trim() === '' ? null : parseFloat(limit)),
              )
            }
          >
            Create
          </button>
        </div>
      )}

      {form === 'join' && (
        <div className="shared-form">
          <input
            type="text"
            className="note-input"
            placeholder="Invite code"
            autoCapitalize="characters"
            value={code}
            onChange={e => setCode(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || code.trim().length === 0}
            onClick={() => void submit(() => joinBudget(code.trim()))}
          >
            Join
          </button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {form === 'none' ? (
        <div className="shared-actions">
          <button type="button" className="save-btn" onClick={() => setForm('create')}>
            New budget
          </button>
          <button type="button" className="save-btn" onClick={() => setForm('join')}>
            Join with code
          </button>
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setForm('none')}>
          Cancel
        </button>
      )}

      <button type="button" className="link-btn shared-signout" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/BudgetList.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/BudgetList.tsx src/sharedBudgets/BudgetList.test.tsx
git commit -m "feat: shared budget list with create/join"
```

---

### Task 9: `BudgetDetail` — entries feed, add form, progress, member totals

**Files:**
- Create: `src/sharedBudgets/BudgetDetail.tsx`
- Create: `src/sharedBudgets/BudgetDetail.test.tsx`

**Interfaces:**
- Consumes: `useSharedBudgets` — `active`, `session`, `closeBudget`, `addEntry`, `removeEntry`, `error`; `computeMemberTotals`, `currentSgtMonth`, `entriesForMonth`, `totalSpent` from `./memberTotals`; `BudgetIcon` from `../components/BudgetIcon`; `toLocalDateString` from `../dates`.
- Produces: default export `BudgetDetail()` — no props. Renders `<OwnerTools />` (Task 10) when the signed-in user is the owner; until Task 10 exists, Step 3 ships a placeholder `OwnerTools` in a separate file that renders nothing.

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/BudgetDetail.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BudgetDetail from './BudgetDetail'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'
import type { ActiveBudgetData } from './types'
import type { Session } from '@supabase/supabase-js'
import { toLocalDateString } from '../dates'

const today = toLocalDateString()

const active: ActiveBudgetData = {
  budget: {
    id: 'b1',
    name: 'Family',
    monthlyLimit: 100,
    currency: 'SGD',
    inviteCode: 'ABC234',
    ownerId: 'u1',
    createdAt: '2026-07-01T00:00:00Z',
  },
  entries: [
    {
      id: 'e1',
      budgetId: 'b1',
      userId: 'u2',
      amount: 30,
      categoryId: null,
      note: 'groceries',
      date: today,
      createdAt: `${today}T02:00:00Z`,
      updatedAt: `${today}T02:00:00Z`,
    },
  ],
  categories: [{ id: 'c1', budgetId: 'b1', label: 'Food', budgetAmount: null, icon: 'others' }],
  members: [
    { userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' },
    { userId: 'u2', role: 'member', displayName: 'Mum', joinedAt: '2026-07-01T00:00:00Z' },
  ],
}

const ctx = {
  active,
  session: { user: { id: 'u2' } } as Session,
  error: null,
  closeBudget: vi.fn(),
  addEntry: vi.fn().mockResolvedValue(undefined),
  removeEntry: vi.fn().mockResolvedValue(undefined),
} as unknown as SharedBudgetsContextValue

function renderDetail(value: SharedBudgetsContextValue = ctx) {
  return render(
    <SharedBudgetsContext.Provider value={value}>
      <BudgetDetail />
    </SharedBudgetsContext.Provider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('BudgetDetail', () => {
  it('shows entries with the adder name and amount', () => {
    renderDetail()
    expect(screen.getByText('groceries')).toBeInTheDocument()
    expect(screen.getByText(/Mum/)).toBeInTheDocument()
    expect(screen.getByText('S$30.00')).toBeInTheDocument()
  })

  it('shows month progress against the limit', () => {
    renderDetail()
    expect(screen.getByText('S$30.00 of S$100.00')).toBeInTheDocument()
  })

  it('shows per-member totals for the month', () => {
    renderDetail()
    const totals = screen.getByTestId('member-totals')
    expect(totals).toHaveTextContent('Mum')
    expect(totals).toHaveTextContent('S$30.00')
    expect(totals).toHaveTextContent('Nat')
    expect(totals).toHaveTextContent('S$0.00')
  })

  it('adds an entry with the selected category', async () => {
    renderDetail()
    fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByRole('button', { name: /Food/ }))
    fireEvent.change(screen.getByPlaceholderText('Note (optional)'), { target: { value: 'kopi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(ctx.addEntry).toHaveBeenCalledWith({
        amount: 12.5,
        categoryId: 'c1',
        note: 'kopi',
        date: today,
      }),
    )
  })

  it('goes back via closeBudget', () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(ctx.closeBudget).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/BudgetDetail.test.tsx`
Expected: FAIL — cannot resolve `./BudgetDetail`.

- [ ] **Step 3: Write the implementation**

Create `src/sharedBudgets/OwnerTools.tsx` as a placeholder Task 10 will replace:

```tsx
// Replaced with the real owner tools in the next task.
export default function OwnerTools() {
  return null
}
```

Create `src/sharedBudgets/BudgetDetail.tsx`:

```tsx
import { useState } from 'react'
import { ChevronLeft, Trash2 } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import { toLocalDateString } from '../dates'
import { computeMemberTotals, currentSgtMonth, entriesForMonth, totalSpent } from './memberTotals'
import OwnerTools from './OwnerTools'
import { useSharedBudgets } from './SharedBudgetsContext'

export default function BudgetDetail() {
  const { active, session, error, closeBudget, addEntry, removeEntry } = useSharedBudgets()
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (!active) return null
  const { budget, entries, categories, members } = active

  const month = currentSgtMonth()
  const monthEntries = entriesForMonth(entries, month)
  const spent = totalSpent(monthEntries)
  const memberTotals = computeMemberTotals(monthEntries, members)
  const nameOf = new Map(members.map(m => [m.userId, m.displayName]))
  const isOwner = session?.user.id === budget.ownerId
  const parsedAmount = parseFloat(amount) || 0

  async function handleAdd() {
    setBusy(true)
    try {
      await addEntry({
        amount: parsedAmount,
        categoryId,
        note,
        date: toLocalDateString(),
      })
      setAmount('')
      setCategoryId(null)
      setNote('')
    } catch {
      // context.error carries the message
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen shared-detail">
      <div className="shared-detail-header">
        <button type="button" className="link-btn" aria-label="Back" onClick={closeBudget}>
          <ChevronLeft className="ui-icon" aria-hidden="true" />
        </button>
        <p className="screen-title">{budget.name.toUpperCase()}</p>
      </div>

      <div className="shared-progress">
        {budget.monthlyLimit !== null ? (
          <>
            <p>
              {`S$${spent.toFixed(2)} of S$${budget.monthlyLimit.toFixed(2)}`}
            </p>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, (spent / budget.monthlyLimit) * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p>{`S$${spent.toFixed(2)} spent this month`}</p>
        )}
      </div>

      <div className="shared-form">
        <input
          type="number"
          className="note-input"
          placeholder="Amount"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        {categories.length > 0 && (
          <div className="chips">
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                className={`chip ${categoryId === c.id ? 'chip--selected' : ''}`}
                onClick={() => setCategoryId(prev => (prev === c.id ? null : c.id))}
              >
                <BudgetIcon name={c.icon} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          className="note-input"
          placeholder="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <button
          type="button"
          className="save-btn"
          disabled={busy || parsedAmount <= 0}
          onClick={() => void handleAdd()}
        >
          Add
        </button>
      </div>

      <div className="shared-member-totals" data-testid="member-totals">
        <p className="category-label">This month by member</p>
        {memberTotals.map(t => (
          <div key={t.userId} className="member-total-row">
            <span>{t.displayName}</span>
            <span>{`S$${t.total.toFixed(2)}`}</span>
          </div>
        ))}
      </div>

      <div className="shared-entries">
        <p className="category-label">Entries</p>
        {entries.length === 0 && <p className="muted">No entries yet.</p>}
        {entries.map(e => (
          <div key={e.id} className="shared-entry-row">
            <div className="shared-entry-main">
              <span>{e.note || 'No note'}</span>
              <span className="muted">
                {nameOf.get(e.userId) ?? 'Former member'} · {e.date}
              </span>
            </div>
            <span>{`S$${e.amount.toFixed(2)}`}</span>
            <button
              type="button"
              className="link-btn"
              aria-label={`Delete entry ${e.note || e.id}`}
              onClick={() => void removeEntry(e.id)}
            >
              <Trash2 className="ui-icon" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {isOwner && <OwnerTools />}

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/BudgetDetail.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/BudgetDetail.tsx src/sharedBudgets/BudgetDetail.test.tsx src/sharedBudgets/OwnerTools.tsx
git commit -m "feat: shared budget detail screen with entries + member totals"
```

---

### Task 10: `OwnerTools` — invite sharing, budget settings, members, categories

**Files:**
- Modify: `src/sharedBudgets/OwnerTools.tsx` (replace the Task 9 placeholder entirely)
- Create: `src/sharedBudgets/OwnerTools.test.tsx`

**Interfaces:**
- Consumes: `useSharedBudgets` — `active`, `session`, `regenerateCode`, `removeMember`, `updateActiveBudget`, `deleteActiveBudget`, `addCategory`.
- Produces: default export `OwnerTools()` — no props (already rendered by Task 9's `BudgetDetail` when `isOwner`).

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/OwnerTools.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OwnerTools from './OwnerTools'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'
import type { ActiveBudgetData } from './types'
import type { Session } from '@supabase/supabase-js'

const active: ActiveBudgetData = {
  budget: {
    id: 'b1',
    name: 'Family',
    monthlyLimit: 100,
    currency: 'SGD',
    inviteCode: 'ABC234',
    ownerId: 'u1',
    createdAt: '2026-07-01T00:00:00Z',
  },
  entries: [],
  categories: [],
  members: [
    { userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' },
    { userId: 'u2', role: 'member', displayName: 'Mum', joinedAt: '2026-07-01T00:00:00Z' },
  ],
}

const ctx = {
  active,
  session: { user: { id: 'u1' } } as Session,
  regenerateCode: vi.fn().mockResolvedValue(undefined),
  removeMember: vi.fn().mockResolvedValue(undefined),
  updateActiveBudget: vi.fn().mockResolvedValue(undefined),
  deleteActiveBudget: vi.fn().mockResolvedValue(undefined),
  addCategory: vi.fn().mockResolvedValue(undefined),
} as unknown as SharedBudgetsContextValue

function renderTools() {
  return render(
    <SharedBudgetsContext.Provider value={ctx}>
      <OwnerTools />
    </SharedBudgetsContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('OwnerTools', () => {
  it('shows the invite code', () => {
    renderTools()
    expect(screen.getByText('ABC234')).toBeInTheDocument()
  })

  it('regenerates the invite code', async () => {
    renderTools()
    fireEvent.click(screen.getByRole('button', { name: 'New code' }))
    await waitFor(() => expect(ctx.regenerateCode).toHaveBeenCalled())
  })

  it('removes a member (never the owner)', async () => {
    renderTools()
    expect(screen.queryByRole('button', { name: 'Remove Nat' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mum' }))
    await waitFor(() => expect(ctx.removeMember).toHaveBeenCalledWith('u2'))
  })

  it('adds a category', async () => {
    renderTools()
    fireEvent.change(screen.getByPlaceholderText('New category'), { target: { value: 'Food' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    await waitFor(() =>
      expect(ctx.addCategory).toHaveBeenCalledWith({
        label: 'Food',
        budgetAmount: null,
        icon: 'others',
      }),
    )
  })

  it('deletes the budget only after confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderTools()
    fireEvent.click(screen.getByRole('button', { name: 'Delete budget' }))
    expect(ctx.deleteActiveBudget).not.toHaveBeenCalled()
    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete budget' }))
    await waitFor(() => expect(ctx.deleteActiveBudget).toHaveBeenCalled())
  })

  it('saves name and limit changes', async () => {
    renderTools()
    fireEvent.change(screen.getByDisplayValue('Family'), { target: { value: 'Fam 2.0' } })
    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(ctx.updateActiveBudget).toHaveBeenCalledWith({ name: 'Fam 2.0', monthlyLimit: 250 }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/OwnerTools.test.tsx`
Expected: FAIL — placeholder renders nothing, all queries fail.

- [ ] **Step 3: Replace the placeholder implementation**

Replace the full contents of `src/sharedBudgets/OwnerTools.tsx` with:

```tsx
import { useState } from 'react'
import { useSharedBudgets } from './SharedBudgetsContext'

// Owner-only management: invite code, members, categories, settings, delete.
// Rendered by BudgetDetail only when the signed-in user owns the budget.
export default function OwnerTools() {
  const {
    active,
    regenerateCode,
    removeMember,
    updateActiveBudget,
    deleteActiveBudget,
    addCategory,
  } = useSharedBudgets()
  const [name, setName] = useState(active?.budget.name ?? '')
  const [limit, setLimit] = useState(
    active && active.budget.monthlyLimit !== null ? String(active.budget.monthlyLimit) : '',
  )
  const [newCategory, setNewCategory] = useState('')
  const [busy, setBusy] = useState(false)

  if (!active) return null
  const { budget, members } = active

  async function guard(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch {
      // context.error carries the message
    } finally {
      setBusy(false)
    }
  }

  function share() {
    const message = `Join my "${budget.name}" budget on ${window.location.origin} with code ${budget.inviteCode}`
    if (navigator.share) {
      void navigator.share({ text: message }).catch(() => {})
    } else {
      void navigator.clipboard.writeText(message)
    }
  }

  return (
    <div className="owner-tools">
      <p className="category-label">Invite</p>
      <div className="invite-row">
        <span className="invite-code">{budget.inviteCode}</span>
        <button type="button" className="save-btn" onClick={share}>
          Share
        </button>
        <button
          type="button"
          className="save-btn"
          disabled={busy}
          onClick={() => void guard(() => regenerateCode())}
        >
          New code
        </button>
      </div>

      <p className="category-label">Members</p>
      {members.map(m => (
        <div key={m.userId} className="member-row">
          <span>
            {m.displayName} {m.role === 'owner' && <span className="muted">(owner)</span>}
          </span>
          {m.role !== 'owner' && (
            <button
              type="button"
              className="link-btn"
              disabled={busy}
              onClick={() => void guard(() => removeMember(m.userId))}
            >
              Remove {m.displayName}
            </button>
          )}
        </div>
      ))}

      <p className="category-label">Categories</p>
      <div className="shared-form">
        <input
          type="text"
          className="note-input"
          placeholder="New category"
          value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
        />
        <button
          type="button"
          className="save-btn"
          disabled={busy || newCategory.trim().length === 0}
          onClick={() =>
            void guard(async () => {
              await addCategory({ label: newCategory.trim(), budgetAmount: null, icon: 'others' })
              setNewCategory('')
            })
          }
        >
          Add category
        </button>
      </div>

      <p className="category-label">Settings</p>
      <div className="shared-form">
        <input
          type="text"
          className="note-input"
          aria-label="Budget name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          type="number"
          className="note-input"
          aria-label="Monthly limit"
          inputMode="decimal"
          placeholder="Monthly limit (optional)"
          value={limit}
          onChange={e => setLimit(e.target.value)}
        />
        <button
          type="button"
          className="save-btn"
          disabled={busy || name.trim().length === 0}
          onClick={() =>
            void guard(() =>
              updateActiveBudget({
                name: name.trim(),
                monthlyLimit: limit.trim() === '' ? null : parseFloat(limit),
              }),
            )
          }
        >
          Save settings
        </button>
      </div>

      <button
        type="button"
        className="danger-btn"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Delete "${budget.name}" for everyone? This cannot be undone.`)) {
            void guard(() => deleteActiveBudget())
          }
        }}
      >
        Delete budget
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass (including Task 9's, which now renders the real OwnerTools)**

Run: `npx vitest run src/sharedBudgets/OwnerTools.test.tsx src/sharedBudgets/BudgetDetail.test.tsx`
Expected: PASS (6 + 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sharedBudgets/OwnerTools.tsx src/sharedBudgets/OwnerTools.test.tsx
git commit -m "feat: owner tools - invite sharing, members, categories, settings"
```

---

### Task 11: Wire-up — `SharedScreen`, tab, provider, CSS, docs, final verification

**Files:**
- Create: `src/sharedBudgets/SharedScreen.tsx`
- Create: `src/sharedBudgets/SharedScreen.test.tsx`
- Modify: `src/components/TabBar.tsx` (add `'shared'` to the `Tab` union + a fifth button)
- Modify: `src/App.tsx` (render `SharedScreen`, wrap with `SharedBudgetsProvider`)
- Modify: `src/index.css` (append shared-budget styles)
- Create: `.env.example`
- Modify: `README.md` (Supabase setup section)

**Interfaces:**
- Consumes: `useSharedBudgets` (all state), `AuthGate` + `DisplayNamePrompt` (Task 7), `BudgetList` (Task 8), `BudgetDetail` (Task 9).
- Produces: default export `SharedScreen()`; `Tab` union becomes `'home' | 'add' | 'history' | 'poker' | 'shared'`.

- [ ] **Step 1: Write the failing test**

Create `src/sharedBudgets/SharedScreen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SharedScreen from './SharedScreen'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'
import type { Session } from '@supabase/supabase-js'

function renderWith(partial: Partial<SharedBudgetsContextValue>) {
  const value = {
    configured: true,
    authReady: true,
    session: null,
    profile: null,
    budgets: [],
    active: null,
    error: null,
  } as unknown as SharedBudgetsContextValue
  return render(
    <SharedBudgetsContext.Provider value={{ ...value, ...partial }}>
      <SharedScreen />
    </SharedBudgetsContext.Provider>,
  )
}

describe('SharedScreen', () => {
  it('explains setup when Supabase is not configured', () => {
    renderWith({ configured: false })
    expect(screen.getByText(/not configured/i)).toBeInTheDocument()
  })

  it('shows nothing while auth is loading', () => {
    const { container } = renderWith({ authReady: false })
    expect(container.querySelector('.shared-auth')).toBeNull()
  })

  it('shows the auth gate when signed out', () => {
    renderWith({ session: null })
    expect(screen.getByPlaceholderText('you@email.com')).toBeInTheDocument()
  })

  it('prompts for a display name right after first sign-in', () => {
    renderWith({
      session: { user: { id: 'u1' } } as Session,
      profile: { id: 'u1', displayName: '' },
    })
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument()
  })

  it('shows the budget list when signed in with a named profile', () => {
    renderWith({
      session: { user: { id: 'u1' } } as Session,
      profile: { id: 'u1', displayName: 'Nat' },
    })
    expect(screen.getByText('SHARED BUDGETS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New budget' })).toBeInTheDocument()
  })

  it('shows an offline banner when the browser is offline', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderWith({
      session: { user: { id: 'u1' } } as Session,
      profile: { id: 'u1', displayName: 'Nat' },
    })
    expect(screen.getByText('Shared budgets need a connection')).toBeInTheDocument()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sharedBudgets/SharedScreen.test.tsx`
Expected: FAIL — cannot resolve `./SharedScreen`.

- [ ] **Step 3: Write `SharedScreen`**

Create `src/sharedBudgets/SharedScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import AuthGate, { DisplayNamePrompt } from './AuthGate'
import BudgetDetail from './BudgetDetail'
import BudgetList from './BudgetList'
import { useSharedBudgets } from './SharedBudgetsContext'

// Shared budgets are online-only (no offline queue); surface that plainly.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sharedBudgets/SharedScreen.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the tab**

In `src/components/TabBar.tsx`:

1. Change the import line to add `Users`:
```tsx
import { ChartColumn, CirclePlus, House, Spade, Users } from 'lucide-react'
```
2. Change the `Tab` type:
```tsx
export type Tab = 'home' | 'add' | 'history' | 'poker' | 'shared'
```
3. After the Poker `</button>` and before `</nav>`, add:
```tsx
      <button
        type="button"
        aria-label="Shared budgets"
        aria-pressed={active === 'shared'}
        className={active === 'shared' ? 'active' : ''}
        onClick={() => onChange('shared')}
      >
        <Users className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Shared</span>
      </button>
```

In `src/App.tsx`:

1. Add imports after the `Poker` import:
```tsx
import SharedScreen from './sharedBudgets/SharedScreen'
import { SharedBudgetsProvider } from './sharedBudgets/SharedBudgetsContext'
```
2. Inside `AppShell`'s return, after the `{tab === 'poker' && <Poker />}` line, add:
```tsx
      {tab === 'shared' && <SharedScreen />}
```
3. Change the `App` component to nest the new provider:
```tsx
export default function App() {
  return (
    <EntriesProvider>
      <SharedBudgetsProvider>
        <AppShell />
      </SharedBudgetsProvider>
    </EntriesProvider>
  )
}
```

- [ ] **Step 6: Append styles**

Append to the end of `src/index.css`:

```css
/* ---------- shared budgets ---------- */
.shared-auth,
.shared-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.shared-budget-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0;
}

.shared-budget-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.shared-budget-name {
  flex: 1;
  font-weight: 600;
}

.shared-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.shared-actions .save-btn {
  flex: 1;
}

.shared-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shared-progress {
  margin: 10px 0;
}

.progress-track {
  height: 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.2);
  overflow: hidden;
  margin-top: 6px;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  background: currentColor;
}

.member-total-row,
.member-row,
.shared-entry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}

.shared-entry-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.invite-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.invite-code {
  font-family: ui-monospace, monospace;
  font-size: 1.2rem;
  letter-spacing: 2px;
  flex: 1;
}

.owner-tools {
  margin-top: 20px;
}

.link-btn {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  padding: 4px 0;
}

.shared-signout {
  margin-top: 24px;
  opacity: 0.7;
}

.form-error {
  color: #e5484d;
  margin-top: 8px;
}

.danger-btn {
  margin-top: 16px;
  padding: 12px;
  width: 100%;
  border: 1px solid #e5484d;
  border-radius: 12px;
  background: transparent;
  color: #e5484d;
  font: inherit;
}

.offline-banner {
  text-align: center;
  padding: 8px 12px;
  background: rgba(229, 72, 77, 0.12);
  color: #e5484d;
  border-radius: 10px;
  margin: 8px 16px 0;
}
```

(If `.link-btn` or `.form-error` already exist in `index.css`, skip re-adding those two blocks.)

- [ ] **Step 7: Env example + README**

Create `.env.example`:

```bash
# Shared budgets (Supabase). Client-safe values; security is enforced by RLS.
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Append to `README.md`:

```markdown
## Shared budgets (Supabase)

Shared budgets let friends/family spend from a common pot with live updates.
Personal budget data stays on Netlify Blobs; Supabase only stores shared budgets.

One-time setup:

1. Create a free project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/001_shared_budgets.sql`.
3. In Auth → Email Templates → Magic Link, make sure the body contains
   `{{ .Token }}` so sign-in emails include the 6-digit code the app asks for.
4. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key
   (Settings → API). Add the same two vars in Netlify → Site → Environment
   variables, then redeploy.

Sign in on the Shared tab with your email + the emailed code. Create a budget,
then share its invite code; anyone who signs in and enters the code joins.
```

- [ ] **Step 8: Full verification**

```bash
npm test
npm run lint
npm run build
```
Expected: all tests pass (existing suites untouched), lint clean, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/sharedBudgets/SharedScreen.tsx src/sharedBudgets/SharedScreen.test.tsx src/components/TabBar.tsx src/App.tsx src/index.css .env.example README.md
git commit -m "feat: Shared tab wiring - screen router, nav, styles, setup docs"
```

---

## Post-implementation (manual, with the user)

Not part of the automated tasks — requires the user's Supabase account:

1. User creates the Supabase project, runs the migration, fixes the email template, sets env vars locally and in Netlify.
2. Run the RLS smoke-test checklist from the migration header with two emails.
3. `npx netlify dev` end-to-end check on the Shared tab, then deploy via `netlify deploy --build --prod`.
