-- Personal-data backend: entries + poker sessions + ingest tokens.
-- Migrates the Netlify Functions/Blobs backend to Supabase per
-- docs/superpowers/specs/2026-07-11-supabase-migration.md.
--
-- SUPABASE DASHBOARD SETUP (one-time, not SQL):
--   Auth > Sign In / Up > Anonymous sign-ins: ENABLE. The client silently calls
--   signInAnonymously() for users who never signed in; without this toggle every
--   such user gets a 422 and stays cache-only.

-- ---------- entries ----------
-- ids are client-generated UUIDs (crypto.randomUUID()), preserved across the
-- localStorage -> Supabase migration, so no default on id.
create table public.entries (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount      numeric not null,
  category    text,
  note        text not null default '',
  date        date not null,
  source      text,
  merchant    text,
  occurred_at timestamptz,
  currency    text,
  import_key  text,
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index entries_user_date on public.entries (user_id, date desc);

create trigger entries_updated before update on public.entries
for each row execute function public.set_updated_at();

-- ---------- poker_sessions ----------
create table public.poker_sessions (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  start_time text not null,
  end_time   text not null,
  stakes     text not null,
  buy_in     numeric not null,
  result     text not null check (result in ('win', 'loss')),
  amount     numeric not null,
  created_at timestamptz not null default now()
);

create index poker_sessions_user_date on public.poker_sessions (user_id, date desc);

-- ---------- ingest_tokens ----------
-- Maps an iOS-Shortcut bearer token (sha256 hex of the raw token; the raw token is
-- never stored) to the user whose entries it writes. Replaces the single shared
-- INGEST_TOKEN env var. Only the ingest Edge Function (service role) reads this
-- table; clients get no grants and no policies.
create table public.ingest_tokens (
  token_hash text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.entries enable row level security;
alter table public.poker_sessions enable row level security;
alter table public.ingest_tokens enable row level security;

create policy entries_select_own on public.entries for select
  using (user_id = auth.uid());
create policy entries_insert_own on public.entries for insert
  with check (user_id = auth.uid());
create policy entries_update_own on public.entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy entries_delete_own on public.entries for delete
  using (user_id = auth.uid());

create policy poker_select_own on public.poker_sessions for select
  using (user_id = auth.uid());
create policy poker_insert_own on public.poker_sessions for insert
  with check (user_id = auth.uid());
create policy poker_update_own on public.poker_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy poker_delete_own on public.poker_sessions for delete
  using (user_id = auth.uid());

-- ingest_tokens: RLS enabled with NO policies — service role only.

-- ---------- Data API grants (RLS still controls row access) ----------
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.poker_sessions to authenticated;
-- ingest_tokens: no grants to anon/authenticated, deliberately.
