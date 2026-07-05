-- Explicit Data API grants for shared budgets. RLS still controls row access.
grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, delete on public.budget_members to authenticated;
grant select, insert, update, delete on public.shared_categories to authenticated;
grant select, insert, update, delete on public.shared_entries to authenticated;

revoke execute on function public.join_budget(text) from anon;
revoke execute on function public.regenerate_invite_code(uuid) from anon;
grant execute on function public.join_budget(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
