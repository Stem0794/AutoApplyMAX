-- Community auto-approval (after N independent agreements) + adapter drift signals.

-- ── Schema changes to support non-reviewer (community) approvals ──

alter table public.approved_field_mappings
  alter column approved_by drop not null,
  add column approval_method text not null default 'manual'
    check (approval_method in ('manual', 'community')),
  add column community_submitter_count integer;

alter table public.pending_mapping_submissions
  add column review_method text not null default 'manual'
    check (review_method in ('manual', 'community'));

-- Allow community approvals to have a null reviewer while keeping the
-- invariant that a reviewed row always has a reviewed_at timestamp.
alter table public.pending_mapping_submissions
  drop constraint pending_mapping_review_state;

alter table public.pending_mapping_submissions
  add constraint pending_mapping_review_state check (
    (review_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (review_status in ('approved', 'rejected')
      and reviewed_at is not null
      and (reviewed_by is not null or review_method = 'community'))
  );

alter table public.mapping_review_events
  alter column reviewer_id drop not null,
  add column method text not null default 'manual'
    check (method in ('manual', 'community'));

-- ── Auto-approval ──

create function public.community_autoapprove_threshold()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

create function public.try_auto_approve_mapping(
  p_site_key text,
  p_field_signature text,
  p_profile_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_distinct integer;
  v_submission public.pending_mapping_submissions;
  v_approved_id uuid;
begin
  -- Never override an existing approved mapping for this site + field.
  if exists (
    select 1 from public.approved_field_mappings
    where site_key = p_site_key and field_signature = p_field_signature
  ) then
    return;
  end if;

  select count(distinct submitted_by)
  into v_distinct
  from public.pending_mapping_submissions
  where site_key = p_site_key
    and field_signature = p_field_signature
    and profile_key = p_profile_key
    and review_status = 'pending';

  if v_distinct < public.community_autoapprove_threshold() then
    return;
  end if;

  select *
  into v_submission
  from public.pending_mapping_submissions
  where site_key = p_site_key
    and field_signature = p_field_signature
    and profile_key = p_profile_key
    and review_status = 'pending'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  insert into public.approved_field_mappings (
    site_key, field_signature, profile_key, source_submission_id,
    approved_by, approval_method, community_submitter_count
  )
  values (
    v_submission.site_key, v_submission.field_signature, v_submission.profile_key,
    v_submission.id, null, 'community', v_distinct
  )
  on conflict (site_key, field_signature) do nothing
  returning id into v_approved_id;

  -- Another path approved it first; leave the queue untouched.
  if v_approved_id is null then
    return;
  end if;

  update public.pending_mapping_submissions
  set review_status = 'approved',
      review_method = 'community',
      review_note = 'Auto-approved by community consensus',
      reviewed_by = null,
      reviewed_at = now()
  where site_key = p_site_key
    and field_signature = p_field_signature
    and profile_key = p_profile_key
    and review_status = 'pending';

  insert into public.mapping_review_events (
    submission_id, reviewer_id, decision, review_note, method
  )
  values (
    v_submission.id, null, 'approved', 'Auto-approved by community consensus', 'community'
  );
end;
$$;

create function public.enforce_community_autoapprove()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.try_auto_approve_mapping(new.site_key, new.field_signature, new.profile_key);
  return null;
end;
$$;

create trigger pending_mapping_community_autoapprove
after insert on public.pending_mapping_submissions
for each row execute function public.enforce_community_autoapprove();

revoke all on function public.community_autoapprove_threshold() from public, anon, authenticated;
revoke all on function public.try_auto_approve_mapping(text, text, text) from public, anon, authenticated;
revoke all on function public.enforce_community_autoapprove() from public, anon, authenticated;

-- ── Adapter drift signals (maintainer telemetry) ──

create table public.adapter_drift_signals (
  id bigint generated always as identity primary key,
  reported_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  adapter_name text not null,
  site_key text not null,
  host text not null,
  missing_profile_keys text[] not null default '{}',
  field_signatures jsonb not null default '[]',
  created_at timestamptz not null default now(),
  constraint adapter_drift_adapter_len check (char_length(adapter_name) between 1 and 64),
  constraint adapter_drift_site_len check (char_length(site_key) between 1 and 253),
  constraint adapter_drift_host_len check (char_length(host) between 1 and 253)
);

create index adapter_drift_adapter_idx
  on public.adapter_drift_signals (adapter_name, created_at desc);
create index adapter_drift_site_idx
  on public.adapter_drift_signals (site_key);

alter table public.adapter_drift_signals enable row level security;

create policy "Users can report adapter drift"
on public.adapter_drift_signals
for insert
to authenticated
with check (reported_by = auth.uid());

create policy "Reviewers can read adapter drift"
on public.adapter_drift_signals
for select
to authenticated
using (public.is_mapping_reviewer(auth.uid()));

revoke all on table public.adapter_drift_signals from anon, authenticated;
grant insert (adapter_name, site_key, host, missing_profile_keys, field_signatures)
  on table public.adapter_drift_signals to authenticated;
grant select on table public.adapter_drift_signals to authenticated;

comment on table public.adapter_drift_signals is
  'Anonymous structural signals reported when a known adapter matches none of its fields. No profile values, only field signatures.';
