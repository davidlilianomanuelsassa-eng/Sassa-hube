-- Private email queue for owner/assistant notices. Only service_role can access it.
create table if not exists public.secretary_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient_email text not null,
  subject text not null,
  html_body text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.secretary_email_outbox enable row level security;
revoke all on public.secretary_email_outbox from public, anon, authenticated;
grant all on public.secretary_email_outbox to service_role;
