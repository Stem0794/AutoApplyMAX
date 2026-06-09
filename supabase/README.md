# AutoApplyMAX — Supabase Backend

Everything the community backend needs, so it can be **recreated from scratch** if the
Supabase project is ever deleted. The extension uses this project for:

- **Profile cloud sync** (`profiles` table) — email/password login
- **Community field mappings** (submit → review/consensus → approved → served to clients)
- **Adapter drift telemetry** (`adapter_drift_signals`)
- **New-field requests** (`field_requests`)

> **Security:** the extension only ever uses the **publishable (anon) key** and the
> project URL. The **service-role key must never** be embedded in the extension or
> committed — it bypasses RLS. Clients forward their own access token to PostgREST, so
> database RLS stays the authorization boundary. Mapping payloads carry **structural
> field signatures only** (tag/type/autocomplete/name/label) — never profile values.

---

## 1. Project facts (current)

| Item | Value |
|------|-------|
| Project name | AutoApplyMAX |
| Region | `eu-west-1` |
| Project ref | `arsfogdvglyiwqiujnof` |
| API URL | `https://arsfogdvglyiwqiujnof.supabase.co` |
| Publishable key | `sb_publishable_gzQYp8xDiox-yyusd67EEQ_MN5D8y3M` |

These two client values are hard-coded as fallbacks in
[`src/shared/constants.js`](../src/shared/constants.js) (`COMMUNITY_API_URL`,
`COMMUNITY_PUBLISHABLE_KEY`). **If you recreate the project, update them there** (or via
the `AAM_COMMUNITY_API_URL` / `AAM_COMMUNITY_PUBLISHABLE_KEY` build vars).

---

## 2. Recreate from scratch

1. **Create the project** (dashboard or `mcp__Supabase__create_project`), region `eu-west-1`.
2. **Apply migrations in order** (§3): `supabase db push`, or paste each file into the
   SQL editor in filename order, or `mcp__Supabase__apply_migration` one at a time.
3. **Deploy the edge functions** (§4).
4. **Grant yourself reviewer/admin access** (§5).
5. **Update the URL + publishable key** in `src/shared/constants.js` (§1).
6. Rebuild / reload the extension.

Enable **Email** auth (email/password) in Authentication → Providers, and **anonymous
sign-ins** (used for community submission + drift/field-request telemetry). Real users
are created manually in the dashboard (Authentication → Users) — there is no self-signup
flow in the extension.

---

## 3. Migrations (apply in this order)

| # | File | What it creates |
|---|------|-----------------|
| 0001 | `202606080001_mapping_registry.sql` | Core registry: `mapping_reviewers`, `installations`, `pending_mapping_submissions`, `approved_field_mappings`, `mapping_review_events`; validation functions (`is_mapping_reviewer`, `is_allowed_mapping_profile_key`, `field_signature_contains_restricted_semantics`, `is_valid_field_signature`); the `submit_mapping_submissions`, `approve_mapping_submission`, `reject_mapping_submission` RPCs; 500/hour rate limit; **all RLS policies and grants**. |
| 0002 | `202606080002_add_profiles_table.sql` | `profiles` table (cloud profile sync) + owner-only RLS. |
| 0003 | `202606080003_community_autoapprove_and_drift.sql` | Auto-approval after **N=3** independent agreements (`try_auto_approve_mapping` + `pending_mapping_community_autoapprove` trigger); `adapter_drift_signals` table; adds `approval_method` / `community_submitter_count`. |
| 0005 | `202606080005_reviewer_force_approve.sql` | Historical reviewer auto-approval behavior, superseded by migration 0008. |
| 0006 | `202606080006_field_requests.sql` | `field_requests` table + RLS (insert own, read own/reviewer). |
| 0007 | `202606080007_admin_review_and_sensitive_fields.sql` | Widens `is_allowed_mapping_profile_key` to include sensitive keys and narrows `field_signature_contains_restricted_semantics` to only résumé/CV; adds the reviewer RPC `set_field_request_status` for the options-page Admin tab. |
| 0008 | `202606090001_require_manual_mapping_review.sql` | Removes reviewer auto-approval so reviewer submissions enter the pending queue for explicit review. |
| 0009 | `202606090002_disable_community_autoapproval.sql` | Disables N=3 auto-approval for the manual-review-only v1 release. |

> There is no `0004` — the number was skipped during development. Order is by filename;
> the gap is harmless.

### Tables

