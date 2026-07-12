-- Entry/poker ids come from users' localStorage caches and must be preserved verbatim
-- (idempotent migration re-runs key on them). Current clients generate UUIDs, but old
-- cached data may predate that — accept any opaque string id rather than reject a
-- legacy id at migration time and strand the user in an incomplete-migration loop.
alter table public.entries alter column id type text;
alter table public.poker_sessions alter column id type text;
