-- New Supabase projects revoke implicit Data API table grants by default.
-- The trusted service role must still reach application tables for Edge
-- Functions, administrative fixtures, and other server-side operations. It
-- bypasses RLS, so never expose this key to clients.
grant all privileges on table
  public.entries,
  public.poker_sessions,
  public.ingest_tokens,
  public.ingest_status,
  public.profiles,
  public.budgets,
  public.budget_members,
  public.shared_categories,
  public.shared_entries
to service_role;
