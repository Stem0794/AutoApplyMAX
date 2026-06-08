-- 1) Align DB validation with the client/edge-function rules: sensitive field
--    *signatures* (selector structure, never values) are now shareable. Only
--    the résumé file-upload field stays restricted.
-- 2) Add a reviewer RPC to triage field requests from the options-page admin UI.

-- ── Allowed community profile keys (now includes sensitive keys) ──────────────

create or replace function public.is_allowed_mapping_profile_key(p_profile_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_profile_key = any (array[
    'salutation',
    'firstName',
    'lastName',
    'fullName',
    'email',
    'phoneCountryCode',
    'phone',
    'address',
    'city',
    'state',
    'zip',
    'country',
    'linkedinUrl',
    'githubUrl',
    'portfolioUrl',
    'currentTitle',
    'currentCompany',
    'yearsExperience',
    'education',
    'preferredLocations',
    'skills',
    'englishLevel',
    'startDate',
    'workAuthorization',
    'sponsorshipRequirement',
    'howDidYouHear',
    -- Sensitive fields: the selector structure is useful community data.
    -- Profile *values* are never transmitted, only field signatures.
    'coverLetter',
    'salaryExpectation',
    'gender',
    'ethnicity',
    'veteranStatus',
    'disabilityStatus',
    'privacyPolicyConsent'
  ]::text[]);
$$;

-- ── Restricted signature semantics (now only résumé / CV file uploads) ────────

create or replace function public.field_signature_contains_restricted_semantics(p_field_signature text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_field_signature) ~
    '(^|[^a-z0-9])(resume|curriculum|cv)([^a-z0-9]|$)';
$$;

-- ── Reviewer RPC: triage a field request ─────────────────────────────────────

create function public.set_field_request_status(p_id bigint, p_status text)
returns public.field_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewer uuid := auth.uid();
  v_row public.field_requests;
begin
  if v_reviewer is null or not public.is_mapping_reviewer(v_reviewer) then
    raise exception 'Mapping reviewer access required' using errcode = '42501';
  end if;

  if p_status not in ('open', 'planned', 'done', 'declined') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  update public.field_requests
  set status = p_status
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Field request not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_field_request_status(bigint, text) from public, anon;
grant execute on function public.set_field_request_status(bigint, text) to authenticated;

comment on function public.set_field_request_status(bigint, text) is
  'Reviewer-only: update the triage status of a user-submitted field request.';
