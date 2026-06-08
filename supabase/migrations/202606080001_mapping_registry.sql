begin;

create extension if not exists pgcrypto with schema extensions;

create type public.mapping_review_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.mapping_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.installations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_installation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (owner_user_id, client_installation_id)
);

create table public.pending_mapping_submissions (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  site_key text not null,
  field_signature text not null,
  profile_key text not null,
  review_status public.mapping_review_status not null default 'pending',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_mapping_review_note_length
    check (review_note is null or char_length(review_note) <= 2000),
  constraint pending_mapping_site_key_length check (char_length(site_key) between 1 and 253),
  constraint pending_mapping_field_signature_length check (char_length(field_signature) between 1 and 1000),
  constraint pending_mapping_profile_key_length check (char_length(profile_key) between 1 and 64),
  constraint pending_mapping_review_state check (
    (review_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (review_status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index pending_mapping_one_open_submission
  on public.pending_mapping_submissions (installation_id, site_key, field_signature, profile_key)
  where review_status = 'pending';

create index pending_mapping_owner_created_idx
  on public.pending_mapping_submissions (submitted_by, created_at desc);

create index pending_mapping_review_queue_idx
  on public.pending_mapping_submissions (created_at)
  where review_status = 'pending';

create index pending_mapping_site_field_signature_idx
  on public.pending_mapping_submissions (site_key, field_signature);

create table public.approved_field_mappings (
  id uuid primary key default gen_random_uuid(),
  site_key text not null,
  field_signature text not null,
  profile_key text not null,
  source_submission_id uuid not null unique
    references public.pending_mapping_submissions(id) on delete restrict,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_mapping_site_key_length check (char_length(site_key) between 1 and 253),
  constraint approved_mapping_field_signature_length check (char_length(field_signature) between 1 and 1000),
  constraint approved_mapping_profile_key_length check (char_length(profile_key) between 1 and 64),
  unique (site_key, field_signature)
);

create index approved_mapping_site_idx
  on public.approved_field_mappings (site_key);

create table public.mapping_review_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.pending_mapping_submissions(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision public.mapping_review_status not null,
  review_note text,
  created_at timestamptz not null default now(),
  constraint mapping_review_event_note_length
    check (review_note is null or char_length(review_note) <= 2000),
  constraint mapping_review_event_decision check (decision in ('approved', 'rejected'))
);

create index mapping_review_events_submission_idx
  on public.mapping_review_events (submission_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger installations_set_updated_at
before update on public.installations
for each row execute function public.set_updated_at();

create trigger pending_mapping_submissions_set_updated_at
before update on public.pending_mapping_submissions
for each row execute function public.set_updated_at();

create trigger approved_field_mappings_set_updated_at
before update on public.approved_field_mappings
for each row execute function public.set_updated_at();

create function public.is_mapping_reviewer(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mapping_reviewers
    where user_id = p_user_id
  );
$$;

create function public.is_allowed_mapping_profile_key(p_profile_key text)
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
    'howDidYouHear'
  ]::text[]);
$$;

create function public.field_signature_contains_restricted_semantics(p_field_signature text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_field_signature) ~
    '(^|[^a-z0-9])(resume|curriculum|cv|salary|compensation|wage|pay|privacy|consent|eeo|demographic|race|racial|ethnicity|ethnic|gender|sex|disability|disabled|veteran|military)([^a-z0-9]|$)';
$$;

create function public.is_valid_field_signature(p_field_signature text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_signature jsonb;
begin
  v_signature := p_field_signature::jsonb;
  return jsonb_typeof(v_signature) = 'object'
    and (select count(*) from jsonb_object_keys(v_signature)) = 6
    and v_signature ?& array['v', 'tag', 'type', 'autocomplete', 'name', 'label']
    and v_signature ->> 'v' = '1'
    and v_signature ->> 'tag' in ('input', 'select', 'textarea')
    and char_length(v_signature ->> 'type') <= 120
    and char_length(v_signature ->> 'autocomplete') <= 120
    and char_length(v_signature ->> 'name') <= 120
    and char_length(v_signature ->> 'label') <= 120;
exception
  when others then
    return false;
end;
$$;

alter table public.pending_mapping_submissions
  add constraint pending_mapping_allowed_profile_key
    check (public.is_allowed_mapping_profile_key(profile_key)),
  add constraint pending_mapping_non_sensitive_field_signature
    check (not public.field_signature_contains_restricted_semantics(field_signature)),
  add constraint pending_mapping_valid_field_signature
    check (public.is_valid_field_signature(field_signature)),
  add constraint pending_mapping_normalized_site_key
    check (
      site_key = lower(btrim(site_key))
      and site_key ~ '^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$'
      and site_key !~ '\.\.'
    ),
  add constraint pending_mapping_trimmed_field_signature
    check (field_signature = btrim(field_signature) and field_signature !~ '[[:cntrl:]]');

alter table public.approved_field_mappings
  add constraint approved_mapping_allowed_profile_key
    check (public.is_allowed_mapping_profile_key(profile_key)),
  add constraint approved_mapping_non_sensitive_field_signature
    check (not public.field_signature_contains_restricted_semantics(field_signature)),
  add constraint approved_mapping_valid_field_signature
    check (public.is_valid_field_signature(field_signature)),
  add constraint approved_mapping_normalized_site_key
    check (
      site_key = lower(btrim(site_key))
      and site_key ~ '^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$'
      and site_key !~ '\.\.'
    ),
  add constraint approved_mapping_trimmed_field_signature
    check (field_signature = btrim(field_signature) and field_signature !~ '[[:cntrl:]]');

create function public.submit_mapping_submissions(
  p_installation_id uuid,
  p_mappings jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_installation_id uuid;
  v_mapping jsonb;
  v_site_key text;
  v_field_signature text;
  v_profile_key text;
  v_submitted_count integer := 0;
  v_inserted_count integer := 0;
  v_row_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_installation_id is null then
    raise exception 'installationId is required' using errcode = '22023';
  end if;

  if p_mappings is null
     or jsonb_typeof(p_mappings) <> 'array'
     or jsonb_array_length(p_mappings) < 1
     or jsonb_array_length(p_mappings) > 100 then
    raise exception 'mappings must contain between 1 and 100 items' using errcode = '22023';
  end if;

  insert into public.installations (
    owner_user_id,
    client_installation_id,
    last_seen_at
  )
  values (
    v_user_id,
    p_installation_id,
    now()
  )
  on conflict (owner_user_id, client_installation_id)
  do update set last_seen_at = excluded.last_seen_at
  returning id into v_installation_id;

  for v_mapping in select value from jsonb_array_elements(p_mappings)
  loop
    if jsonb_typeof(v_mapping) <> 'object'
       or not (v_mapping ? 'siteKey')
       or not (v_mapping ? 'fieldSignature')
       or not (v_mapping ? 'profileKey')
       or (select count(*) from jsonb_object_keys(v_mapping)) <> 3 then
      raise exception 'Each mapping must contain only siteKey, fieldSignature, and profileKey'
        using errcode = '22023';
    end if;

    v_site_key := lower(btrim(v_mapping ->> 'siteKey'));
    v_field_signature := btrim(v_mapping ->> 'fieldSignature');
    v_profile_key := btrim(v_mapping ->> 'profileKey');

    if v_site_key is null
       or char_length(v_site_key) not between 1 and 253
       or v_site_key !~ '^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$'
       or v_site_key ~ '\.\.' then
      raise exception 'Invalid siteKey' using errcode = '22023';
    end if;

    if v_field_signature is null
       or char_length(v_field_signature) not between 1 and 1000
       or v_field_signature ~ '[[:cntrl:]]'
       or public.field_signature_contains_restricted_semantics(v_field_signature) then
      raise exception 'Invalid or restricted field_signature' using errcode = '22023';
    end if;

    if v_profile_key is null
       or not public.is_allowed_mapping_profile_key(v_profile_key) then
      raise exception 'profileKey is not allowed' using errcode = '22023';
    end if;

    v_submitted_count := v_submitted_count + 1;

    insert into public.pending_mapping_submissions (
      installation_id,
      submitted_by,
      site_key,
      field_signature,
      profile_key
    )
    values (
      v_installation_id,
      v_user_id,
      v_site_key,
      v_field_signature,
      v_profile_key
    )
    on conflict (installation_id, site_key, field_signature, profile_key)
      where review_status = 'pending'
    do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted_count := v_inserted_count + v_row_count;
  end loop;

  return jsonb_build_object(
    'submitted', v_submitted_count,
    'created', v_inserted_count,
    'duplicates', v_submitted_count - v_inserted_count,
    'status', 'pending_manual_review'
  );
end;
$$;

create function public.enforce_mapping_submission_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_recent_count integer;
begin
  select count(*)
  into v_recent_count
  from public.pending_mapping_submissions
  where submitted_by = new.submitted_by
    and created_at >= now() - interval '1 hour';

  if v_recent_count >= 500 then
    raise exception 'Mapping submission rate limit exceeded' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger pending_mapping_submission_rate_limit
before insert on public.pending_mapping_submissions
for each row execute function public.enforce_mapping_submission_rate_limit();

create function public.approve_mapping_submission(
  p_submission_id uuid,
  p_review_note text default null
)
returns public.approved_field_mappings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_submission public.pending_mapping_submissions;
  v_existing public.approved_field_mappings;
  v_approved public.approved_field_mappings;
begin
  if v_reviewer_id is null or not public.is_mapping_reviewer(v_reviewer_id) then
    raise exception 'Mapping reviewer access required' using errcode = '42501';
  end if;

  select *
  into v_submission
  from public.pending_mapping_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if v_submission.review_status <> 'pending' then
    raise exception 'Submission has already been reviewed' using errcode = '23514';
  end if;

  select *
  into v_existing
  from public.approved_field_mappings
  where site_key = v_submission.site_key
    and field_signature = v_submission.field_signature;

  if found and v_existing.profile_key <> v_submission.profile_key then
    raise exception 'An approved mapping already exists for this site and field_signature'
      using errcode = '23505';
  end if;

  if found then
    v_approved := v_existing;
  else
    insert into public.approved_field_mappings (
      site_key,
      field_signature,
      profile_key,
      source_submission_id,
      approved_by
    )
    values (
      v_submission.site_key,
      v_submission.field_signature,
      v_submission.profile_key,
      v_submission.id,
      v_reviewer_id
    )
    returning * into v_approved;
  end if;

  update public.pending_mapping_submissions
  set review_status = 'approved',
      review_note = nullif(btrim(p_review_note), ''),
      reviewed_by = v_reviewer_id,
      reviewed_at = now()
  where id = v_submission.id;

  insert into public.mapping_review_events (
    submission_id,
    reviewer_id,
    decision,
    review_note
  )
  values (
    v_submission.id,
    v_reviewer_id,
    'approved',
    nullif(btrim(p_review_note), '')
  );

  return v_approved;
end;
$$;

create function public.reject_mapping_submission(
  p_submission_id uuid,
  p_review_note text
)
returns public.pending_mapping_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewer_id uuid := auth.uid();
  v_submission public.pending_mapping_submissions;
begin
  if v_reviewer_id is null or not public.is_mapping_reviewer(v_reviewer_id) then
    raise exception 'Mapping reviewer access required' using errcode = '42501';
  end if;

  if nullif(btrim(p_review_note), '') is null then
    raise exception 'A rejection note is required' using errcode = '22023';
  end if;

  select *
  into v_submission
  from public.pending_mapping_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if v_submission.review_status <> 'pending' then
    raise exception 'Submission has already been reviewed' using errcode = '23514';
  end if;

  update public.pending_mapping_submissions
  set review_status = 'rejected',
      review_note = btrim(p_review_note),
      reviewed_by = v_reviewer_id,
      reviewed_at = now()
  where id = v_submission.id
  returning * into v_submission;

  insert into public.mapping_review_events (
    submission_id,
    reviewer_id,
    decision,
    review_note
  )
  values (
    v_submission.id,
    v_reviewer_id,
    'rejected',
    v_submission.review_note
  );

  return v_submission;
end;
$$;

alter table public.mapping_reviewers enable row level security;
alter table public.installations enable row level security;
alter table public.pending_mapping_submissions enable row level security;
alter table public.approved_field_mappings enable row level security;
alter table public.mapping_review_events enable row level security;

create policy "Reviewers can read reviewer membership"
on public.mapping_reviewers
for select
to authenticated
using (public.is_mapping_reviewer(auth.uid()));

create policy "Users can read their installations"
on public.installations
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "Users can create their installations"
on public.installations
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "Users can update their installations"
on public.installations
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "Submitters and reviewers can read submissions"
on public.pending_mapping_submissions
for select
to authenticated
using (
  submitted_by = auth.uid()
  or public.is_mapping_reviewer(auth.uid())
);

create policy "Users can create their submissions"
on public.pending_mapping_submissions
for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and review_status = 'pending'
  and review_note is null
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.installations
    where installations.id = installation_id
      and installations.owner_user_id = auth.uid()
  )
);

create policy "Authenticated users can read approved mappings"
on public.approved_field_mappings
for select
to authenticated
using (true);

create policy "Reviewers can read review events"
on public.mapping_review_events
for select
to authenticated
using (public.is_mapping_reviewer(auth.uid()));

revoke all on table public.mapping_reviewers from anon, authenticated;
revoke all on table public.installations from anon, authenticated;
revoke all on table public.pending_mapping_submissions from anon, authenticated;
revoke all on table public.approved_field_mappings from anon, authenticated;
revoke all on table public.mapping_review_events from anon, authenticated;

grant select on table public.mapping_reviewers to authenticated;
grant select, insert on table public.installations to authenticated;
grant update (last_seen_at) on table public.installations to authenticated;
grant select, insert on table public.pending_mapping_submissions to authenticated;
grant select on table public.approved_field_mappings to authenticated;
grant select on table public.mapping_review_events to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_mapping_reviewer(uuid) from public, anon;
revoke all on function public.is_allowed_mapping_profile_key(text) from public, anon;
revoke all on function public.field_signature_contains_restricted_semantics(text) from public, anon;
revoke all on function public.is_valid_field_signature(text) from public, anon;
revoke all on function public.enforce_mapping_submission_rate_limit() from public, anon, authenticated;
revoke all on function public.submit_mapping_submissions(uuid, jsonb) from public, anon;
revoke all on function public.approve_mapping_submission(uuid, text) from public, anon;
revoke all on function public.reject_mapping_submission(uuid, text) from public, anon;

grant execute on function public.is_mapping_reviewer(uuid) to authenticated;
grant execute on function public.is_allowed_mapping_profile_key(text) to authenticated;
grant execute on function public.field_signature_contains_restricted_semantics(text) to authenticated;
grant execute on function public.is_valid_field_signature(text) to authenticated;
grant execute on function public.submit_mapping_submissions(uuid, jsonb) to authenticated;
grant execute on function public.approve_mapping_submission(uuid, text) to authenticated;
grant execute on function public.reject_mapping_submission(uuid, text) to authenticated;

comment on table public.pending_mapping_submissions is
  'Untrusted mapping proposals. Every row requires an explicit reviewer decision.';
comment on table public.approved_field_mappings is
  'Canonical mappings readable by authenticated clients. Clients cannot write this table.';
comment on function public.submit_mapping_submissions(uuid, jsonb) is
  'Creates pending-only mapping proposals for the caller-owned installation.';
comment on function public.approve_mapping_submission(uuid, text) is
  'Reviewer-only manual promotion of one pending proposal into the canonical mapping table.';

commit;
