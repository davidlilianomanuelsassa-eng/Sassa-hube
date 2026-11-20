-- Campo da Secretaria: núcleo privado, permissões e registos.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
-- Esta migração é aditiva. Não altera as políticas/tabelas administrativas legadas.
create table if not exists public.site_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','assistant')),
  status text not null default 'active' check (status in ('pending','active','suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O(s) administrador(es) já existentes são registados como proprietário(s) inicial(is).
insert into public.site_members (user_id, role, status)
select user_id, 'owner', 'active'
from public.site_admins
on conflict (user_id) do nothing;

create table if not exists public.site_member_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.site_members(user_id) on delete cascade,
  module text not null check (char_length(module) between 2 and 80),
  action text not null check (char_length(action) between 2 and 80),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, module, action)
);

create table if not exists public.secretary_approval_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete restrict,
  action_key text not null,
  resource_type text not null,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  reason text not null check (char_length(reason) between 5 and 1200),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','executed','failed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint secretary_approval_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.secretary_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 1200),
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.secretary_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint secretary_message_distinct_users check (sender_id <> recipient_id)
);

create unique index if not exists one_secretary_assistant_only
  on public.site_members (role) where role = 'assistant';

create table if not exists public.secretary_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 180),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','in_progress','blocked','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.secretary_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint secretary_audit_details_object check (jsonb_typeof(details) = 'object')
);

create index if not exists secretary_approvals_status_created_idx
  on public.secretary_approval_requests (status, created_at desc);
create index if not exists secretary_notifications_recipient_created_idx
  on public.secretary_notifications (recipient_id, created_at desc);
create index if not exists secretary_messages_participants_created_idx
  on public.secretary_messages (sender_id, recipient_id, created_at desc);
create index if not exists secretary_tasks_assignee_status_idx
  on public.secretary_tasks (assigned_to, status, due_at);
create index if not exists secretary_audit_actor_created_idx
  on public.secretary_audit_logs (actor_id, created_at desc);

create or replace function private.is_secretaria_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.site_members m
    where m.user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'active'
  );
$$;

create or replace function private.is_secretaria_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.site_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function private.is_secretaria_active_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $
  select exists (
    select 1 from public.site_members m
    where m.user_id = p_user_id and m.status = 'active'
  );
$;

create or replace function private.has_secretaria_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_secretaria_owner()
    or exists (
      select 1
      from public.site_members m
      join public.site_member_permissions p on p.user_id = m.user_id
      where m.user_id = auth.uid()
        and m.role = 'assistant'
        and m.status = 'active'
        and p.module = p_module
        and p.action = p_action
    );
$$;

revoke all on function private.is_secretaria_owner() from public, anon;
revoke all on function private.is_secretaria_member() from public, anon;
revoke all on function private.has_secretaria_permission(text,text) from public, anon;
revoke all on function private.is_secretaria_active_member(uuid) from public, anon;
grant execute on function private.is_secretaria_owner() to authenticated;
grant execute on function private.is_secretaria_member() to authenticated;
grant execute on function private.has_secretaria_permission(text,text) to authenticated;
grant execute on function private.is_secretaria_active_member(uuid) to authenticated;

alter table public.site_members enable row level security;
alter table public.site_member_permissions enable row level security;
alter table public.secretary_approval_requests enable row level security;
alter table public.secretary_notifications enable row level security;
alter table public.secretary_messages enable row level security;
alter table public.secretary_tasks enable row level security;
alter table public.secretary_audit_logs enable row level security;

-- Remover acesso anónimo explícito; os acessos autenticados continuam sujeitos a RLS.
revoke all on public.site_members, public.site_member_permissions,
  public.secretary_approval_requests, public.secretary_notifications,
  public.secretary_messages, public.secretary_tasks, public.secretary_audit_logs
from anon;
grant select on public.site_members, public.site_member_permissions,
  public.secretary_approval_requests, public.secretary_notifications,
  public.secretary_messages, public.secretary_tasks, public.secretary_audit_logs
to authenticated;
grant insert on public.secretary_approval_requests, public.secretary_messages,
  public.secretary_tasks, public.secretary_audit_logs
to authenticated;
grant update (read_at) on public.secretary_notifications, public.secretary_messages to authenticated;

create policy "secretaria_members_read_self_or_owner"
on public.site_members for select to authenticated
using (user_id = auth.uid() or private.is_secretaria_owner());

create policy "secretaria_permissions_read_self_or_owner"
on public.site_member_permissions for select to authenticated
using (user_id = auth.uid() or private.is_secretaria_owner());

create policy "secretaria_approvals_read_participant"
on public.secretary_approval_requests for select to authenticated
using (private.is_secretaria_owner() or requested_by = auth.uid());

create policy "secretaria_approvals_create_by_member"
on public.secretary_approval_requests for insert to authenticated
with check (
  requested_by = auth.uid()
  and private.is_secretaria_member()
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and executed_at is null
);

