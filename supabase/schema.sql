-- Table: one row holds the whole content override object.
create table if not exists public.site_content (
  id int primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

-- Anyone (anon) may READ the single row. No write for anon.
create policy "public read" on public.site_content
  for select using (true);

-- Only authenticated users (Mark) may UPDATE the row.
create policy "auth update" on public.site_content
  for update to authenticated using (true) with check (true);

-- Storage bucket for uploaded photos: public read, authenticated write.
insert into storage.buckets (id, name, public)
  values ('site-photos','site-photos', true)
  on conflict (id) do nothing;

create policy "photos public read" on storage.objects
  for select using (bucket_id = 'site-photos');
create policy "photos auth write" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-photos');
create policy "photos auth update" on storage.objects
  for update to authenticated using (bucket_id = 'site-photos');
