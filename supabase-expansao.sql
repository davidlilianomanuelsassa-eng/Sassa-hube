-- SASSA HUBE · EXPANSÃO INCREMENTAL
-- Executar no SQL Editor do Supabase depois de rever. Não altera works, store_products,
-- encomendas, storage ou a função download-book.
create extension if not exists pgcrypto;

create table if not exists public.sh_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  bio text not null default '',
  role text not null default 'leitor' check (role in ('leitor','estudante','professor','autor')),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sh_profiles enable row level security;
drop policy if exists "sh_profiles_public_read" on public.sh_profiles;
create policy "sh_profiles_public_read" on public.sh_profiles for select using (is_public = true or auth.uid() = user_id);
drop policy if exists "sh_profiles_insert_own" on public.sh_profiles;
create policy "sh_profiles_insert_own" on public.sh_profiles for insert with check (auth.uid() = user_id);
drop policy if exists "sh_profiles_update_own" on public.sh_profiles;
create policy "sh_profiles_update_own" on public.sh_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.sh_bookmarks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 url text not null,
 created_at timestamptz not null default now(),
 unique(user_id,url)
);
alter table public.sh_bookmarks enable row level security;
drop policy if exists "sh_bookmarks_own" on public.sh_bookmarks;
create policy "sh_bookmarks_own" on public.sh_bookmarks for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create table if not exists public.sh_progress (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 activity_slug text not null,
 score integer not null default 0 check(score between 0 and 100),
 completed_at timestamptz not null default now(),
 unique(user_id,activity_slug)
);
alter table public.sh_progress enable row level security;
drop policy if exists "sh_progress_own" on public.sh_progress;
create policy "sh_progress_own" on public.sh_progress for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.sh_topics (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 3 and 120),
 body text not null check(char_length(body) between 3 and 2000),
 status text not null default 'published' check(status in ('pending','published','hidden')),
 created_at timestamptz not null default now()
);
alter table public.sh_topics enable row level security;
drop policy if exists "sh_topics_public_read" on public.sh_topics;
create policy "sh_topics_public_read" on public.sh_topics for select using(status='published' or auth.uid()=user_id or coalesce(auth.jwt()->'app_metadata'->>'role','')='admin');
drop policy if exists "sh_topics_auth_insert" on public.sh_topics;
create policy "sh_topics_auth_insert" on public.sh_topics for insert with check(auth.uid()=user_id);
drop policy if exists "sh_topics_owner_update" on public.sh_topics;
create policy "sh_topics_owner_update" on public.sh_topics for update using(auth.uid()=user_id or coalesce(auth.jwt()->'app_metadata'->>'role','')='admin') with check(auth.uid()=user_id or coalesce(auth.jwt()->'app_metadata'->>'role','')='admin');

create table if not exists public.sh_certificates (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 activity_slug text not null,
 status text not null default 'requested' check(status in ('requested','approved','issued','rejected')),
 certificate_code text unique,
 requested_at timestamptz not null default now(),
 issued_at timestamptz,
 unique(user_id,activity_slug)
);
alter table public.sh_certificates enable row level security;
drop policy if exists "sh_certificates_read_own_or_admin" on public.sh_certificates;
create policy "sh_certificates_read_own_or_admin" on public.sh_certificates for select using(auth.uid()=user_id or coalesce(auth.jwt()->'app_metadata'->>'role','')='admin');
drop policy if exists "sh_certificates_request_own" on public.sh_certificates;
create policy "sh_certificates_request_own" on public.sh_certificates for insert with check(auth.uid()=user_id and status='requested');
drop policy if exists "sh_certificates_admin_update" on public.sh_certificates;
create policy "sh_certificates_admin_update" on public.sh_certificates for update using(coalesce(auth.jwt()->'app_metadata'->>'role','')='admin') with check(coalesce(auth.jwt()->'app_metadata'->>'role','')='admin');

create index if not exists sh_topics_created_idx on public.sh_topics(created_at desc);
create index if not exists sh_profiles_public_idx on public.sh_profiles(is_public,display_name);
create index if not exists sh_bookmarks_user_idx on public.sh_bookmarks(user_id,created_at desc);
create index if not exists sh_progress_user_idx on public.sh_progress(user_id);

-- Perfis não são criados automaticamente para não publicar dados sem consentimento.
-- A chave service_role nunca deve ser colocada no navegador.
