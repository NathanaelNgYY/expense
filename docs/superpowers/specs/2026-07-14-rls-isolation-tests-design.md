# Live RLS isolation tests — design

**Date:** 2026-07-14
**Audit item:** M17 (browser E2E, accessibility, automated live RLS isolation tests). Runs in CI, which is H9.
**Status:** approved design, not yet implemented.

## Problem

Nothing verifies that Postgres actually enforces row isolation between users.

`supabase/tests/ingest_visibility.test.ts` reads migration `.sql` files as strings and asserts they
*contain* substrings such as `using ((select auth.uid()) = user_id)`. That proves the SQL was typed.
It does not prove the database enforces it, and it stays green if a later migration drops a policy,
disables RLS, or adds an over-permissive grant.

`docs/testing/migration-recovery.tdd.md` states plainly: "No browser E2E or live Postgres write was
run." RLS has only ever been smoke-tested by hand, against a checklist in a migration file header.

RLS is the single mechanism keeping one user's financial data away from another's. It is the last
thing in this codebase that should rest on a string match.

## The central constraint: unauthorized writes fail silently

This dictates the shape of every assertion, so it comes before the architecture.

| Bob attempts, on Alice's row | Postgres result |
| --- | --- |
| `select` | empty set — no error |
| `update` | 0 rows affected — **no error** |
| `delete` | 0 rows affected — **no error** |
| `insert` with `user_id = alice` | raises `42501` |
| any operation on a table with no grant | raises `42501` permission denied |

Only two of those five are loud. A test that asserts "no error was thrown" therefore **passes
against completely broken policies**.

So every negative case asserts twice:

1. the operation returned zero rows / raised the expected error, **and**
2. read back through a **service-role client that bypasses RLS**, Alice's row is still present and
   unchanged.

The service-role client is the ground-truth oracle. Without it, these tests are theatre.

The mirror of that constraint: **every table also gets a positive control** — Alice can do the thing
to her own row. Without positive controls, a policy of `using (false)` passes every negative test
while bricking the application.

## Architecture

A live Postgres from `supabase start` (Supabase CLI, Docker): real Postgres, real GoTrue auth, real
RLS, and — critically — **the schema built by applying every migration in order**, which is exactly
the schema a fresh production deploy produces. Ephemeral and hermetic, so no shared state and no
secrets in CI; the local stack's keys are the well-known fixed dev keys.

Rejected: a remote Supabase project (needs long-lived service keys in CI, leaves residue in a real
database, and the staging project is slated for deletion). Rejected: pgTAP, which impersonates users
with `set local role` and so proves the policies but not the whole client path through grants,
PostgREST, and auth.

### Files

| File | Purpose |
| --- | --- |
| `vitest.rls.config.ts` | Separate Vitest project; includes only `supabase/tests/rls/**` |
| `supabase/tests/rls/harness.ts` | Client factories + fixtures + teardown |
| `supabase/tests/rls/entries.rls.test.ts` | `entries` |
| `supabase/tests/rls/pokerSessions.rls.test.ts` | `poker_sessions` |
| `supabase/tests/rls/ingest.rls.test.ts` | `ingest_tokens`, `ingest_status` |
| `supabase/tests/rls/sharedBudgets.rls.test.ts` | 5 shared tables + 2 RPCs |

`npm run test:rls` runs it. It is **excluded from the default `npm test` run** (which stays
Docker-free and fast) and **from the coverage gate** — it exercises SQL, not TypeScript, and folding
it into the coverage numbers would perturb H9's enforced thresholds for no reason.

### Harness

- Reads local stack credentials from `supabase status -o json`.
- `signedInUser()` — mints a confirmed throwaway user via the admin API; returns an **anon-key**
  `supabase-js` client signed in as that user. This is the same client path the app uses.
- `anonClient()` — anon key, never signed in.
- `serviceClient()` — service role. The oracle. Used **only** for fixture setup and for verifying
  ground truth after a negative assertion. Never used to exercise a policy, since it bypasses RLS.
- Teardown deletes the users; `on delete cascade` removes their rows.
- If the local stack is not running, the harness **fails loudly** ("run `supabase start`"). It must
  never skip. A silently-skipped security test is worse than no test.

