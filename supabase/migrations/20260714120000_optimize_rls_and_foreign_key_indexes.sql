-- Cover every foreign-key column that is not already the leading column of
-- an index. Besides speeding joins, these indexes avoid full-table scans when
-- referenced rows are updated or deleted.
create index if not exists budget_members_user_id_idx
  on public.budget_members (user_id);

create index if not exists budgets_owner_id_idx
  on public.budgets (owner_id);

create index if not exists ingest_tokens_user_id_idx
  on public.ingest_tokens (user_id);

create index if not exists shared_categories_budget_id_idx
  on public.shared_categories (budget_id);

create index if not exists shared_entries_category_id_idx
  on public.shared_entries (category_id);

create index if not exists shared_entries_user_id_idx
  on public.shared_entries (user_id);

-- Evaluate auth.uid() once per statement instead of once per candidate row.
-- The predicates are otherwise unchanged, preserving the existing RLS model.
alter policy profiles_select on public.profiles
  using (id = (select auth.uid()) or private.shares_budget_with(id));

alter policy profiles_update on public.profiles
  using (id = (select auth.uid()));

alter policy budgets_select on public.budgets
  using (owner_id = (select auth.uid()) or private.is_member(id));

alter policy budgets_insert on public.budgets
  with check (owner_id = (select auth.uid()));

alter policy budgets_update on public.budgets
  using (owner_id = (select auth.uid()));

alter policy budgets_delete on public.budgets
  using (owner_id = (select auth.uid()));

alter policy members_delete on public.budget_members
  using (
    user_id <> (select b.owner_id from public.budgets b where b.id = budget_id)
    and (
      user_id = (select auth.uid())
      or exists (
        select 1
        from public.budgets b
        where b.id = budget_id and b.owner_id = (select auth.uid())
      )
    )
  );

alter policy entries_insert on public.shared_entries
  with check (private.is_member(budget_id) and user_id = (select auth.uid()));

alter policy entries_select_own on public.entries
  using (user_id = (select auth.uid()));

alter policy entries_insert_own on public.entries
  with check (user_id = (select auth.uid()));

alter policy entries_update_own on public.entries
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy entries_delete_own on public.entries
  using (user_id = (select auth.uid()));

alter policy poker_select_own on public.poker_sessions
  using (user_id = (select auth.uid()));

alter policy poker_insert_own on public.poker_sessions
  with check (user_id = (select auth.uid()));

alter policy poker_update_own on public.poker_sessions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy poker_delete_own on public.poker_sessions
  using (user_id = (select auth.uid()));
