-- Campo da Secretaria: núcleo privado, membros, chat, tarefas, notificações e aprovações.
-- Esta migração é aditiva e não altera as políticas administrativas legadas.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists public.site_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','assistant')),
  status text not null default 'active' check (status in ('pending','active','suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A conta administrativa já registada é a proprietária inicial.
insert into public.site_members(user_id,role,status)
select user_id,'owner','active' from public.site_admins
on conflict(user_id) do nothing;

create table if not exists public.site_member_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.site_members(user_id) on delete cascade,
  module text not null check(char_length(module) between 2 and 80),
  action text not null check(char_length(action) between 2 and 80),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(user_id,module,action)
);

create table if not exists public.secretary_approval_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete restrict,
  action_key text not null,
  resource_type text not null,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  reason text not null check(char_length(reason) between 5 and 1200),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled','executed','failed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint secretary_approval_payload_object check(jsonb_typeof(payload)='object')
);

create table if not exists public.secretary_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null check(char_length(title) between 1 and 160),
  body text not null check(char_length(body) between 1 and 1200),
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.secretary_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete restrict,
  body text not null check(char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint secretary_message_distinct_users check(sender_id<>recipient_id)
);

-- Apenas uma secretária pode estar registada de cada vez.
create unique index if not exists one_secretary_assistant_only
on public.site_members(role) where role='assistant';

create table if not exists public.secretary_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(title) between 2 and 180),
  description text not null default '' check(char_length(description)<=2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check(status in ('open','in_progress','blocked','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.secretary_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);

create index if not exists secretary_approvals_status_created_idx
on public.secretary_approval_requests(status,created_at desc);
create index if not exists secretary_notifications_recipient_created_idx
on public.secretary_notifications(recipient_id,created_at desc);
create index if not exists secretary_messages_participants_created_idx
on public.secretary_messages(sender_id,recipient_id,created_at desc);
create index if not exists secretary_tasks_assignee_status_idx
on public.secretary_tasks(assigned_to,status,due_at);
create index if not exists secretary_audit_actor_created_idx
on public.secretary_audit_logs(actor_id,created_at desc);

-- Helpers de autorização: não são endpoints da API pública.
create or replace function private.is_secretaria_owner()
returns boolean language sql stable security definer
set search_path=''
as $$
  select exists(
    select 1 from public.site_members m
    where m.user_id=(select auth.uid()) and m.role='owner' and m.status='active'
  );
$$;

create or replace function private.is_secretaria_member()
returns boolean language sql stable security definer
set search_path=''
as $$
  select exists(
    select 1 from public.site_members m
    where m.user_id=(select auth.uid()) and m.status='active'
  );
$$;

create or replace function private.is_secretaria_active_member(p_user_id uuid)
returns boolean language sql stable security definer
set search_path=''
as $$
  select exists(
    select 1 from public.site_members m
    where m.user_id=p_user_id and m.status='active'
  );
$$;

create or replace function private.has_secretaria_permission(p_module text,p_action text)
returns boolean language sql stable security definer
set search_path=''
as $$
  select private.is_secretaria_owner() or exists(
    select 1
    from public.site_members m
    join public.site_member_permissions p on p.user_id=m.user_id
    where m.user_id=(select auth.uid())
      and m.role='assistant' and m.status='active'
      and p.module=p_module and p.action=p_action
  );
$$;

revoke all on function private.is_secretaria_owner() from public,anon;
revoke all on function private.is_secretaria_member() from public,anon;
revoke all on function private.is_secretaria_active_member(uuid) from public,anon;
revoke all on function private.has_secretaria_permission(text,text) from public,anon;
grant execute on function private.is_secretaria_owner() to authenticated,service_role;
grant execute on function private.is_secretaria_member() to authenticated,service_role;
grant execute on function private.is_secretaria_active_member(uuid) to authenticated,service_role;
grant execute on function private.has_secretaria_permission(text,text) to authenticated,service_role;

alter table public.site_members enable row level security;
alter table public.site_member_permissions enable row level security;
alter table public.secretary_approval_requests enable row level security;
alter table public.secretary_notifications enable row level security;
alter table public.secretary_messages enable row level security;
alter table public.secretary_tasks enable row level security;
alter table public.secretary_audit_logs enable row level security;

revoke all on public.site_members,public.site_member_permissions,
 public.secretary_approval_requests,public.secretary_notifications,
 public.secretary_messages,public.secretary_tasks,public.secretary_audit_logs
from anon;
grant select on public.site_members,public.site_member_permissions,
 public.secretary_approval_requests,public.secretary_notifications,
 public.secretary_messages,public.secretary_tasks,public.secretary_audit_logs
to authenticated;
grant insert on public.secretary_tasks to authenticated;
grant update(read_at) on public.secretary_notifications,public.secretary_messages to authenticated;

create policy "secretaria_members_read_authorized"
on public.site_members for select to authenticated
using(user_id=(select auth.uid()) or private.is_secretaria_owner()
  or (role='owner' and status='active' and private.is_secretaria_member()));

create policy "secretaria_permissions_read_self_or_owner"
on public.site_member_permissions for select to authenticated
using(user_id=(select auth.uid()) or private.is_secretaria_owner());

create policy "secretaria_approvals_read_participant"
on public.secretary_approval_requests for select to authenticated
using(private.is_secretaria_owner() or requested_by=(select auth.uid()));

create policy "secretaria_notifications_read_recipient"
on public.secretary_notifications for select to authenticated
using(recipient_id=(select auth.uid()) and private.is_secretaria_member());

create policy "secretaria_notifications_mark_read"
on public.secretary_notifications for update to authenticated
using(recipient_id=(select auth.uid()) and private.is_secretaria_member())
with check(recipient_id=(select auth.uid()) and private.is_secretaria_member());

create policy "secretaria_messages_read_participant"
on public.secretary_messages for select to authenticated
using(private.is_secretaria_member()
 and (sender_id=(select auth.uid()) or recipient_id=(select auth.uid())));

create policy "secretaria_messages_mark_read"
on public.secretary_messages for update to authenticated
using(recipient_id=(select auth.uid()) and private.is_secretaria_member())
with check(recipient_id=(select auth.uid()) and private.is_secretaria_member());

create policy "secretaria_tasks_read_owner_or_participant"
on public.secretary_tasks for select to authenticated
using(private.is_secretaria_owner()
 or (private.is_secretaria_member()
   and (created_by=(select auth.uid()) or assigned_to=(select auth.uid()))));

create policy "secretaria_tasks_create_as_member"
on public.secretary_tasks for insert to authenticated
with check(created_by=(select auth.uid()) and private.is_secretaria_member()
 and (assigned_to is null or private.is_secretaria_active_member(assigned_to)));

create policy "secretaria_audit_read_owner_or_actor"
on public.secretary_audit_logs for select to authenticated
using(private.is_secretaria_owner()
 or (actor_id=(select auth.uid()) and private.is_secretaria_member()));

-- O histórico não pode ser forjado ou alterado por clientes.
revoke insert,update,delete on public.secretary_audit_logs from anon,authenticated;
revoke insert,update,delete on public.secretary_approval_requests from anon,authenticated;
revoke insert,update,delete on public.site_members,public.site_member_permissions from anon,authenticated;

-- O cliente só pode actualizar read_at nas suas próprias mensagens/notificações.
-- O envio de mensagens, gestão de membros e auditoria são feitos por Edge Functions.
alter publication supabase_realtime add table public.secretary_messages;
