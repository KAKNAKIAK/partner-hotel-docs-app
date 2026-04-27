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

alter table public.company_settings enable row level security;

alter table public.company_settings add column if not exists ci_url text;
alter table public.company_settings add column if not exists address text;
alter table public.company_settings add column if not exists phone text;
alter table public.company_settings add column if not exists email text;
alter table public.company_settings add column if not exists bank_account text;
alter table public.company_settings add column if not exists seal_url text;

drop policy if exists "company settings read anon" on public.company_settings;
drop policy if exists "company settings insert anon" on public.company_settings;
drop policy if exists "company settings update anon" on public.company_settings;

create policy "company settings read anon" on public.company_settings for select using (true);
create policy "company settings insert anon" on public.company_settings for insert with check (true);
create policy "company settings update anon" on public.company_settings for update using (true) with check (true);
