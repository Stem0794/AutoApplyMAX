-- Reviewer submissions must enter the same pending review queue as all other
-- contributions. Approval remains an explicit admin action in v1.

create or replace function public.enforce_community_autoapprove()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.try_auto_approve_mapping(
    new.site_key,
    new.field_signature,
    new.profile_key
  );
  return null;
end;
$$;

drop function if exists public.force_approve_mapping(text, text, text, uuid);

comment on function public.enforce_community_autoapprove() is
  'Checks community consensus after submission; reviewers must approve manually.';
