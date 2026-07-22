-- S1 ingest-token rotation: give tokens a grace-window expiry.
-- Nullable on purpose — existing tokens (expires_at is null) stay active forever. Rotation
-- (the rotate-ingest-token Edge Function) sets this to now()+grace on the superseded token so
-- in-flight captures don't drop while the user updates their iOS Shortcut. The ingest Edge
-- Function rejects a token once its expires_at is at or before now().
alter table public.ingest_tokens add column expires_at timestamptz;
