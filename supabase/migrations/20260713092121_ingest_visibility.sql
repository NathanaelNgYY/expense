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

-- Keep status in sync for future token mints, before any transaction has been
-- captured. This is an invoker function with an empty search_path; only the
-- service role may execute it and clients still cannot write ingest_status.
create function public.sync_ingest_status_on_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.ingest_status (user_id, token_label, updated_at)
  values (new.user_id, new.label, now())
  on conflict (user_id) do update set
    token_label = excluded.token_label,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke execute on function public.sync_ingest_status_on_token() from public, anon, authenticated;
grant execute on function public.sync_ingest_status_on_token() to service_role;

create trigger ingest_token_status_created
after insert or update of label, user_id on public.ingest_tokens
for each row execute function public.sync_ingest_status_on_token();

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
