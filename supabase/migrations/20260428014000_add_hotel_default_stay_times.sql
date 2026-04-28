alter table public.hotels
  add column if not exists default_check_in_time text,
  add column if not exists default_check_out_time text;
