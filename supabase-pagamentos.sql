-- Sassa Hube: comprovativos de transferência e revisão administrativa
-- Executar uma única vez em Supabase > SQL Editor.
-- Não processa pagamentos: guarda comprovativos para verificação humana.

alter table public.store_products
  add column if not exists pdf_path text;

create table if not exists public.store_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  proof_path text not null,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create index if not exists store_payment_proofs_order_idx
  on public.store_payment_proofs(order_id);
create index if not exists store_payment_proofs_status_idx
  on public.store_payment_proofs(status, submitted_at desc);

alter table public.store_payment_proofs enable row level security;

drop policy if exists "Visitors submit payment proofs" on public.store_payment_proofs;
create policy "Visitors submit payment proofs"
on public.store_payment_proofs for insert to anon, authenticated
with check (
  status = 'pending'
  and proof_path like order_id::text || '/%'
  and exists (select 1 from public.store_orders o where o.id = order_id)
);

drop policy if exists "Admins view payment proofs" on public.store_payment_proofs;
create policy "Admins view payment proofs"
on public.store_payment_proofs for select to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = auth.uid()));

drop policy if exists "Admins review payment proofs" on public.store_payment_proofs;
create policy "Admins review payment proofs"
on public.store_payment_proofs for update to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.site_admins a where a.user_id = auth.uid()));

grant insert on public.store_payment_proofs to anon, authenticated;
grant select, update on public.store_payment_proofs to authenticated;

-- Buckets privados: os ficheiros não ficam publicamente acessíveis.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
 ('store-assets', 'store-assets', true, 5242880, array['image/jpeg','image/png','image/webp']),
 ('store-files', 'store-files', false, 52428800, array['application/pdf']),
 ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Admins upload store assets" on storage.objects;
create policy "Admins upload store assets"
on storage.objects for insert to authenticated
with check (
 bucket_id in ('store-assets','store-files')
 and exists (select 1 from public.site_admins a where a.user_id = auth.uid())
);

drop policy if exists "Admins manage store assets" on storage.objects;
create policy "Admins manage store assets"
on storage.objects for all to authenticated
using (
 bucket_id in ('store-assets','store-files')
 and exists (select 1 from public.site_admins a where a.user_id = auth.uid())
)
with check (
 bucket_id in ('store-assets','store-files')
 and exists (select 1 from public.site_admins a where a.user_id = auth.uid())
);

drop policy if exists "Visitors upload payment proofs" on storage.objects;
create policy "Visitors upload payment proofs"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'payment-proofs');

drop policy if exists "Admins read payment proofs" on storage.objects;
create policy "Admins read payment proofs"
on storage.objects for select to authenticated
using (
 bucket_id = 'payment-proofs'
 and exists (select 1 from public.site_admins a where a.user_id = auth.uid())
);

drop policy if exists "Admins delete payment proofs" on storage.objects;
create policy "Admins delete payment proofs"
on storage.objects for delete to authenticated
using (
 bucket_id = 'payment-proofs'
 and exists (select 1 from public.site_admins a where a.user_id = auth.uid())
);
