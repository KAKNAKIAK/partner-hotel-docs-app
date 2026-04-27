create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ci_url text,
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
alter table public.hotels enable row level security;
alter table public.reservations enable row level security;

alter table public.partners add column if not exists ci_url text;
alter table public.hotels add column if not exists korean_name text;
alter table public.hotels add column if not exists logo_url text;
alter table public.hotels add column if not exists rooms text[] not null default '{}';

drop policy if exists "partners read anon" on public.partners;
drop policy if exists "partners insert anon" on public.partners;
drop policy if exists "partners update anon" on public.partners;
drop policy if exists "hotels read anon" on public.hotels;
drop policy if exists "hotels insert anon" on public.hotels;
drop policy if exists "hotels update anon" on public.hotels;
drop policy if exists "reservations read anon" on public.reservations;
drop policy if exists "reservations insert anon" on public.reservations;
drop policy if exists "reservations update anon" on public.reservations;

create policy "partners read anon" on public.partners for select using (true);
create policy "partners insert anon" on public.partners for insert with check (true);
create policy "partners update anon" on public.partners for update using (true) with check (true);
create policy "hotels read anon" on public.hotels for select using (true);
create policy "hotels insert anon" on public.hotels for insert with check (true);
create policy "hotels update anon" on public.hotels for update using (true) with check (true);
create policy "reservations read anon" on public.reservations for select using (true);
create policy "reservations insert anon" on public.reservations for insert with check (true);
create policy "reservations update anon" on public.reservations for update using (true) with check (true);

insert into public.partners (name, ci_url)
values
  ('내일 투어', null)
on conflict do nothing;

insert into public.hotels (name, korean_name, country, city, logo_url, address, phone, default_notice, default_meal_plan, rooms)
values
  ('Villa Le Corail - A Gran Melia Hotel Nha Trang', '빌라 르 코랄 나트랑', 'Vietnam', 'Nha Trang', null, 'Bai Tien, Duong De, Vinh Hoa Ward, Nha Trang City, Khanh Hoa Province, Vietnam 65000', '+84-258-386-8888', '체크인 시 투숙객 전원의 여권을 제출해 주세요.' || chr(10) || '호텔에서 보증금 또는 현장 추가비를 요청할 수 있습니다.' || chr(10) || '미니바, 룸서비스, 전화, 세탁 등 개인 이용 금액은 현장에서 직접 결제합니다.', 'Breakfast included', array['Deluxe King / Twin Garden view', 'Deluxe King Pool View'])
on conflict do nothing;
