-- Public release v1 requires explicit manual approval for every contribution.
-- Keep the trigger function as a no-op so existing trigger wiring stays stable.

create or replace function public.enforce_community_autoapprove()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return null;
end;
$$;

comment on function public.enforce_community_autoapprove() is
  'Manual-review-only v1: submissions remain pending until a reviewer acts.';
