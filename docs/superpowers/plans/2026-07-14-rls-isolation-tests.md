# Live RLS Isolation Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, against a real Postgres with the real migrations applied, that one user cannot read or write another user's rows — and keep proving it on every pull request.

**Architecture:** A local `supabase start` stack (Docker) gives real Postgres + real GoTrue auth + real RLS, with the schema built by applying every migration in order. Tests drive it through `supabase-js` as two genuine signed-in users, plus an unauthenticated `anon` client. A third **service-role client bypasses RLS and acts as the ground-truth oracle**. A separate Vitest project keeps the existing `npm test` Docker-free.

**Tech Stack:** Supabase CLI, Docker, Vitest 4, `@supabase/supabase-js` ^2.110, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-14-rls-isolation-tests-design.md`

## Global Constraints

- All paths are relative to `budget-tracker/` (the git repo root).
- **Unauthorized writes fail silently.** A cross-user `update`/`delete` affects 0 rows and raises **no error**; a cross-user `select` returns an empty set. Only an `insert` violating `with check`, and any operation on a table with no grant, raise (`42501`). Therefore **every negative assertion must also read the row back through the service-role oracle and confirm it is unchanged.** An assertion that only checks `error === null` passes against completely broken policies.
- **Every table gets a positive control** (the owner *can* do the thing). Without one, a policy of `using (false)` passes every negative test while bricking the app.
- The oracle (`serviceClient()`) is used **only** for fixture setup and post-hoc verification. Never use it to exercise a policy — it bypasses RLS.
- The harness **fails loudly** when the stack is down. It must never `skip`. A silently-skipped security test is worse than no test.
- New tests are excluded from the coverage gate. They exercise SQL, not TypeScript; folding them in would perturb the enforced thresholds in `vite.config.ts`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/config.toml` | **Create** (via `supabase init`) — local stack config; does not exist yet |
| `vitest.rls.config.ts` | **Create** — separate Vitest project, node env, serial |
| `supabase/tests/rls/harness.ts` | **Create** — client factories, user fixtures, teardown |
| `supabase/tests/rls/schema.rls.test.ts` | **Create** — proves the stack came up with the real schema |
| `supabase/tests/rls/entries.rls.test.ts` | **Create** — `entries` |
| `supabase/tests/rls/pokerSessions.rls.test.ts` | **Create** — `poker_sessions` |
| `supabase/tests/rls/ingest.rls.test.ts` | **Create** — `ingest_tokens`, `ingest_status` |
| `supabase/tests/rls/sharedBudgets.rls.test.ts` | **Create** — 5 shared tables + 2 RPCs |
| `vite.config.ts` | **Modify** — exclude `supabase/tests/rls/**` from the default run |
| `package.json` | **Modify** — add `test:rls` |
| `.github/workflows/ci.yml` | **Modify** — add parallel `rls` job |
| `supabase/tests/ingest_visibility.test.ts` | **Delete** — superseded string matcher |

---

## Task 1: Bootstrap the local stack and prove the migrations apply

The repo has migrations but **no `supabase/config.toml`** — `supabase init` was never run, so `supabase start` does not work today. Worse, `001_shared_budgets.sql` does not follow the CLI's `<timestamp>_name.sql` convention. If the CLI skips or rejects it, every later task fails in confusing ways. So prove the schema first, in isolation.

**Files:**
- Create: `supabase/config.toml` (generated)
- Create: `vitest.rls.config.ts`
- Create: `supabase/tests/rls/harness.ts`
- Create: `supabase/tests/rls/schema.rls.test.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `stackCreds(): StackCreds`, `serviceClient(): SupabaseClient`, `anonClient(): SupabaseClient`, `signedInUser(): Promise<TestUser>`, `deleteUser(u: TestUser): Promise<void>`, `interface TestUser { id: string; email: string; client: SupabaseClient }`. Every later task imports these from `./harness`.

- [ ] **Step 1: Initialize the Supabase config**

```bash
npx supabase init
```

Expected: creates `supabase/config.toml`. If it prompts about overwriting anything, decline — the `functions/` and `migrations/` directories already exist and must not be touched.

- [ ] **Step 2: Start the stack and confirm the migrations applied**

```bash
npx supabase start
```

Expected: prints `API URL`, `anon key`, `service_role key`. This applies every file in `supabase/migrations/` in lexicographic order (`001_…` sorts before `20260705…`, which is the order we want).

**If it errors on `001_shared_budgets.sql`, stop and report before continuing** — the fix is to rename it to a conforming timestamp that still sorts first (e.g. `20260705000000_shared_budgets.sql`), which is a schema-history change and needs a decision, not a guess.

- [ ] **Step 3: Write the schema smoke test**

Create `supabase/tests/rls/harness.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface StackCreds {
  url: string
  anonKey: string
  serviceRoleKey: string
}

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

