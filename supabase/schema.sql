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
  country text,
  city text,
  address text,
  phone text,
  default_notice text,
  default_meal_plan text,
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

create policy "partners read anon" on public.partners for select using (true);
create policy "hotels read anon" on public.hotels for select using (true);
create policy "reservations read anon" on public.reservations for select using (true);
create policy "reservations insert anon" on public.reservations for insert with check (true);
create policy "reservations update anon" on public.reservations for update using (true) with check (true);

insert into public.partners (name, ci_url)
values
  ('내일 투어', null)
on conflict do nothing;

insert into public.hotels (name, country, city, address, phone, default_notice, default_meal_plan)
values
  ('Villa Le Corail - A Gran Melia Hotel Nha Trang', 'Vietnam', 'Nha Trang', 'Bai Tien, Duong De, Vinh Hoa Ward, Nha Trang City, Khanh Hoa Province, Vietnam 65000', '+84-258-386-8888', '체크인 시 투숙객 전원의 여권을 제출해 주세요.' || chr(10) || '호텔에서 보증금 또는 현장 추가비를 요청할 수 있습니다.' || chr(10) || '미니바, 룸서비스, 전화, 세탁 등 개인 이용 금액은 현장에서 직접 결제합니다.', 'Breakfast included')
on conflict do nothing;
