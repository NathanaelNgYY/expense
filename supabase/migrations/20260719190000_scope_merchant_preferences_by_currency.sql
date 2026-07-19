-- Merchant corrections are wallet-local. Existing rules remain SGD rules so
-- the change is backward compatible for every current user.
alter table public.merchant_category_preferences
  add column currency text not null default 'SGD';

alter table public.merchant_category_preferences
  add constraint merchant_category_preferences_currency_iso
  check (currency ~ '^[A-Z]{3}$');

alter table public.merchant_category_preferences
  drop constraint merchant_category_preferences_pkey;

alter table public.merchant_category_preferences
  add primary key (user_id, normalized_merchant, currency);
