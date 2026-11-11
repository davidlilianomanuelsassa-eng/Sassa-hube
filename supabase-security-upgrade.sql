-- Sassa Hube: reforço de segurança das publicações
-- Executar uma única vez em Supabase > SQL Editor.
-- Mantém a leitura pública e restringe escrita à tabela site_admins.

drop policy if exists "Admin can insert works" on public.works;
drop policy if exists "Admin can update works" on public.works;
drop policy if exists "Admin can delete works" on public.works;

create policy "Only site admins can insert works"
on public.works for insert to authenticated
with check (exists (select 1 from public.site_admins a where a.user_id = auth.uid()));

create policy "Only site admins can update works"
on public.works for update to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.site_admins a where a.user_id = auth.uid()));

create policy "Only site admins can delete works"
on public.works for delete to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = auth.uid()));

drop policy if exists "Admin can upload work files" on storage.objects;
drop policy if exists "Admin can delete work files" on storage.objects;

create policy "Only site admins can upload work files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-files'
  and exists (select 1 from public.site_admins a where a.user_id = auth.uid())
);

create policy "Only site admins can delete work files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'work-files'
  and exists (select 1 from public.site_admins a where a.user_id = auth.uid())
);

-- A política de leitura pública "Public can read works" e a leitura pública
-- do bucket "work-files" são mantidas para permitir consulta sem conta.
