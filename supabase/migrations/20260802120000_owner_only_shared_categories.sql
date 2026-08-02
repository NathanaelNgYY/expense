-- Restrict shared-category writes to the budget owner.
--
-- WHY: categories_all granted every member insert/update/delete on
-- shared_categories, while both UIs (OwnerTools and Settings > Shared budgets)
-- only ever showed the editor to the owner. That gap was silent in both
-- directions: a member had a permission with no button, and nothing on the
-- server actually enforced the owner-only rule the UI implied.
--
-- The budget's SHAPE (name, monthly limit, existence, category set) is already
-- the owner's alone -- budgets_update and budgets_delete are owner-scoped. Its
-- CONTENTS stay a trusted group: any member still adds entries and may edit or
-- delete anyone's, which is the deliberate model recorded in 001. Categories
-- belong to the shape, not the contents, so they move to the owner. Deleting
-- one is also destructive across everyone's history, because
-- shared_entries.category_id is ON DELETE SET NULL: one member could silently
-- uncategorise months of another member's entries.
--
-- Members keep SELECT, which is what BudgetDetail's category chips and the
-- Settings category list read.
--
-- MANUAL VERIFICATION (two accounts, A owns, B joined):
--   1. As B: select from shared_categories -> sees A's categories.
--   2. As B: insert a category    -> 0 rows / RLS violation.
--   3. As B: update a category    -> 0 rows.
--   4. As B: delete a category    -> 0 rows.
--   5. As A: insert/update/delete -> all succeed.
--   6. As B: insert a shared_entry -> still succeeds (contents unchanged).
--   7. As B: delete A's shared_entry -> still succeeds (trusted-group model).

-- Policy-only helper, kept in `private` alongside is_member so it stays out of
-- the exposed public API schema. SECURITY DEFINER for the same reason as
-- is_member: the policy must not re-enter budgets' own RLS.
create or replace function private.is_budget_owner(p_budget_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from budgets
    where id = p_budget_id and owner_id = auth.uid()
  )
$$;

grant execute on function private.is_budget_owner(uuid) to anon, authenticated;

drop policy if exists categories_all on public.shared_categories;

create policy categories_select on public.shared_categories for select
  using (private.is_member(budget_id));

create policy categories_insert on public.shared_categories for insert
  with check (private.is_budget_owner(budget_id));

-- USING gates which rows may be targeted, WITH CHECK gates the result, so a
-- member cannot move a category into a budget they do not own either.
create policy categories_update on public.shared_categories for update
  using (private.is_budget_owner(budget_id))
  with check (private.is_budget_owner(budget_id));

create policy categories_delete on public.shared_categories for delete
  using (private.is_budget_owner(budget_id));
