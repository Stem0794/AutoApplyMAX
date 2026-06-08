# AutoApplyMAX Supabase Backend

This directory contains the mapping registry backend only. Clients authenticate
with a normal Supabase access token and call Edge Functions; they never receive
or use the service-role key.

## Data model

- `installations` binds a client-generated installation UUID to `auth.uid()`.
- `pending_mapping_submissions` stores untrusted proposals from authenticated
  installations.
- `approved_field_mappings` stores the canonical mappings returned to clients.
- `mapping_reviewers` is the explicit reviewer allowlist.
- `mapping_review_events` records immutable approval/rejection decisions.

Submission never writes to `approved_field_mappings`. Version 1 requires a
reviewer to manually approve each pending row.

## Sensitive-field policy

Only profile keys in the migration and `_shared/validation.ts` allowlists are
accepted. Resume/internal metadata, consent/privacy, EEO/demographic,
disability, veteran, ethnicity/race, gender/sex, and salary/compensation fields
are excluded. Selectors containing those semantics are also rejected.

Mapping payloads contain only:

```json
{
  "siteKey": "jobs.example.com",
  "fieldSignature": "{\"v\":1,\"tag\":\"input\",\"type\":\"text\",\"autocomplete\":\"given-name\",\"name\":\"first_name\",\"label\":\"first name\"}",
  "profileKey": "firstName"
}
```

No profile values or answers are accepted or stored.

## Local setup

```sh
supabase start
supabase db reset
supabase functions serve
```

The functions use only the built-in `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
They forward the caller's access token to PostgREST, so database RLS remains the
authorization boundary.

Enable anonymous sign-ins in Supabase Auth for extension installations. The
database also limits each authenticated user to 500 pending submissions per
hour, including direct PostgREST attempts.

## API

Both functions require `Authorization: Bearer <user-access-token>`.

Submit one to 100 proposals:

```http
POST /functions/v1/submit-mappings
Content-Type: application/json

{
  "installationId": "c8b22106-f267-4c74-b8b4-63131f91781f",
  "mappings": [
    {
      "siteKey": "jobs.example.com",
      "fieldSignature": "{\"v\":1,\"tag\":\"input\",\"type\":\"text\",\"autocomplete\":\"given-name\",\"name\":\"first_name\",\"label\":\"first name\"}",
      "profileKey": "firstName"
    }
  ]
}
```

Successful submissions return HTTP `202` with
`status: "pending_manual_review"`. Retries of an already-pending proposal are
idempotent for the same installation.

Read approved mappings:

```http
GET /functions/v1/read-mappings?siteKey=jobs.example.com
```

Only approved mappings are returned.

## Reviewer setup and workflow

Add a trusted authenticated user as a reviewer from the SQL editor or another
administrator-only channel:

```sql
insert into public.mapping_reviewers (user_id)
values ('00000000-0000-0000-0000-000000000000');
```

Reviewers can inspect pending rows, then explicitly decide through the RPCs:

```sql
select public.approve_mapping_submission(
  '00000000-0000-0000-0000-000000000000',
  'Verified against the live application form'
);

select public.reject_mapping_submission(
  '00000000-0000-0000-0000-000000000000',
  'Selector is unstable'
);
```

The RPCs require an authenticated reviewer identity. They are intentionally not
wrapped in client-facing Edge Functions in version 1.