- **`mapping_reviewers`** — admin allowlist; a user here is a "reviewer".
- **`installations`** — per-user client installation ids (FK target for submissions).
- **`pending_mapping_submissions`** — untrusted proposals; need review or N=3 consensus.
- **`approved_field_mappings`** — canonical mappings; readable by any authenticated
  client, writable only via the approve/force-approve RPCs.
- **`mapping_review_events`** — immutable audit log of approve/reject decisions.
- **`profiles`** — JSON profile blob per user (no résumé bytes).
- **`adapter_drift_signals`** — structural signals when a known adapter matches nothing.
- **`field_requests`** — user requests for new profile fields.

---

## 4. Edge functions

In [`supabase/functions/`](./functions). Deploy with `supabase functions deploy <name>`
or `mcp__Supabase__deploy_edge_function`.

| Function | Purpose |
|----------|---------|
| `submit-mappings` | Validates a batch, then calls the `submit_mapping_submissions` RPC. The extension posts here, not directly to the table. Returns `202` with `status: "pending_manual_review"`. |
| `read-mappings` | Serves approved mappings for a `?siteKey=` to clients. |

Shared code in `functions/_shared/`: `auth.ts` (bearer-token user check),
`validation.ts` (mirrors DB validation), `http.ts`.

**Secrets** are provided automatically by the platform: `SUPABASE_URL`,
`SUPABASE_ANON_KEY`. The functions never use the service-role key; they forward the
caller's access token to PostgREST so RLS remains the boundary.

> ⚠️ `validation.ts` (`ALLOWED_PROFILE_KEYS`, `RESTRICTED_SIGNATURE_PATTERN`) and the DB
> functions `is_allowed_mapping_profile_key` / `field_signature_contains_restricted_semantics`
> **must agree**. They were aligned in migration 0007 — change one, change both.

### API

Both functions require `Authorization: Bearer <user-access-token>`.

```http
POST /functions/v1/submit-mappings
{
  "installationId": "c8b22106-f267-4c74-b8b4-63131f91781f",
  "mappings": [
    { "siteKey": "jobs.example.com",
      "fieldSignature": "{\"v\":1,\"tag\":\"input\",\"type\":\"text\",\"autocomplete\":\"given-name\",\"name\":\"first_name\",\"label\":\"first name\"}",
      "profileKey": "firstName" }
  ]
}

GET /functions/v1/read-mappings?siteKey=jobs.example.com
```

---

## 5. Sensitive-field policy

Mappings (selector *structure*, never values) are accepted for all standard fields
**and** the sensitive set: `coverLetter`, `salaryExpectation`, `gender`, `ethnicity`,
`veteranStatus`, `disabilityStatus`, `privacyPolicyConsent`. Only **résumé/CV file
uploads** are rejected (signature semantics matching `resume|curriculum|cv`), since a
file-upload selector carries no useful community data.

This is enforced in two places that must stay in sync: `is_allowed_mapping_profile_key`
+ `field_signature_contains_restricted_semantics` (DB) and `validation.ts` (edge).

---

## 6. Reviewer / admin access

Reviewers approve mappings and triage field requests — including from the extension's
**Admin** tab. Add a user by their auth UID:

```sql
insert into public.mapping_reviewers (user_id)
values ('<auth-user-uuid>')
on conflict do nothing;
```

Find the UID in Authentication → Users. Once added, the **Admin** tab appears in the
options page after that user signs in. Reviewers can also approve/reject directly:

```sql
select public.approve_mapping_submission('<submission-uuid>', 'Verified on the live form');
select public.reject_mapping_submission('<submission-uuid>', 'Selector is unstable');
select public.set_field_request_status(<request-id>, 'planned');
```

---

## 7. How the pipeline works

```
user maps a field (⚡ zap)               reviewer (you)
        │                                      │
        ▼                                      ▼
submit-mappings ──► pending_mapping_submissions
        │                    │
        │                    │
        │                    ▼
        │             reviewer approves
        │             → approve_mapping_submission
        │                    │
        └──► approved_field_mappings ◄───┘
                     │
                     ▼
             read-mappings ──► served to all clients
```

- **Drift**: when a known adapter's selectors match nothing, the client posts a
  structural signal to `adapter_drift_signals`. Run
  [`scripts/suggest-adapter-fixes.mjs`](../scripts/suggest-adapter-fixes.mjs) to turn
  accumulated approved mappings into adapter selector suggestions.
- **Field requests**: live in `field_requests`. Promote a popular one into a real
  `PROFILE_FIELDS` entry from the Admin tab — it generates a ready-to-paste field
  definition and marks the request `planned`.

The database limits each authenticated user to **500 pending submissions per hour**,
including direct PostgREST attempts.