let cached: StackCreds | null = null

/**
 * These are security tests. If the stack is down we throw — never skip.
 * A skipped isolation test reports green while proving nothing.
 */
export function stackCreds(): StackCreds {
  if (cached) return cached

  let raw: string
  try {
    raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error(
      'Local Supabase stack is not running. Run `npx supabase start` first. ' +
        'These are RLS security tests and must never be skipped.',
    )
  }

  const status = JSON.parse(raw) as Record<string, string>
  const creds: StackCreds = {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  }

  if (!creds.url || !creds.anonKey || !creds.serviceRoleKey) {
    throw new Error('`supabase status` did not report API_URL, ANON_KEY and SERVICE_ROLE_KEY')
  }

  cached = creds
  return creds
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } }

/** Bypasses RLS. Fixtures and ground-truth verification ONLY — never to exercise a policy. */
export function serviceClient(): SupabaseClient {
  const { url, serviceRoleKey } = stackCreds()
  return createClient(url, serviceRoleKey, noPersist)
}

/** Unauthenticated. */
export function anonClient(): SupabaseClient {
  const { url, anonKey } = stackCreds()
  return createClient(url, anonKey, noPersist)
}

/** A real confirmed user, returned with an anon-key client signed in as them — the app's own path. */
export async function signedInUser(): Promise<TestUser> {
  const { url, anonKey } = stackCreds()
  const email = `rls-${randomUUID()}@example.test`
  const password = randomUUID()

  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error

  const client = createClient(url, anonKey, noPersist)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError

  return { id: data.user!.id, email, client }
}

/** Deleting the auth user cascades their rows away. */
export async function deleteUser(user: TestUser): Promise<void> {
  const { error } = await serviceClient().auth.admin.deleteUser(user.id)
  if (error) throw error
}
```

Create `supabase/tests/rls/schema.rls.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { serviceClient, signedInUser, deleteUser } from './harness'

const TABLES = [
  'entries',
  'poker_sessions',
  'ingest_tokens',
  'ingest_status',
  'profiles',
  'budgets',
  'budget_members',
  'shared_categories',
  'shared_entries',
] as const

describe('local stack schema', () => {
  it.each(TABLES)('applied the migration that creates %s', async (table) => {
    // The oracle bypasses RLS, so reaching the table at all proves it exists.
    const { error } = await serviceClient().from(table).select('*').limit(0)
    expect(error).toBeNull()
  })

  it('creates a profile row for a new user via the handle_new_user trigger', async () => {
    const user = await signedInUser()
    try {
      const { data, error } = await serviceClient()
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      expect(error).toBeNull()
      expect(data!.id).toBe(user.id)
    } finally {
      await deleteUser(user)
    }
  })
})
```

- [ ] **Step 4: Add the Vitest project and the npm script**

Create `vitest.rls.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['supabase/tests/rls/**/*.rls.test.ts'],
    // One shared database is shared mutable state. Serial execution keeps
    // fixtures from racing each other.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    // Creating users and starting sessions is slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
