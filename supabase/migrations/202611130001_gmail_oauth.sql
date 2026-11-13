-- Sassa Hube: armazenamento privado da autorização Gmail.
-- Os tokens são cifrados na Edge Function antes de chegar à base de dados.
create table if not exists public.gmail_oauth_credentials (
  id integer primary key default 1 check (id = 1),
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  scope text,
  connected_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.gmail_oauth_states (
  state_hash text primary key,
  user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.gmail_oauth_credentials enable row level security;
alter table public.gmail_oauth_states enable row level security;

revoke all on public.gmail_oauth_credentials from public, anon, authenticated;
revoke all on public.gmail_oauth_states from public, anon, authenticated;
grant all on public.gmail_oauth_credentials to service_role;
grant all on public.gmail_oauth_states to service_role;

create index if not exists gmail_oauth_states_expires_at_idx
  on public.gmail_oauth_states (expires_at);

-- Limpa estados de autorização expirados.
delete from public.gmail_oauth_states where expires_at < now();
