-- Reviewer force-approval: when a reviewer submits a mapping it is
-- approved immediately without waiting for N community agreements.

-- ── force_approve_mapping ────────────────────────────────────────────────────

create function public.force_approve_mapping(
  p_site_key       text,
  p_field_signature text,
  p_profile_key    text,
  p_reviewer_id    uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub_id uuid;
begin
  -- Link to the oldest pending submission if one exists
  select id into v_sub_id
  from public.pending_mapping_submissions
  where site_key        = p_site_key
    and field_signature = p_field_signature
    and profile_key     = p_profile_key
    and review_status   = 'pending'
  order by created_at asc
  limit 1;

  -- Upsert into approved_field_mappings, overriding any existing entry
  insert into public.approved_field_mappings (
    site_key, field_signature, profile_key,
    source_submission_id, approved_by, approval_method, community_submitter_count
  ) values (
    p_site_key, p_field_signature, p_profile_key,
    v_sub_id, p_reviewer_id, 'manual', 0
  )
  on conflict (site_key, field_signature) do update
    set profile_key    = excluded.profile_key,
        approved_by    = p_reviewer_id,
        approval_method = 'manual',
        approved_at    = now();

  -- Close all pending submissions for this mapping
  update public.pending_mapping_submissions
  set review_status = 'approved',
      review_method = 'manual',
      review_note   = 'Force-approved by reviewer',
      reviewed_by   = p_reviewer_id,
      reviewed_at   = now()
  where site_key        = p_site_key
    and field_signature = p_field_signature
    and profile_key     = p_profile_key
    and review_status   = 'pending';

  -- Log one review event for the canonical submission
  if v_sub_id is not null then
    insert into public.mapping_review_events (
      submission_id, reviewer_id, decision, review_note, method
    ) values (
      v_sub_id, p_reviewer_id, 'approved', 'Force-approved by reviewer', 'manual'
    );
  end if;
end;
$$;

revoke all on function public.force_approve_mapping(text, text, text, uuid)
  from public, anon, authenticated;

comment on function public.force_approve_mapping is
  'Immediately approve a field mapping on behalf of a reviewer. '
  'Called by the community trigger when the submitter has reviewer privileges.';

-- ── Update trigger to bypass threshold for reviewers ─────────────────────────

create or replace function public.enforce_community_autoapprove()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_mapping_reviewer(auth.uid()) then
    -- Reviewer submission → force-approve immediately
    perform public.force_approve_mapping(
      new.site_key, new.field_signature, new.profile_key, auth.uid()
    );
  else
    -- Regular user → check community consensus threshold
    perform public.try_auto_approve_mapping(
      new.site_key, new.field_signature, new.profile_key
    );
  end if;
  return null;
end;
$$;