```

Add to `scripts` in `package.json`:

```json
"test:rls": "vitest run --config vitest.rls.config.ts",
```

- [ ] **Step 5: Keep the RLS tests out of the default run**

`vite.config.ts` sets no `include`, so Vitest's default glob would sweep up the new files and `npm test` would fail on any machine without Docker. Add one line to the existing `test.exclude` array (currently at `vite.config.ts:57-63`):

```ts
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/.worktrees/**',
        '**/.claude/worktrees/**',
        // Live RLS tests need a running Postgres. They run via `npm run test:rls`.
        'supabase/tests/rls/**',
      ],
```

- [ ] **Step 6: Run both suites**

```bash
npm run test:rls
```
Expected: PASS — 10 tests (9 tables + the profile trigger).

```bash
npm test
```
Expected: PASS, and the RLS tests do **not** appear in the run.

- [ ] **Step 7: Prove the harness fails loudly when the stack is down**

```bash
npx supabase stop
npm run test:rls
```
Expected: FAIL with "Local Supabase stack is not running." — **not** a skip, and not a pass.

```bash
npx supabase start
```

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml vitest.rls.config.ts supabase/tests/rls/ vite.config.ts package.json
git commit -m "test: add live Supabase RLS harness and schema smoke test"
```

---

## Task 2: `entries` isolation

**Files:**
- Create: `supabase/tests/rls/entries.rls.test.ts`

**Interfaces:**
- Consumes: `signedInUser`, `deleteUser`, `serviceClient`, `anonClient`, `TestUser` from `./harness`.
- Produces: nothing consumed downstream.

Policies under test (`supabase/migrations/20260711120000_personal_entries.sql:69-77`): `user_id = auth.uid()` for all four verbs. Grants go to `authenticated` only, so `anon` gets `42501` rather than an empty set.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/rls/entries.rls.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, deleteUser, serviceClient, signedInUser, type TestUser } from './harness'

let alice: TestUser
let bob: TestUser
const oracle = serviceClient()

beforeAll(async () => {
  alice = await signedInUser()
  bob = await signedInUser()
})

afterAll(async () => {
  await deleteUser(alice)
  await deleteUser(bob)
})

/** Inserts a row owned by Alice and returns its id. */
async function aliceEntry(amount = 12.5): Promise<string> {
  const id = randomUUID()
  const { error } = await alice.client.from('entries').insert({
    id,
    user_id: alice.id,
    amount,
    category: 'lunch',
    note: 'alice lunch',
    date: '2026-07-14',
    dedupe_key: `alice-${id}`,
  })
  expect(error).toBeNull()
  return id
}

