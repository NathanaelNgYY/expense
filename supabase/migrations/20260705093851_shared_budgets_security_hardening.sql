-- Harden shared-budget helper functions after advisor review.
create or replace function public.generate_invite_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random()*31)+1)::int, 1), '')
  from generate_series(1, 6)
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_budget() from public, anon, authenticated;
revoke execute on function public.join_budget(text) from public, anon;
revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.join_budget(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
