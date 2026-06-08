-- User-submitted requests for brand-new profile fields the app doesn't have yet.
-- No profile values are stored — only the user-authored label/note and the
-- structural field signature of the page field that prompted the request.

create table public.field_requests (
  id bigint generated always as identity primary key,
  requested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  suggested_label text not null,
  note text,
  site_key text,
  host text,
  field_signature jsonb,
  status text not null default 'open'
    check (status in ('open', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now(),
  constraint field_req_label_len check (char_length(suggested_label) between 1 and 100),
  constraint field_req_note_len check (note is null or char_length(note) <= 500),
  constraint field_req_site_len check (site_key is null or char_length(site_key) <= 253),
  constraint field_req_host_len check (host is null or char_length(host) <= 253)
);

create index field_requests_created_idx on public.field_requests (created_at desc);
create index field_requests_status_idx on public.field_requests (status);

alter table public.field_requests enable row level security;

create policy "Users can submit field requests"
on public.field_requests
for insert
to authenticated
with check (requested_by = auth.uid());

create policy "Users and reviewers can read field requests"
on public.field_requests
for select
to authenticated
using (requested_by = auth.uid() or public.is_mapping_reviewer(auth.uid()));

revoke all on table public.field_requests from anon, authenticated;
grant insert (suggested_label, note, site_key, host, field_signature)
  on table public.field_requests to authenticated;
grant select on table public.field_requests to authenticated;

comment on table public.field_requests is
  'User requests for new profile fields. Contains user-authored labels/notes and structural field signatures only — never profile values.';
