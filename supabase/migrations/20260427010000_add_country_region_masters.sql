create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(country_id, name)
);

alter table public.countries enable row level security;
alter table public.regions enable row level security;

drop policy if exists "countries read anon" on public.countries;
drop policy if exists "countries insert anon" on public.countries;
drop policy if exists "countries update anon" on public.countries;
drop policy if exists "countries delete anon" on public.countries;
drop policy if exists "regions read anon" on public.regions;
drop policy if exists "regions insert anon" on public.regions;
drop policy if exists "regions update anon" on public.regions;
drop policy if exists "regions delete anon" on public.regions;

create policy "countries read anon" on public.countries for select using (true);
create policy "countries insert anon" on public.countries for insert with check (true);
create policy "countries update anon" on public.countries for update using (true) with check (true);
create policy "countries delete anon" on public.countries for delete using (true);
create policy "regions read anon" on public.regions for select using (true);
create policy "regions insert anon" on public.regions for insert with check (true);
create policy "regions update anon" on public.regions for update using (true) with check (true);
create policy "regions delete anon" on public.regions for delete using (true);
