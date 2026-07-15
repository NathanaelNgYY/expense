-- User-owned automatic categorization preferences used by the PWA settings UI
-- and the token-authenticated ingest Edge Function. Rules target category ids,
-- so built-in and custom categories use the same path.
create table public.automatic_category_preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  food_time_rules jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint automatic_category_preferences_rules_array
    check (jsonb_typeof(food_time_rules) = 'array'),
  constraint automatic_category_preferences_rules_limit
    check (jsonb_array_length(food_time_rules) <= 8)
);

create trigger automatic_category_preferences_updated before update
on public.automatic_category_preferences
for each row execute function public.set_updated_at();

alter table public.automatic_category_preferences enable row level security;

create policy automatic_category_preferences_select_own
on public.automatic_category_preferences for select to authenticated
using ((select auth.uid()) = user_id);

create policy automatic_category_preferences_insert_own
on public.automatic_category_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy automatic_category_preferences_update_own
on public.automatic_category_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy automatic_category_preferences_delete_own
on public.automatic_category_preferences for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.automatic_category_preferences to authenticated;
grant all privileges on public.automatic_category_preferences to service_role;