## Test matrix

### `entries`, `poker_sessions`

Both are `user_id = auth.uid()` across select/insert/update/delete.

- Positive control: Alice inserts, selects, updates, deletes her own row.
- Alice's `select` returns her rows and **not** Bob's.
- Bob selects Alice's row by id → empty.
- Bob updates Alice's row → 0 affected, **and the oracle confirms it is unchanged**.
- Bob deletes Alice's row → 0 affected, **and the oracle confirms it still exists**.
- Bob inserts with `user_id = alice` → raises.
- `anon` reads → denied.

### `ingest_tokens`

Protected by the *absence* of policies and grants — service-role only. Absence is precisely what a
later migration undoes silently.

- Alice (authenticated) selects → denied.
- `anon` selects → denied.
- Service role selects → **succeeds**. This is not redundant: it proves the table is reachable and
  the two denials above are real, not a false pass from a typo'd table name.

### `ingest_status`

Owner-readable projection; all client writes revoked.

- Alice selects → sees her own row only.
- Bob selects Alice's status → empty.
- Alice inserts / updates / deletes **her own** row → each denied.
- `anon` reads → denied.

### Shared budgets — `profiles`, `budgets`, `budget_members`, `shared_categories`, `shared_entries`

Membership-gated via the `private.is_member()` / `private.shares_budget_with()` helpers (which exist
in the `private` schema to avoid RLS self-recursion on `budget_members`).

Fixture: Alice creates a budget with entries and categories. Bob is **not** a member.

- Bob selects Alice's budget → empty. Her `shared_entries` → empty. Her `shared_categories` → empty.
- Bob inserts a `shared_entry` into her budget → denied.
- Bob updates / deletes her `shared_entries` → 0 affected, **oracle confirms unchanged**.
- **`profiles`:** Bob cannot see Alice's profile row while they share no budget; once he joins, he
  can. This policy carries the most logic (`shares_budget_with`), so it is asserted in both
  directions.
- After Bob joins: he can read the budget, its entries, and its categories. (Positive control — the
  denials above must be membership, not blanket breakage.)

### Shared budgets — the RPCs

`budget_members` has only `select` and `delete` policies and is granted only `select, delete`. **No
client can insert into it directly.** Joining goes through `join_budget(text)`, a `SECURITY DEFINER`
function that bypasses RLS by design. That function and `regenerate_invite_code(uuid)` are where the
real escalation risk lives, and no amount of table-policy testing reaches them.

- Bob calls `join_budget()` with a wrong / guessed invite code → rejected, and the oracle confirms
  no `budget_members` row was created.
- Bob calls `join_budget()` with the correct code → joins. (Positive control.)
- Bob calls `regenerate_invite_code()` on a budget he is not a member of → rejected, and the oracle
  confirms the code is unchanged.
- `anon` calls either function → denied (`execute` is revoked from `anon`).

## CI

A second job, `rls`, in `.github/workflows/ci.yml`, running **in parallel with `verify`** — Docker
startup costs roughly 90s but overlaps, so wall-clock CI time barely moves, and `verify` stays fast
for pure-frontend pull requests. A red `rls` job means "isolation broke", not "something in CI
broke".

```yaml
rls:
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v6
      with: { node-version: 24, cache: npm }
    - run: npm ci
    - uses: supabase/setup-cli@v1
    - run: supabase start          # applies every migration in order
    - run: npm run test:rls
    - if: always()
      run: supabase stop
```

No secrets required.

## Removed

`supabase/tests/ingest_visibility.test.ts` is deleted. Once the behavioral suite exists, the string
matcher cannot fail when the real tests pass, *can* pass when the schema is broken, and implies a
coverage it does not provide.

## Out of scope

- The `entries` and `poker_sessions` policies call `auth.uid()` directly rather than
  `(select auth.uid())`, so it re-evaluates per row. That is a **performance** issue, not a
  correctness one, and is left to a separate change so this one stays purely additive.
- Browser E2E and accessibility checks — the other two thirds of M17.
- Enforcing required status checks on the repository, which is blocked by the GitHub plan and is a
  settings change, not code.
