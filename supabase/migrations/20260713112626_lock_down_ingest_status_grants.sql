-- Older Supabase projects may retain broad default table grants. RLS already
-- denies client writes, but remove the table-level privilege as defense in depth.
revoke insert, update, delete, truncate, references, trigger
on public.ingest_status
from anon, authenticated;

grant select on public.ingest_status to authenticated;
