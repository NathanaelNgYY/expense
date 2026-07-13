-- Safe client-visible status for iOS Shortcut ingestion. Token hashes stay in
-- ingest_tokens, which remains service-role-only with no client policies or grants.
create table public.ingest_status (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  token_label      text not null default '',
  last_captured_at timestamptz,
  last_source      text check (last_source in ('apple_pay', 'dbs_email')),
  updated_at       timestamptz not null default now()
);

alter table public.ingest_status enable row level security;

create policy ingest_status_select_own on public.ingest_status
for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.ingest_status to authenticated;

-- Existing installs get an immediately useful status row without exposing or
-- copying token_hash. The newest token label and newest ingested entry win.
with latest_token as (
  select distinct on (user_id)
    user_id,
    label,
    created_at
  from public.ingest_tokens
  order by user_id, created_at desc
),
latest_capture as (
  select distinct on (user_id)
    user_id,
    created_at as last_captured_at,
    case source
      when 'apple-pay' then 'apple_pay'
      when 'dbs-email' then 'dbs_email'
    end as last_source
  from public.entries
  where source in ('apple-pay', 'dbs-email')
  order by user_id, created_at desc
)
insert into public.ingest_status (
  user_id,
  token_label,
  last_captured_at,
  last_source,
  updated_at
)
select
  token.user_id,
  token.label,
  capture.last_captured_at,
  capture.last_source,
  greatest(token.created_at, coalesce(capture.last_captured_at, token.created_at))
from latest_token token
left join latest_capture capture using (user_id)
on conflict (user_id) do update set
  token_label = excluded.token_label,
  last_captured_at = excluded.last_captured_at,
  last_source = excluded.last_source,
  updated_at = excluded.updated_at;
