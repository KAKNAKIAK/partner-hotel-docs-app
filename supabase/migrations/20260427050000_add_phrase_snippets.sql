create table if not exists public.phrase_snippets (
  id text primary key,
  title text not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.phrase_snippets enable row level security;

alter table public.phrase_snippets add column if not exists title text;
alter table public.phrase_snippets add column if not exists content text;

drop policy if exists "phrase snippets read anon" on public.phrase_snippets;
drop policy if exists "phrase snippets insert anon" on public.phrase_snippets;
drop policy if exists "phrase snippets update anon" on public.phrase_snippets;
drop policy if exists "phrase snippets delete anon" on public.phrase_snippets;

create policy "phrase snippets read anon" on public.phrase_snippets for select using (true);
create policy "phrase snippets insert anon" on public.phrase_snippets for insert with check (true);
create policy "phrase snippets update anon" on public.phrase_snippets for update using (true) with check (true);
create policy "phrase snippets delete anon" on public.phrase_snippets for delete using (true);
