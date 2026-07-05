# Shared Budgets — Design

**Date:** 2026-07-05
**Status:** Approved by user (brainstorming session)

## Summary

Add **shared budgets** ("pots") that friends/family can join and spend from together —
e.g. "Family", "Trip to Japan". The existing personal budget (Netlify Blobs backend,
localStorage cache, offline sync queue, iOS Shortcut ingest) is **completely untouched**.
Shared budgets are a new, parallel feature backed by **Supabase** (Postgres + Auth +
Realtime), accessed directly from the client via `supabase-js` with Row Level Security.

## Decisions made

| Question | Decision |
|---|---|
| Feature shape | Shared pots alongside the personal budget; each pot has its own name, monthly limit, categories, entries, members |
| Auth | Supabase Auth, passwordless email **OTP code** (6-digit code typed into the app — avoids the iOS-PWA problem where magic-link taps open Safari instead of the installed app) |
| Backend scope | Supabase for shared budgets + auth **only**; personal budget stays on Netlify Blobs |
| Attribution | Every entry is tagged with the member who added it; per-member totals shown. No Splitwise-style debt/settlement tracking |
| Sync model | Supabase Realtime, **online-only** (no offline queue for shared data; personal budget keeps its offline behavior) |
| Invites | Shareable invite code (e.g. `FAM-7K2Q`) sent via share sheet; owner can regenerate to revoke |
| Integration style | `supabase-js` directly in the client + RLS policies. No Netlify Functions proxy |
| Entry permissions | Any member can edit/delete any entry (trusted-group model); budget settings/deletion/invite code are owner-only |

## Data model (Supabase Postgres)

```
profiles          id uuid PK = auth.users.id, display_name text, created_at
                  → row auto-created by trigger on auth.users insert

budgets           id uuid PK, name text, monthly_limit numeric NULL,
                  currency text default 'SGD', invite_code text UNIQUE,
                  owner_id uuid → profiles, created_at

budget_members    (budget_id, user_id) PK, role text CHECK ('owner'|'member'),
                  joined_at

shared_categories id uuid PK, budget_id FK, label text,
                  budget_amount numeric NULL, icon text
                  → mirrors client CustomCategory shape

shared_entries    id uuid PK, budget_id FK, user_id FK (creator),
                  amount numeric, category_id uuid NULL FK,
                  note text, date date (SGT-local calendar date),
                  created_at, updated_at
```

### RLS policies

- Membership-scoped everything: budgets, entries, categories, and member lists are
  visible/writable only to members of that budget.
- `is_member(budget_id)` is a `SECURITY DEFINER` SQL helper used inside policies to
  avoid RLS self-recursion on `budget_members`.
- `join_budget(code)` is a `SECURITY DEFINER` function: looks up the budget by invite
  code, inserts the caller's membership, returns the budget row. (Needed because a
  non-member can't SELECT the budget row under RLS.)
- `regenerate_invite_code(budget_id)` — owner-only.
- `profiles` are readable only by users who share ≥1 budget with the profile owner
  (and by the owner themselves).
- Entries: INSERT requires membership and `user_id = auth.uid()`; UPDATE/DELETE
  allowed to any member of the budget. Budget UPDATE/DELETE owner-only.
- Realtime enabled on `shared_entries` and `budget_members`; RLS applies to what
  each subscriber receives.

## Auth & invite flow

1. Shared tab → if no session: enter email → Supabase emails a 6-digit code →
   type code → signed in (`signInWithOtp` + `verifyOtp`). First sign-in also asks
   for a display name (stored on `profiles`).
2. Session persists in the PWA and auto-refreshes; sign-in is rare after the first time.
3. Create budget: name + optional monthly limit → creator becomes owner, invite code
   generated.
4. Invite: detail screen shows code + iOS share-sheet button with a prefilled message.
   Recipient signs in → "Join a budget" → enters code → `join_budget(code)`.
5. Owner tools: regenerate code (revokes old), remove member, rename, set limit,
   delete budget.

## Client architecture

```
budget-tracker/
  supabase/migrations/001_shared_budgets.sql   ← schema + RLS + functions, in repo
  src/
    lib/supabaseClient.ts        ← supabase-js init (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
    sharedBudgets/
      SharedBudgetsContext.tsx   ← session, budget list, active budget's
                                    entries/categories/members, realtime sub lifecycle
      SharedScreen.tsx           ← tab root: auth gate → budget list → detail
      AuthGate.tsx               ← email → OTP code entry → display name
      BudgetList.tsx             ← list + Create / Join actions
      BudgetDetail.tsx           ← entries feed, add-entry form, month progress,
                                    per-member totals, owner tools
      *.test.tsx                 ← colocated Vitest tests
```

- New **Shared** tab in the bottom nav. Personal tabs, `EntriesContext`, sync queue,
  ingest — all untouched.
- Detail screen mirrors personal-budget UX (category chips + icons, monthly progress
  vs. limit) plus adder's name per entry and a per-member breakdown.
- Month boundaries use `shared/sgtDate.ts` (SGT-local). Per-member totals computed
  client-side; nothing derived is persisted (repo convention).
- Realtime: subscribe to the open budget's `shared_entries`/`budget_members` changes,
  patch context state, unsubscribe on leave.

## Error handling

- Online-only: offline or Supabase unreachable → banner ("Shared budgets need a
  connection"), in-memory data still visible, writes disabled (not queued).
- Token refresh is silent; hard auth failure returns to the email screen.
- Unknown invite code → friendly "code not found" message.

## Testing

- Vitest + mocked supabase-js client: context logic (applying realtime events,
  per-member totals), auth-gate state transitions, create/join flows.
- RLS: manual smoke-test checklist in the migration file header (two test accounts;
  verify cross-budget isolation, non-member join via code, owner-only operations).

## One-time setup (user, at implementation time)

1. Create a free Supabase project.
2. Run `001_shared_budgets.sql` in the Supabase SQL editor.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` and in
   Netlify site env vars; redeploy.

## Out of scope

- Debt splitting / settle-up
- Offline writes to shared budgets
- Migrating personal data to Supabase
- iOS Shortcut ingest into shared budgets
- Push notifications on members' activity
