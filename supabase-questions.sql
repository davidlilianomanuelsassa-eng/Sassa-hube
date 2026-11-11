-- Sassa Hube: perguntas e respostas dos visitantes
-- Executar uma única vez em Supabase > SQL Editor.
create table if not exists public.site_questions (
  id uuid primary key default gen_random_uuid(),
  name text,
  question text not null check (char_length(question) between 3 and 1500),
  answer text check (answer is null or char_length(answer) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.site_questions enable row level security;
drop policy if exists "Visitors can submit questions" on public.site_questions;
create policy "Visitors can submit questions" on public.site_questions
for insert to anon, authenticated
with check (char_length(question) between 3 and 1500 and answer is null);
drop policy if exists "Public can read answered questions" on public.site_questions;
create policy "Public can read answered questions" on public.site_questions
for select to anon, authenticated using (answer is not null);
drop policy if exists "Admins can read all questions" on public.site_questions;
create policy "Admins can read all questions" on public.site_questions
for select to authenticated
using (exists (select 1 from public.site_admins where user_id = auth.uid()));
drop policy if exists "Admins can answer questions" on public.site_questions;
create policy "Admins can answer questions" on public.site_questions
for update to authenticated
using (exists (select 1 from public.site_admins where user_id = auth.uid()))
with check (exists (select 1 from public.site_admins where user_id = auth.uid()));
grant select, insert, update on public.site_questions to anon, authenticated;
