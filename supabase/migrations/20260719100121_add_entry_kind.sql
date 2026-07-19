alter table public.entries
  add column kind text not null default 'expense',
  add constraint entries_kind_check check (kind in ('expense', 'refund'));
