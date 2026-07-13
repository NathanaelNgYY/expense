-- Unauthenticated requests have no ingest_status policy and do not need the
-- table-level privilege retained by older project defaults.
revoke all privileges on public.ingest_status from anon;
