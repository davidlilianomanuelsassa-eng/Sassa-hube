-- SASSA HUBE — estatísticas de audiência com recolha mínima
-- Executar uma única vez no SQL Editor do projecto Supabase.

create table if not exists public.site_analytics (
  id bigint generated always as identity primary key,
  page_path text not null check (char_length(page_path) between 1 and 180),
  referrer_host text not null default '' check (char_length(referrer_host) <= 120),
  device_type text not null check (device_type in ('desktop','mobile','tablet')),
  viewed_at timestamptz not null default now()
);
create index if not exists site_analytics_viewed_at_idx on public.site_analytics (viewed_at desc);
create index if not exists site_analytics_page_path_idx on public.site_analytics (page_path);
alter table public.site_analytics enable row level security;

drop policy if exists "Admins can read site analytics" on public.site_analytics;
create policy "Admins can read site analytics" on public.site_analytics
for select to authenticated
using (exists (select 1 from public.site_admins sa where sa.user_id = (select auth.uid())));

revoke all on public.site_analytics from anon, authenticated;
grant select on public.site_analytics to authenticated;

create or replace function public.record_site_view(p_page text, p_referrer text default '', p_device text default 'desktop')
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare clean_page text; clean_referrer text; clean_device text;
begin
  clean_page := left(coalesce(p_page, '/'), 180);
  clean_referrer := left(coalesce(p_referrer, ''), 120);
  clean_device := lower(coalesce(p_device, 'desktop'));
  if clean_page !~ '^/[a-zA-Z0-9_./-]*$' then raise exception 'Página inválida'; end if;
  if clean_device not in ('desktop','mobile','tablet') then clean_device := 'desktop'; end if;
  if clean_referrer ~ '[/?#@]' then clean_referrer := ''; end if;
  insert into public.site_analytics (page_path, referrer_host, device_type)
  values (clean_page, clean_referrer, clean_device);
end;
$$;
revoke all on function public.record_site_view(text,text,text) from public;
grant execute on function public.record_site_view(text,text,text) to anon, authenticated;
