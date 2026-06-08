create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
on public.profiles for select to authenticated
using (user_id = auth.uid());

create policy "Users can insert their own profile"
on public.profiles for insert to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
