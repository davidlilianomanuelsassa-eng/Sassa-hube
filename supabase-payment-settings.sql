-- Configuração pública das coordenadas bancárias da Livraria Sassa Hube.
-- Executar uma única vez em Supabase > SQL Editor.
-- Os dados desta tabela serão visíveis aos clientes para efectuarem transferências.
create table if not exists public.store_payment_settings (
  id text primary key default 'main' check (id = 'main'),
  bank_name text not null default '',
  account_holder text not null default '',
  iban text not null default '',
  account_number text not null default '',
  payment_instructions text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.store_payment_settings enable row level security;

drop policy if exists "Public can view payment coordinates" on public.store_payment_settings;
create policy "Public can view payment coordinates"
on public.store_payment_settings for select
to anon, authenticated
using (id = 'main');

drop policy if exists "Admins can insert payment coordinates" on public.store_payment_settings;
create policy "Admins can insert payment coordinates"
on public.store_payment_settings for insert
to authenticated
with check (
  id = 'main'
  and exists (select 1 from public.site_admins where user_id = auth.uid())
);

drop policy if exists "Admins can update payment coordinates" on public.store_payment_settings;
create policy "Admins can update payment coordinates"
on public.store_payment_settings for update
to authenticated
using (
  id = 'main'
  and exists (select 1 from public.site_admins where user_id = auth.uid())
)
with check (
  id = 'main'
  and exists (select 1 from public.site_admins where user_id = auth.uid())
);

grant select on public.store_payment_settings to anon, authenticated;
grant insert, update on public.store_payment_settings to authenticated;

insert into public.store_payment_settings (id)
values ('main')
on conflict (id) do nothing;
