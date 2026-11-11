-- Executa este SQL no Supabase > SQL Editor.
-- A plataforma usa um único utilizador administrativo criado manualmente.
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  category text not null,
  file_path text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.works enable row level security;

-- Qualquer visitante pode consultar apenas a lista pública.
drop policy if exists "Public can read works" on public.works;
create policy "Public can read works" on public.works
for select using (true);

-- Apenas utilizadores autenticados podem publicar, alterar ou apagar.
drop policy if exists "Admin can insert works" on public.works;
create policy "Admin can insert works" on public.works
for insert to authenticated with check (true);

drop policy if exists "Admin can update works" on public.works;
create policy "Admin can update works" on public.works
for update to authenticated using (true) with check (true);

drop policy if exists "Admin can delete works" on public.works;
create policy "Admin can delete works" on public.works
for delete to authenticated using (true);

-- Criar o bucket público para os ficheiros publicados.
insert into storage.buckets (id, name, public, file_size_limit)
values ('work-files', 'work-files', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

-- Visitantes podem descarregar ficheiros publicados.
drop policy if exists "Public can view work files" on storage.objects;
create policy "Public can view work files" on storage.objects
for select using (bucket_id = 'work-files');

-- Só utilizadores autenticados podem enviar e apagar ficheiros.
drop policy if exists "Admin can upload work files" on storage.objects;
create policy "Admin can upload work files" on storage.objects
for insert to authenticated with check (bucket_id = 'work-files');

drop policy if exists "Admin can delete work files" on storage.objects;
create policy "Admin can delete work files" on storage.objects
for delete to authenticated using (bucket_id = 'work-files');
