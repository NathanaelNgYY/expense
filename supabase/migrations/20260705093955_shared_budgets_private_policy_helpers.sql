-- Move policy-only security-definer helpers out of the exposed public API schema.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_member(p_budget_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from budget_members
    where budget_id = p_budget_id and user_id = auth.uid()
  )
$$;

create or replace function private.shares_budget_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from budget_members a
    join budget_members b using (budget_id)
    where a.user_id = auth.uid() and b.user_id = p_user_id
  )
$$;

grant execute on function private.is_member(uuid) to anon, authenticated;
grant execute on function private.shares_budget_with(uuid) to anon, authenticated;

revoke execute on function public.is_member(uuid) from public, anon, authenticated;
revoke execute on function public.shares_budget_with(uuid) from public, anon, authenticated;

drop policy if exists profiles_select on public.profiles;
drop policy if exists budgets_select on public.budgets;
drop policy if exists members_select on public.budget_members;
drop policy if exists categories_all on public.shared_categories;
drop policy if exists entries_select on public.shared_entries;
drop policy if exists entries_insert on public.shared_entries;
drop policy if exists entries_update on public.shared_entries;
drop policy if exists entries_delete on public.shared_entries;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or private.shares_budget_with(id));

create policy budgets_select on public.budgets for select
  using (owner_id = auth.uid() or private.is_member(id));

create policy members_select on public.budget_members for select
  using (private.is_member(budget_id));

create policy categories_all on public.shared_categories for all
  using (private.is_member(budget_id))
  with check (private.is_member(budget_id));

create policy entries_select on public.shared_entries for select
  using (private.is_member(budget_id));
create policy entries_insert on public.shared_entries for insert
  with check (private.is_member(budget_id) and user_id = auth.uid());
create policy entries_update on public.shared_entries for update
  using (private.is_member(budget_id));
create policy entries_delete on public.shared_entries for delete
  using (private.is_member(budget_id));
