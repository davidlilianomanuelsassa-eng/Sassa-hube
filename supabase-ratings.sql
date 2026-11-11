-- Sassa Hube: avaliações públicas dos visitantes
-- Executar uma única vez em Supabase > SQL Editor.
create table if not exists public.site_ratings (
  id uuid primary key default gen_random_uuid(),
  vote text not null check (vote in ('like','dislike')),
  visitor_key uuid not null unique,
  created_at timestamptz not null default now()
);
alter table public.site_ratings enable row level security;
drop policy if exists "Public can read site ratings" on public.site_ratings;
create policy "Public can read site ratings" on public.site_ratings
for select to anon, authenticated using (true);
drop policy if exists "Visitors can submit one rating" on public.site_ratings;
create policy "Visitors can submit one rating" on public.site_ratings
for insert to anon, authenticated
with check (vote in ('like','dislike') and visitor_key is not null);
grant select, insert on public.site_ratings to anon, authenticated;
