create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'USD',
  exchange_rate numeric not null,
  exchange_date date not null,
  created_at timestamptz not null default now()
);

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange rates read anon" on public.exchange_rates;
drop policy if exists "exchange rates insert anon" on public.exchange_rates;
drop policy if exists "exchange rates delete anon" on public.exchange_rates;

create policy "exchange rates read anon" on public.exchange_rates for select using (true);
create policy "exchange rates insert anon" on public.exchange_rates for insert with check (true);
create policy "exchange rates delete anon" on public.exchange_rates for delete using (true);