create policy "secretaria_notifications_read_recipient"
on public.secretary_notifications for select to authenticated
using (recipient_id = auth.uid() and private.is_secretaria_member());

create policy "secretaria_notifications_mark_read"
on public.secretary_notifications for update to authenticated
using (recipient_id = auth.uid() and private.is_secretaria_member())
with check (recipient_id = auth.uid() and private.is_secretaria_member());

create policy "secretaria_messages_read_participant"
on public.secretary_messages for select to authenticated
using (
  private.is_secretaria_member()
  and (sender_id = auth.uid() or recipient_id = auth.uid())
);

create policy "secretaria_messages_send_as_self"
on public.secretary_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and private.is_secretaria_member()
  and private.is_secretaria_active_member(recipient_id)
);

create policy "secretaria_messages_mark_read"
on public.secretary_messages for update to authenticated
using (recipient_id = auth.uid() and private.is_secretaria_member())
with check (recipient_id = auth.uid() and private.is_secretaria_member());

create policy "secretaria_tasks_read_owner_or_participant"
on public.secretary_tasks for select to authenticated
using (
  private.is_secretaria_owner()
  or (private.is_secretaria_member() and (created_by = auth.uid() or assigned_to = auth.uid()))
);

create policy "secretaria_tasks_create_as_member"
on public.secretary_tasks for insert to authenticated
with check (
  created_by = auth.uid()
  and private.is_secretaria_member()
  and (assigned_to is null or private.is_secretaria_active_member(assigned_to))
);

create policy "secretaria_audit_read_owner_or_actor"
on public.secretary_audit_logs for select to authenticated
using (private.is_secretaria_owner() or (actor_id = auth.uid() and private.is_secretaria_member()));

create policy "secretaria_audit_insert_as_actor"
on public.secretary_audit_logs for insert to authenticated
with check (actor_id = auth.uid() and private.is_secretaria_member());

-- Não existem políticas UPDATE/DELETE para auditoria, pedidos de aprovação,
-- membros ou permissões. As decisões críticas serão executadas por Edge Function autenticada.

-- Decisão de aprovação transaccional: actualiza o pedido, notifica o autor e audita
-- numa única transacção. Só a Edge Function com service_role pode invocar esta função.
create or replace function public.review_secretary_approval(
  p_approval_id uuid,
  p_decision text,
  p_review_note text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.secretary_approval_requests%rowtype;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Decisão inválida';
  end if;
  if not exists (
    select 1 from public.site_members
    where user_id = p_actor_id and role = 'owner' and status = 'active'
  ) then
    raise exception 'Apenas o proprietário pode decidir pedidos';
  end if;

  update public.secretary_approval_requests
     set status = p_decision,
         reviewed_by = p_actor_id,
         reviewed_at = now(),
         review_note = nullif(left(coalesce(p_review_note,''),1000),'')
   where id = p_approval_id and status = 'pending'
   returning * into v_request;

  if not found then
    raise exception 'Pedido inexistente ou já decidido';
  end if;

  insert into public.secretary_notifications
    (recipient_id, notification_type, title, body, href)
  values
    (v_request.requested_by,
     'approval_decision',
     case when p_decision = 'approved' then 'Pedido aprovado' else 'Pedido rejeitado' end,
     case when p_decision = 'approved'
       then 'O proprietário aprovou o pedido. A execução ainda depende do processamento seguro da operação.'
       else 'O proprietário rejeitou o pedido.' end,
     'secretaria.html');

  insert into public.secretary_audit_logs
    (actor_id, action, target_type, target_id, details)
  values
    (p_actor_id,
     'secretary_approval_' || p_decision,
     'approval_request',
     v_request.id::text,
     jsonb_build_object('action_key',v_request.action_key,'resource_type',v_request.resource_type));

  return v_request.id;
end;
$$;

revoke all on function public.review_secretary_approval(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.review_secretary_approval(uuid,text,text,uuid) to service_role;


-- Assistente pode consultar produtos inactivos e encomendas apenas quando recebe
-- as permissões de leitura correspondentes. As mutações passam por Edge Functions.
create policy "secretaria_assistant_read_store_products"
on public.store_products for select to authenticated
using (private.has_secretaria_permission('store','view'));

create policy "secretaria_assistant_read_store_orders"
on public.store_orders for select to authenticated
using (private.has_secretaria_permission('orders','view'));


-- O membro assistente pode obter o identificador do proprietário activo para
-- a comunicação privada; outros perfis continuam invisíveis.
create policy "secretaria_members_read_owner_identity"
on public.site_members for select to authenticated
using (role = 'owner' and status = 'active' and private.is_secretaria_member());


-- Publicações: separar rascunhos de conteúdos publicados.
alter table public.works
  add column if not exists status text not null default 'published'
  check (status in ('draft','published','archived'));

drop policy if exists "Public can read works" on public.works;
create policy "Public can read published works"
on public.works for select to anon, authenticated
using (status = 'published');

create policy "Secretaria can read works"
on public.works for select to authenticated
using (private.has_secretaria_permission('works','view'));
