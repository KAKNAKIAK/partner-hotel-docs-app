create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ci_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.company_settings (
  id text primary key default 'default',
  ci_url text,
  address text,
  phone text,
  email text,
  bank_account text,
  seal_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  korean_name text,
  country text,
  city text,
  logo_url text,
  address text,
  phone text,
  default_notice text,
  default_meal_plan text,
  rooms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id),
  hotel_id uuid references public.hotels(id),
  status text not null default '작성중',
  lead_guest text,
  confirm_no text,
  issue_date date,
  check_in date,
  check_out date,
  stated_nights integer not null default 0,
  room_type text,
  room_count integer not null default 1,
  adult_count integer not null default 0,
  child_count integer not null default 0,
  infant_count integer not null default 0,
  late_checkout text,
  meal_plan text,
  payment_terms text,
  currency text not null default 'USD',
  exchange_rate numeric not null default 0,
  exchange_rate_date date,
  rounding text not null default 'round',
  bank_account text,
  invoice_remark text,
  customer_notice text,
  charges jsonb not null default '[]'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partners enable row level security;
alter table public.countries enable row level security;
alter table public.regions enable row level security;
alter table public.company_settings enable row level security;
alter table public.hotels enable row level security;
alter table public.reservations enable row level security;

alter table public.partners add column if not exists ci_url text;
alter table public.company_settings add column if not exists ci_url text;
alter table public.company_settings add column if not exists address text;
alter table public.company_settings add column if not exists phone text;
alter table public.company_settings add column if not exists email text;
alter table public.company_settings add column if not exists bank_account text;
alter table public.company_settings add column if not exists seal_url text;
alter table public.hotels add column if not exists korean_name text;
alter table public.hotels add column if not exists logo_url text;
alter table public.hotels add column if not exists rooms text[] not null default '{}';

drop policy if exists "partners read anon" on public.partners;
drop policy if exists "partners insert anon" on public.partners;
drop policy if exists "partners update anon" on public.partners;
drop policy if exists "partners delete anon" on public.partners;
drop policy if exists "countries read anon" on public.countries;
drop policy if exists "countries insert anon" on public.countries;
drop policy if exists "countries update anon" on public.countries;
drop policy if exists "countries delete anon" on public.countries;
drop policy if exists "regions read anon" on public.regions;
drop policy if exists "regions insert anon" on public.regions;
drop policy if exists "regions update anon" on public.regions;
drop policy if exists "regions delete anon" on public.regions;
drop policy if exists "company settings read anon" on public.company_settings;
drop policy if exists "company settings insert anon" on public.company_settings;
drop policy if exists "company settings update anon" on public.company_settings;
drop policy if exists "hotels read anon" on public.hotels;
drop policy if exists "hotels insert anon" on public.hotels;
drop policy if exists "hotels update anon" on public.hotels;
drop policy if exists "hotels delete anon" on public.hotels;
drop policy if exists "reservations read anon" on public.reservations;
drop policy if exists "reservations insert anon" on public.reservations;
drop policy if exists "reservations update anon" on public.reservations;

create policy "partners read anon" on public.partners for select using (true);
create policy "partners insert anon" on public.partners for insert with check (true);
create policy "partners update anon" on public.partners for update using (true) with check (true);
create policy "partners delete anon" on public.partners for delete using (true);
create policy "countries read anon" on public.countries for select using (true);
create policy "countries insert anon" on public.countries for insert with check (true);
create policy "countries update anon" on public.countries for update using (true) with check (true);
create policy "countries delete anon" on public.countries for delete using (true);
create policy "regions read anon" on public.regions for select using (true);
create policy "regions insert anon" on public.regions for insert with check (true);
create policy "regions update anon" on public.regions for update using (true) with check (true);
create policy "regions delete anon" on public.regions for delete using (true);
create policy "company settings read anon" on public.company_settings for select using (true);
create policy "company settings insert anon" on public.company_settings for insert with check (true);
create policy "company settings update anon" on public.company_settings for update using (true) with check (true);
create policy "hotels read anon" on public.hotels for select using (true);
create policy "hotels insert anon" on public.hotels for insert with check (true);
create policy "hotels update anon" on public.hotels for update using (true) with check (true);
create policy "hotels delete anon" on public.hotels for delete using (true);
create policy "reservations read anon" on public.reservations for select using (true);
create policy "reservations insert anon" on public.reservations for insert with check (true);
create policy "reservations update anon" on public.reservations for update using (true) with check (true);
