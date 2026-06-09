-- Allow a submitter to attach or refresh only the source URL metadata on their
-- own still-pending contribution. Other submission fields remain immutable.

grant update (source_url, updated_at)
  on table public.pending_mapping_submissions
  to authenticated;

create policy "Submitters can update pending source URLs"
on public.pending_mapping_submissions
for update
to authenticated
using (
  submitted_by = (select auth.uid())
  and review_status = 'pending'
)
with check (
  submitted_by = (select auth.uid())
  and review_status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);
