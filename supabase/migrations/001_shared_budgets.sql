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
--   8. As B (re-joined): leave the budget yourself -> your list no longer
--      shows it. As A: try to delete your own member row -> 0 rows (the
--      owner can never leave their own budget).
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
-- Delete: the owner removes members, or a member leaves voluntarily. The
-- owner's own row is never deletable, so a budget can't be left ownerless.
create policy members_delete on public.budget_members for delete
  using (
    user_id <> (select b.owner_id from public.budgets b where b.id = budget_id)
    and (
      user_id = auth.uid()
      or exists (select 1 from public.budgets b where b.id = budget_id and b.owner_id = auth.uid())
    )
  );

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
