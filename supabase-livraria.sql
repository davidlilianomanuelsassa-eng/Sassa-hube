-- Livraria Sassa Hube: catálogo e encomendas de livros digitais e físicos
-- Executar uma única vez em Supabase > SQL Editor.
create table if not exists public.store_products (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 2 and 180),
 description text check (description is null or char_length(description)<=1200),
 price numeric(12,2) not null check (price>=0),
 currency text not null default 'AOA' check (currency in ('AOA','USD','EUR')),
 format text not null check (format in ('Digital','Físico')),
 cover_url text,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.store_orders (
 id uuid primary key default gen_random_uuid(),
 product_id uuid references public.store_products(id) on delete set null,
 product_title text not null,
 format text not null check (format in ('Digital','Físico')),
 price numeric(12,2) not null check (price>=0),
 currency text not null default 'AOA',
 buyer_name text not null check (char_length(buyer_name) between 2 and 120),
 buyer_contact text not null check (char_length(buyer_contact) between 5 and 160),
 note text check (note is null or char_length(note)<=600),
 status text not null default 'pending' check (status in ('pending','confirmed','delivered','free_delivered','cancelled')),
 created_at timestamptz not null default now()
);
-- Compatibilidade com instalações anteriores: acrescenta o estado de disponibilização gratuita.
alter table public.store_orders drop constraint if exists store_orders_status_check;
alter table public.store_orders add constraint store_orders_status_check check (status in ('pending','confirmed','delivered','free_delivered','cancelled'));

alter table public.store_products enable row level security;
alter table public.store_orders enable row level security;
drop policy if exists "Public can view active store products" on public.store_products;
create policy "Public can view active store products" on public.store_products for select to anon,authenticated using (active=true);
drop policy if exists "Admins manage store products" on public.store_products;
create policy "Admins manage store products" on public.store_products for all to authenticated using (exists(select 1 from public.site_admins where user_id=auth.uid())) with check (exists(select 1 from public.site_admins where user_id=auth.uid()));
drop policy if exists "Visitors can place store orders" on public.store_orders;
create policy "Visitors can place store orders" on public.store_orders for insert to anon,authenticated with check (status='pending' and char_length(buyer_name) between 2 and 120 and char_length(buyer_contact) between 5 and 160);
drop policy if exists "Admins can view store orders" on public.store_orders;
create policy "Admins can view store orders" on public.store_orders for select to authenticated using (exists(select 1 from public.site_admins where user_id=auth.uid()));
drop policy if exists "Admins can update store orders" on public.store_orders;
create policy "Admins can update store orders" on public.store_orders for update to authenticated using (exists(select 1 from public.site_admins where user_id=auth.uid())) with check (exists(select 1 from public.site_admins where user_id=auth.uid()));
grant select on public.store_products to anon,authenticated;
grant insert on public.store_orders to anon,authenticated;
grant select,update on public.store_orders to authenticated;
grant insert,update,delete on public.store_products to authenticated;

-- O servidor define título, formato, preço e moeda a partir do produto activo.
create or replace function public.set_store_order_product_details()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.store_products%rowtype;
begin
 select * into p from public.store_products where id=new.product_id and active=true;
 if not found then raise exception 'Livro indisponível.'; end if;
 new.product_title:=p.title;
 new.format:=p.format;
 new.price:=p.price;
 new.currency:=p.currency;
 new.status:='pending';
 return new;
end;
$$;
drop trigger if exists set_store_order_product_details on public.store_orders;
create trigger set_store_order_product_details before insert on public.store_orders
for each row execute function public.set_store_order_product_details();

 
-- Ficheiros PDF da Livraria: bucket privado, apenas administradores podem gerir/ler.
alter table public.store_products add column if not exists digital_file_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-files', 'store-files', false, 52428800, array['application/pdf'])
on conflict (id) do update set public=false, file_size_limit=52428800, allowed_mime_types=array['application/pdf'];

drop policy if exists "Admins can upload store PDFs" on storage.objects;
create policy "Admins can upload store PDFs" on storage.objects
for insert to authenticated
with check (bucket_id='store-files' and exists(select 1 from public.site_admins where user_id=auth.uid()));

drop policy if exists "Admins can read store PDFs" on storage.objects;
create policy "Admins can read store PDFs" on storage.objects
for select to authenticated
using (bucket_id='store-files' and exists(select 1 from public.site_admins where user_id=auth.uid()));

drop policy if exists "Admins can delete store PDFs" on storage.objects;
create policy "Admins can delete store PDFs" on storage.objects
for delete to authenticated
using (bucket_id='store-files' and exists(select 1 from public.site_admins where user_id=auth.uid()));
