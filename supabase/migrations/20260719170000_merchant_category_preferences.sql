-- Explicit "always use this category" rules learned when a user categorizes
-- an automatic Apple Pay or DBS capture. One normalized merchant has one rule
-- per user; the latest correction replaces the previous choice.
create table public.merchant_category_preferences (
  user_id             uuid not null references auth.users (id) on delete cascade,
  normalized_merchant text not null,
  merchant_label      text not null,
  category_id         text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (user_id, normalized_merchant),
  constraint merchant_category_preferences_normalized_length
    check (char_length(normalized_merchant) between 1 and 300),
  constraint merchant_category_preferences_label_length
    check (char_length(merchant_label) between 1 and 500),
  constraint merchant_category_preferences_category_length
    check (char_length(category_id) between 1 and 128)
);

create trigger merchant_category_preferences_updated before update
on public.merchant_category_preferences
for each row execute function public.set_updated_at();

alter table public.merchant_category_preferences enable row level security;

create policy merchant_category_preferences_select_own
on public.merchant_category_preferences for select to authenticated
using ((select auth.uid()) = user_id);

create policy merchant_category_preferences_insert_own
on public.merchant_category_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy merchant_category_preferences_update_own
on public.merchant_category_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy merchant_category_preferences_delete_own
on public.merchant_category_preferences for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.merchant_category_preferences to authenticated;
grant all privileges on public.merchant_category_preferences to service_role;
