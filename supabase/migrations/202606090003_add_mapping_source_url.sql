alter table public.pending_mapping_submissions
  add column source_url text;

alter table public.pending_mapping_submissions
  add constraint pending_mapping_source_url_length
    check (source_url is null or char_length(source_url) between 1 and 2048),
  add constraint pending_mapping_source_url_https
    check (source_url is null or source_url ~ '^https://');

create or replace function public.submit_mapping_submissions(
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
  v_source_url text;
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
       or (select count(*) from jsonb_object_keys(v_mapping)) not in (3, 4)
       or (
         (select count(*) from jsonb_object_keys(v_mapping)) = 4
         and not (v_mapping ? 'sourceUrl')
       ) then
      raise exception
        'Each mapping must contain only siteKey, fieldSignature, profileKey, and sourceUrl'
        using errcode = '22023';
    end if;

    v_site_key := lower(btrim(v_mapping ->> 'siteKey'));
    v_field_signature := btrim(v_mapping ->> 'fieldSignature');
    v_profile_key := btrim(v_mapping ->> 'profileKey');
    v_source_url := nullif(btrim(v_mapping ->> 'sourceUrl'), '');

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

    if v_source_url is not null
       and (char_length(v_source_url) > 2048 or v_source_url !~ '^https://') then
      raise exception 'Invalid sourceUrl' using errcode = '22023';
    end if;

    v_submitted_count := v_submitted_count + 1;

    insert into public.pending_mapping_submissions (
      installation_id,
      submitted_by,
      site_key,
      field_signature,
      profile_key,
      source_url
    )
    values (
      v_installation_id,
      v_user_id,
      v_site_key,
      v_field_signature,
      v_profile_key,
      v_source_url
    )
    on conflict (installation_id, site_key, field_signature, profile_key)
      where review_status = 'pending'
    do update set
      source_url = excluded.source_url,
      updated_at = now();

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

comment on column public.pending_mapping_submissions.source_url is
  'Validated HTTPS page URL where the field mapping was submitted, for reviewer verification.';
