drop policy if exists "company settings delete anon" on public.company_settings;

create policy "company settings delete anon" on public.company_settings for delete using (true);