describe('entries RLS', () => {
  // Positive control. Without this, `using (false)` would pass every test below.
  it('lets a user read, update and delete their own entry', async () => {
    const id = await aliceEntry()

    const { data: read } = await alice.client.from('entries').select('id').eq('id', id)
    expect(read).toHaveLength(1)

    const { data: updated } = await alice.client
      .from('entries')
      .update({ amount: 20 })
      .eq('id', id)
      .select()
    expect(updated).toHaveLength(1)

    const { data: deleted } = await alice.client.from('entries').delete().eq('id', id).select()
    expect(deleted).toHaveLength(1)
  })

  it("does not show Alice's entries to Bob", async () => {
    const id = await aliceEntry()

    const { data, error } = await bob.client.from('entries').select('id').eq('id', id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("does not include Alice's entries in Bob's unfiltered list", async () => {
    const id = await aliceEntry()

    const { data } = await bob.client.from('entries').select('id')

    expect((data ?? []).map((r) => r.id)).not.toContain(id)
  })

  // The silent no-op. This is the case a naive "expect(error).toBeNull()" test would miss.
  it("silently no-ops Bob's update of Alice's entry and leaves the row intact", async () => {
    const id = await aliceEntry(12.5)

    const { data, error } = await bob.client
      .from('entries')
      .update({ amount: 9999 })
      .eq('id', id)
      .select()

    expect(error).toBeNull() // Postgres does NOT raise here
    expect(data).toEqual([]) // zero rows affected

    // ORACLE: the row is untouched. Without this the test proves nothing.
    const { data: row } = await oracle.from('entries').select('amount').eq('id', id).single()
    expect(Number(row!.amount)).toBe(12.5)
  })

  it("silently no-ops Bob's delete of Alice's entry and leaves the row present", async () => {
    const id = await aliceEntry()

    const { data, error } = await bob.client.from('entries').delete().eq('id', id).select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    // ORACLE: still there.
    const { count } = await oracle
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(1)
  })

  it('rejects an insert that claims another user as owner', async () => {
    const id = randomUUID()

    const { error } = await bob.client.from('entries').insert({
      id,
      user_id: alice.id, // forging ownership
      amount: 1,
      note: 'forged',
      date: '2026-07-14',
      dedupe_key: `forged-${id}`,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    // ORACLE: nothing was written.
    const { count } = await oracle
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(0)
  })

  it('denies anonymous access entirely', async () => {
    await aliceEntry()

    const { error } = await anonClient().from('entries').select('id')

    // entries is granted to `authenticated` only, so anon is denied at the grant.
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})
```

- [ ] **Step 2: Run and watch them pass**

```bash
npm run test:rls -- entries
```
Expected: PASS, 7 tests.

These are characterization tests over policies that already exist, so green is the expected first result. **If any fail, that is a real isolation bug — stop and report it rather than adjusting the test to match the behavior.**

- [ ] **Step 3: Prove the tests can actually fail (mutation check)**

A passing test against existing code proves nothing until you've seen it fail. Temporarily break the policy:

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "alter policy entries_select_own on public.entries using (true);"
npm run test:rls -- entries
```
Expected: FAIL — "does not show Alice's entries to Bob" and the unfiltered-list test both go red.

Restore:
```bash
npx supabase db reset
npm run test:rls -- entries
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls/entries.rls.test.ts
git commit -m "test: prove entries RLS isolates users against a live Postgres"
```

---

## Task 3: `poker_sessions` isolation

**Files:**
- Create: `supabase/tests/rls/pokerSessions.rls.test.ts`

**Interfaces:**
- Consumes: `signedInUser`, `deleteUser`, `serviceClient`, `anonClient`, `TestUser` from `./harness`.

Same four policies as `entries` (`…_personal_entries.sql:79-87`), different columns. `result` is constrained to `'win' | 'loss'`; there is no `dedupe_key`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/rls/pokerSessions.rls.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, deleteUser, serviceClient, signedInUser, type TestUser } from './harness'

let alice: TestUser
let bob: TestUser
const oracle = serviceClient()

beforeAll(async () => {
  alice = await signedInUser()
  bob = await signedInUser()
})

afterAll(async () => {
  await deleteUser(alice)
  await deleteUser(bob)
})

async function aliceSession(amount = 150): Promise<string> {
  const id = randomUUID()
  const { error } = await alice.client.from('poker_sessions').insert({
    id,
    user_id: alice.id,
    date: '2026-07-14',
    start_time: '20:00',
    end_time: '23:30',
    stakes: '1/2',
    buy_in: 200,
    result: 'win',
    amount,
  })
  expect(error).toBeNull()
  return id
}

describe('poker_sessions RLS', () => {
  it('lets a user read, update and delete their own session', async () => {
    const id = await aliceSession()

    const { data: read } = await alice.client.from('poker_sessions').select('id').eq('id', id)
    expect(read).toHaveLength(1)

    const { data: updated } = await alice.client
      .from('poker_sessions')
      .update({ amount: 300 })
      .eq('id', id)
      .select()
    expect(updated).toHaveLength(1)

    const { data: deleted } = await alice.client
      .from('poker_sessions')
      .delete()
      .eq('id', id)
      .select()
    expect(deleted).toHaveLength(1)
  })

  it("does not show Alice's sessions to Bob", async () => {
    const id = await aliceSession()

    const { data, error } = await bob.client.from('poker_sessions').select('id').eq('id', id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("silently no-ops Bob's update and leaves the row intact", async () => {
    const id = await aliceSession(150)

    const { data, error } = await bob.client
      .from('poker_sessions')
      .update({ amount: 9999 })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: row } = await oracle
      .from('poker_sessions')
      .select('amount')
      .eq('id', id)
      .single()
    expect(Number(row!.amount)).toBe(150)
  })

  it("silently no-ops Bob's delete and leaves the row present", async () => {
    const id = await aliceSession()

    const { data, error } = await bob.client.from('poker_sessions').delete().eq('id', id).select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { count } = await oracle
      .from('poker_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(1)
  })

  it('rejects an insert that claims another user as owner', async () => {
    const id = randomUUID()

    const { error } = await bob.client.from('poker_sessions').insert({
      id,
      user_id: alice.id,
      date: '2026-07-14',
      start_time: '20:00',
      end_time: '23:30',
      stakes: '1/2',
      buy_in: 200,
      result: 'loss',
      amount: 50,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('poker_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(0)
  })

  it('denies anonymous access entirely', async () => {
    const { error } = await anonClient().from('poker_sessions').select('id')

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})
```

- [ ] **Step 2: Run**

```bash
npm run test:rls -- pokerSessions
```
Expected: PASS, 6 tests. A failure here is a real bug — report, don't adjust.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls/pokerSessions.rls.test.ts
git commit -m "test: prove poker_sessions RLS isolates users against a live Postgres"
```

---

## Task 4: `ingest_tokens` and `ingest_status`, and retire the string matcher

**Files:**
- Create: `supabase/tests/rls/ingest.rls.test.ts`
- Delete: `supabase/tests/ingest_visibility.test.ts`

**Interfaces:**
- Consumes: `signedInUser`, `deleteUser`, `serviceClient`, `anonClient`, `TestUser` from `./harness`.

`ingest_tokens` is protected by the **absence** of both grants and policies — service-role only (`…_personal_entries.sql:89-94`). `ingest_status` grants `select` to `authenticated` with an owner-only policy, and revokes every write (`20260713112626…`, `20260713112827…`). Absence is exactly what a later migration undoes without noticing.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/rls/ingest.rls.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, deleteUser, serviceClient, signedInUser, type TestUser } from './harness'

let alice: TestUser
let bob: TestUser
const oracle = serviceClient()

beforeAll(async () => {
  alice = await signedInUser()
  bob = await signedInUser()
})

afterAll(async () => {
  await deleteUser(alice)
  await deleteUser(bob)
})

describe('ingest_tokens RLS — service role only', () => {
  // Not redundant with the denials below: this proves the table is reachable,
  // so those denials are real and not a false pass from a mistyped table name.
  it('is readable by the service role', async () => {
    const { error } = await oracle.from('ingest_tokens').select('token_hash').limit(1)
    expect(error).toBeNull()
  })

  it('denies a signed-in user', async () => {
    const { error } = await alice.client.from('ingest_tokens').select('token_hash')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('denies an anonymous caller', async () => {
    const { error } = await anonClient().from('ingest_tokens').select('token_hash')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('never lets a signed-in user mint a token for themselves', async () => {
    const { error } = await alice.client
      .from('ingest_tokens')
      .insert({ token_hash: 'deadbeef', user_id: alice.id, label: 'forged' })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('ingest_tokens')
      .select('token_hash', { count: 'exact', head: true })
      .eq('token_hash', 'deadbeef')
    expect(count).toBe(0)
  })
})

describe('ingest_status RLS — owner-readable, never client-writable', () => {
  /** The trigger creates a status row when a token is minted, so mint one for Alice. */
  async function aliceStatus(): Promise<void> {
    const { error } = await oracle
      .from('ingest_tokens')
      .insert({ token_hash: `hash-${alice.id}`, user_id: alice.id, label: 'test' })
    expect(error).toBeNull()
  }

  beforeAll(aliceStatus)

  // Positive control.
  it('lets Alice read her own status row', async () => {
    const { data, error } = await alice.client.from('ingest_status').select('user_id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].user_id).toBe(alice.id)
  })

  it("does not show Alice's status to Bob", async () => {
    const { data, error } = await bob.client
      .from('ingest_status')
      .select('user_id')
      .eq('user_id', alice.id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('denies Alice writing even her own status row', async () => {
    const update = await alice.client
      .from('ingest_status')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', alice.id)
    expect(update.error).not.toBeNull()
    expect(update.error!.code).toBe('42501')

    const del = await alice.client.from('ingest_status').delete().eq('user_id', alice.id)
    expect(del.error).not.toBeNull()
    expect(del.error!.code).toBe('42501')

    // ORACLE: her row survived both attempts.
    const { count } = await oracle
      .from('ingest_status')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', alice.id)
    expect(count).toBe(1)
  })

  it('denies an anonymous caller', async () => {
    const { error } = await anonClient().from('ingest_status').select('user_id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})
```

- [ ] **Step 2: Run**

```bash
npm run test:rls -- ingest
```
Expected: PASS, 9 tests.

If `ingest_status` has no `last_seen_at` column, read the real column names from `supabase/migrations/20260713092121_ingest_visibility.sql` and use one of them — the assertion only needs *some* writable-looking column to be refused.

- [ ] **Step 3: Delete the superseded string matcher**

`supabase/tests/ingest_visibility.test.ts` greps migration SQL for substrings. It cannot fail when the tests above pass, it *can* pass when the schema is broken, and keeping it implies a coverage it does not provide.

```bash
git rm supabase/tests/ingest_visibility.test.ts
npm test
```
Expected: PASS — the suite is 1 file smaller and nothing else referenced it.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls/ingest.rls.test.ts
git commit -m "test: prove ingest token/status isolation live; drop SQL string matcher"
```

---

## Task 5: Shared-budget table isolation

**Files:**
- Create: `supabase/tests/rls/sharedBudgets.rls.test.ts`

**Interfaces:**
- Consumes: `signedInUser`, `deleteUser`, `serviceClient`, `TestUser` from `./harness`.
- Produces: the same file is extended by Task 6 — leave the `describe` blocks below intact and append.

Five tables, membership-gated through `private.is_member()` / `private.shares_budget_with()` (the helpers exist in a `private` schema to avoid RLS self-recursion on `budget_members`). Fixture: Alice owns a budget; Bob is not a member. Note `budgets.owner_id` references `profiles(id)`, and `handle_new_budget()` inserts the owner's `budget_members` row automatically.

`profiles_select` (`using (id = auth.uid() or shares_budget_with(id))`) carries the most logic of any policy here, so it is asserted in **both** directions.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/rls/sharedBudgets.rls.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteUser, serviceClient, signedInUser, type TestUser } from './harness'

let alice: TestUser
let bob: TestUser
let budgetId: string
let inviteCode: string
let aliceEntryId: string
const oracle = serviceClient()

beforeAll(async () => {
  alice = await signedInUser()
  bob = await signedInUser()

  const { data: budget, error } = await alice.client
    .from('budgets')
    .insert({ name: 'Household', owner_id: alice.id })
    .select()
    .single()
  expect(error).toBeNull()
  budgetId = budget!.id
  inviteCode = budget!.invite_code

  aliceEntryId = randomUUID()
  const entry = await alice.client.from('shared_entries').insert({
    id: aliceEntryId,
    budget_id: budgetId,
    user_id: alice.id,
    amount: 40,
    note: 'groceries',
    date: '2026-07-14',
  })
  expect(entry.error).toBeNull()

  const category = await alice.client
    .from('shared_categories')
    .insert({ budget_id: budgetId, name: 'groceries' })
  expect(category.error).toBeNull()
})

afterAll(async () => {
  await deleteUser(alice)
  await deleteUser(bob)
})

describe('shared budgets — a non-member sees nothing', () => {
  it('hides the budget itself', async () => {
    const { data, error } = await bob.client.from('budgets').select('id').eq('id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('hides its entries', async () => {
    const { data, error } = await bob.client
      .from('shared_entries')
      .select('id')
      .eq('budget_id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('hides its categories', async () => {
    const { data, error } = await bob.client
      .from('shared_categories')
      .select('id')
      .eq('budget_id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('hides its membership rows', async () => {
    const { data, error } = await bob.client
      .from('budget_members')
      .select('user_id')
      .eq('budget_id', budgetId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("hides Alice's profile while they share no budget", async () => {
    const { data, error } = await bob.client.from('profiles').select('id').eq('id', alice.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('shared budgets — a non-member cannot write', () => {
  it('rejects inserting an entry into a budget they are not in', async () => {
    const id = randomUUID()

    const { error } = await bob.client.from('shared_entries').insert({
      id,
      budget_id: budgetId,
      user_id: bob.id,
      amount: 1,
      note: 'intruder',
      date: '2026-07-14',
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await oracle
      .from('shared_entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(0)
  })

  it("silently no-ops an update of Alice's entry and leaves it intact", async () => {
    const { data, error } = await bob.client
      .from('shared_entries')
      .update({ amount: 9999 })
      .eq('id', aliceEntryId)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: row } = await oracle
      .from('shared_entries')
      .select('amount')
      .eq('id', aliceEntryId)
      .single()
    expect(Number(row!.amount)).toBe(40)
  })

  it("silently no-ops a delete of Alice's entry and leaves it present", async () => {
    const { data, error } = await bob.client
      .from('shared_entries')
      .delete()
      .eq('id', aliceEntryId)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { count } = await oracle
      .from('shared_entries')
      .select('id', { count: 'exact', head: true })
      .eq('id', aliceEntryId)
    expect(count).toBe(1)
  })

  it('cannot delete the owner out of her own budget', async () => {
    const { data, error } = await bob.client
      .from('budget_members')
      .delete()
      .eq('budget_id', budgetId)
      .eq('user_id', alice.id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { count } = await oracle
      .from('budget_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('budget_id', budgetId)
      .eq('user_id', alice.id)
    expect(count).toBe(1)
  })
})

// Positive control for the whole file: the denials above must be about
// membership, not about the shared tables being broken for everyone.
describe('shared budgets — the owner can use her own budget', () => {
  it('reads her budget, its entries, its categories and its members', async () => {
    const budget = await alice.client.from('budgets').select('id').eq('id', budgetId)
    expect(budget.data).toHaveLength(1)

    const entries = await alice.client
      .from('shared_entries')
      .select('id')
      .eq('budget_id', budgetId)
    expect(entries.data).toHaveLength(1)

    const categories = await alice.client
      .from('shared_categories')
      .select('id')
      .eq('budget_id', budgetId)
    expect(categories.data).toHaveLength(1)

    // handle_new_budget() enrolled her automatically.
    const members = await alice.client
      .from('budget_members')
      .select('user_id')
      .eq('budget_id', budgetId)
    expect(members.data).toHaveLength(1)
    expect(members.data![0].user_id).toBe(alice.id)
  })
})
```

- [ ] **Step 2: Run**

```bash
npm run test:rls -- sharedBudgets
```
Expected: PASS, 10 tests.

If an insert fails on an unexpected column (`shared_entries` / `shared_categories` shapes are defined in `supabase/migrations/001_shared_budgets.sql`), correct the **fixture** columns to match the schema. Do not weaken an assertion to make a test pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls/sharedBudgets.rls.test.ts
git commit -m "test: prove shared-budget tables isolate non-members"
```

---

## Task 6: The `SECURITY DEFINER` RPCs

**Files:**
- Modify: `supabase/tests/rls/sharedBudgets.rls.test.ts` (append)

**Interfaces:**
- Consumes: the module-level `alice`, `bob`, `budgetId`, `inviteCode`, `oracle` fixtures from Task 5, plus `anonClient` from `./harness`.

This is the task that matters most. `budget_members` has **no insert policy** and is granted only `select, delete` — nobody can insert into it directly. Membership is created solely by `join_budget(p_code text)`, a `SECURITY DEFINER` function that **bypasses RLS by design**. It and `regenerate_invite_code(p_budget_id uuid)` are where escalation would actually live, and no table-policy test reaches them.

From `supabase/migrations/001_shared_budgets.sql`:
- `join_budget` looks up `upper(trim(p_code))` and raises `invalid_code` when not found.
- `regenerate_invite_code` updates `where id = p_budget_id and owner_id = auth.uid()` and raises `not_owner` when nothing matched — so even a legitimate **member** who is not the owner must be refused.
- `execute` on both is revoked from `anon` (`20260705093851_shared_budgets_security_hardening.sql`).

- [ ] **Step 1: Append the failing tests**

Add to the bottom of `supabase/tests/rls/sharedBudgets.rls.test.ts` (and add `anonClient` to the existing `./harness` import):

```ts
describe('shared budgets — the SECURITY DEFINER RPCs', () => {
  it('rejects join_budget with a guessed invite code and creates no membership', async () => {
    const { error } = await bob.client.rpc('join_budget', { p_code: 'ZZZZZZ' })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('invalid_code')

    // ORACLE: the function bypasses RLS, so only the database can tell us the truth.
    const { count } = await oracle
      .from('budget_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', bob.id)
    expect(count).toBe(0)
  })

  it('denies an anonymous caller from executing join_budget', async () => {
    const { error } = await anonClient().rpc('join_budget', { p_code: inviteCode })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('denies an anonymous caller from executing regenerate_invite_code', async () => {
    const { error } = await anonClient().rpc('regenerate_invite_code', { p_budget_id: budgetId })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it("refuses to regenerate a non-member's invite code and leaves it unchanged", async () => {
    const { error } = await bob.client.rpc('regenerate_invite_code', { p_budget_id: budgetId })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('not_owner')

    const { data } = await oracle
      .from('budgets')
      .select('invite_code')
      .eq('id', budgetId)
      .single()
    expect(data!.invite_code).toBe(inviteCode)
  })

  // Ordered last: it mutates Bob into a member, which the tests above depend on him not being.
  it('lets Bob join with the real code, and only then see the budget and Alice', async () => {
    const { error } = await bob.client.rpc('join_budget', { p_code: inviteCode })
    expect(error).toBeNull()

    const budget = await bob.client.from('budgets').select('id').eq('id', budgetId)
    expect(budget.data).toHaveLength(1)

    const entries = await bob.client.from('shared_entries').select('id').eq('budget_id', budgetId)
    expect(entries.data).toHaveLength(1)

    // shares_budget_with() now resolves true, so Alice's profile becomes visible.
    const profile = await bob.client.from('profiles').select('id').eq('id', alice.id)
    expect(profile.data).toHaveLength(1)
  })

  it('still refuses to let a mere member regenerate the owner\'s invite code', async () => {
    // Bob is a member now, but not the owner. regenerate_invite_code checks owner_id.
    const { error } = await bob.client.rpc('regenerate_invite_code', { p_budget_id: budgetId })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('not_owner')

    const { data } = await oracle
      .from('budgets')
      .select('invite_code')
      .eq('id', budgetId)
      .single()
    expect(data!.invite_code).toBe(inviteCode)
  })
})
```

- [ ] **Step 2: Run the whole file**

```bash
npm run test:rls -- sharedBudgets
```
Expected: PASS, 16 tests.

**These RPCs have never been tested against a hostile caller. A red run here is plausibly a real finding, not a broken test.** If one fails, stop and report the exact behavior before changing anything.

- [ ] **Step 3: Run the full RLS suite**

```bash
npm run test:rls
```
Expected: PASS — 48 tests across 5 files.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls/sharedBudgets.rls.test.ts
git commit -m "test: prove join_budget and regenerate_invite_code reject hostile callers"
```

---

## Task 7: Gate pull requests on it

**Files:**
- Modify: `.github/workflows/ci.yml`

A second job **parallel to `verify`**, not appended to it: Docker startup costs ~90s but overlaps, so wall-clock CI barely moves and `verify` stays fast for pure-frontend PRs. A red `rls` job then means "isolation broke", not "something in CI broke". No secrets — the local stack uses fixed, well-known dev keys.

- [ ] **Step 1: Add the job**

Append to `.github/workflows/ci.yml`, as a sibling of `verify:` under `jobs:` (same indentation):

```yaml
  # Isolation between users rests entirely on RLS. This job proves the policies
  # hold against a real Postgres with every migration applied — the same schema a
  # fresh production deploy produces. Parallel to `verify` so it does not slow
  # down pull requests that never touch the database.
  rls:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Set up Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start local Supabase stack
        # Applies every migration in supabase/migrations in order.
        run: supabase start

      - name: Run live RLS isolation tests
        run: npm run test:rls

      - name: Stop local Supabase stack
        if: always()
        run: supabase stop
```

- [ ] **Step 2: Validate the workflow parses**

```bash
npx --yes yaml-lint .github/workflows/ci.yml
```
Expected: no errors. (If `yaml-lint` is unavailable, `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"` does the same job.)

- [ ] **Step 3: Confirm both suites still pass locally**

```bash
npm test && npm run test:rls
```
Expected: both PASS. `npm test` must not attempt any RLS test.

- [ ] **Step 4: Commit and push the branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate pull requests on live RLS isolation tests"
git push -u origin HEAD
```

- [ ] **Step 5: Verify the job actually runs green on GitHub**

```bash
gh run watch
```
Expected: both `verify` and `rls` pass. **The `rls` job passing in CI is the deliverable** — a suite that only runs on the author's laptop is not a gate.

---

## Task 8: Update the audit status document

**Files:**
- Modify: `docs/PROJECT_IMPROVEMENT_STATUS.md`

- [ ] **Step 1: Record what changed**

In the "Completed or materially addressed" table, add a row:

```markdown
| M17 — live RLS isolation tests | Partially complete | `entries`, `poker_sessions`, `ingest_tokens`, `ingest_status`, the five shared-budget tables, and the `join_budget` / `regenerate_invite_code` SECURITY DEFINER RPCs are tested against a real Postgres with every migration applied, in a CI job parallel to `verify`. Browser E2E and accessibility checks remain. | `supabase/tests/rls/`, `.github/workflows/ci.yml` |
```

In "Next recommended work", narrow item 3 to what is left:

```markdown
3. Add M17 browser E2E and accessibility checks. (Live RLS isolation tests are done.)
```

In "Verification baseline", append:

```markdown
- Live RLS: 48 isolation tests across 9 tables and 2 SECURITY DEFINER RPCs, run against a real Postgres in CI. These replaced `supabase/tests/ingest_visibility.test.ts`, which asserted that migration files *contained* policy substrings and would have stayed green if a policy were dropped.
```

Correct the test-count and coverage lines to whatever `npm test -- --coverage` actually reports after the string matcher's removal. **Run it and copy the real numbers — do not adjust them by hand.**

- [ ] **Step 2: Commit**

```bash
git add docs/PROJECT_IMPROVEMENT_STATUS.md
git commit -m "docs: record live RLS isolation tests against M17"
```

---

## Notes for the implementer

- **A green first run is expected for Tasks 2-5** — these characterize policies that already exist. Task 1's mutation check (deliberately breaking a policy and watching the suite go red) is what proves the tests have teeth. Do not skip it.
- **Task 6 is different.** The RPCs bypass RLS by design and have never been tested against a hostile caller. If they go red, treat it as a genuine finding and report it — do not soften the assertion.
- If any fixture insert fails on a column that does not exist, read the real schema from the migration and fix the **fixture**. Never weaken an assertion to get to green.
