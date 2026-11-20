-- Core private workspace for SASSA HUBE's owner and one assistant.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists public.site_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','assistant')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists site_members_one_active_assistant
  on public.site_members(role) where role='assistant' and status='active';

insert into public.site_members(user_id,role,status)
select user_id,'owner','active' from public.site_admins
on conflict (user_id) do nothing;

create table if not exists public.site_member_permissions (
  user_id uuid not null references public.site_members(user_id) on delete cascade,
  module text not null,
  action text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(user_id,module,action)
);

create table if not exists public.secretary_approval_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete restrict,
  action_key text not null,
  resource_type text not null,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.secretary_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
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
  constraint secretary_messages_distinct_participants check(sender_id <> recipient_id)
);

create table if not exists public.secretary_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(title) between 1 and 180),
  description text not null default '',
  due_at timestamptz,
  status text not null default 'open' check(status in ('open','in_progress','blocked','done','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.secretary_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists secretary_messages_pair_created
  on public.secretary_messages(sender_id,recipient_id,created_at);
create index if not exists secretary_notifications_recipient_created
  on public.secretary_notifications(recipient_id,created_at desc);
create index if not exists secretary_tasks_created
  on public.secretary_tasks(created_at desc);
create index if not exists secretary_approval_requests_status_created
  on public.secretary_approval_requests(status,created_at desc);
create index if not exists secretary_audit_logs_created
  on public.secretary_audit_logs(created_at desc);

create or replace function private.is_secretaria_member()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
  select exists(select 1 from public.site_members m
    where m.user_id=auth.uid() and m.status='active');
$$;

create or replace function private.is_secretaria_owner()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
  select exists(select 1 from public.site_members m
    where m.user_id=auth.uid() and m.role='owner' and m.status='active');
$$;

create or replace function private.is_secretaria_active_member(p_user_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
  select exists(select 1 from public.site_members m
    where m.user_id=p_user_id and m.status='active');
$$;

create or replace function private.has_secretaria_permission(p_module text,p_action text)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
  select private.is_secretaria_owner()
    or (
      private.is_secretaria_member()
      and exists(select 1 from public.site_member_permissions p
        where p.user_id=auth.uid() and p.module=p_module and p.action=p_action)
    );
$$;

revoke all on all functions in schema private from public,anon;
grant execute on function private.is_secretaria_member() to authenticated,service_role;
grant execute on function private.is_secretaria_owner() to authenticated,service_role;
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
from anon,public;
grant select on public.site_members,public.site_member_permissions,
  public.secretary_approval_requests,public.secretary_notifications,
  public.secretary_messages,public.secretary_tasks,public.secretary_audit_logs
to authenticated;
grant insert on public.secretary_tasks to authenticated;
grant update (read_at) on public.secretary_notifications,public.secretary_messages to authenticated;
grant all on public.site_members,public.site_member_permissions,
  public.secretary_approval_requests,public.secretary_notifications,
  public.secretary_messages,public.secretary_tasks,public.secretary_audit_logs
to service_role;
grant usage,select on sequence public.secretary_audit_logs_id_seq to service_role;

create policy site_members_select_self_or_owner on public.site_members
for select to authenticated
using(user_id=auth.uid() or private.is_secretaria_owner());

create policy site_member_permissions_select_self_or_owner on public.site_member_permissions
for select to authenticated
using(user_id=auth.uid() or private.is_secretaria_owner());

create policy secretary_approvals_select_participants on public.secretary_approval_requests
for select to authenticated
using(private.is_secretaria_owner() or requested_by=auth.uid());

create policy secretary_notifications_select_recipient on public.secretary_notifications
for select to authenticated using(recipient_id=auth.uid() and private.is_secretaria_member());
create policy secretary_notifications_mark_read on public.secretary_notifications
for update to authenticated using(recipient_id=auth.uid() and private.is_secretaria_member())
with check(recipient_id=auth.uid() and private.is_secretaria_member());

create policy secretary_messages_select_participants on public.secretary_messages
for select to authenticated
using(
  private.is_secretaria_member()
  and (sender_id=auth.uid() or recipient_id=auth.uid())
);
create policy secretary_messages_mark_read on public.secretary_messages
for update to authenticated
using(recipient_id=auth.uid() and private.is_secretaria_member())
with check(recipient_id=auth.uid() and private.is_secretaria_member());

create policy secretary_tasks_select_members on public.secretary_tasks
for select to authenticated
using(private.is_secretaria_owner() or created_by=auth.uid() or assigned_to=auth.uid());
create policy secretary_tasks_insert_members on public.secretary_tasks
for insert to authenticated
with check(private.is_secretaria_member() and created_by=auth.uid());
create policy secretary_tasks_update_members on public.secretary_tasks
for update to authenticated
using(private.is_secretaria_owner() or (private.is_secretaria_member() and (created_by=auth.uid() or assigned_to=auth.uid())))
with check(private.is_secretaria_owner() or (private.is_secretaria_member() and (created_by=auth.uid() or assigned_to=auth.uid())));

create policy secretary_audit_select_owner_or_actor on public.secretary_audit_logs
for select to authenticated
using(private.is_secretaria_owner() or actor_id=auth.uid());

create or replace function public.review_secretary_approval(
  p_approval_id uuid,p_decision text,p_review_note text,p_actor_id uuid
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp
as $$
declare v_request public.secretary_approval_requests%rowtype;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;
  -- This RPC is executable only by service_role; the Edge Function supplies the verified actor.
  if not exists(select 1 from public.site_members
    where user_id=p_actor_id and role='owner' and status='active') then
    raise exception 'Owner required';
  end if;
  update public.secretary_approval_requests
    set status=p_decision,reviewed_by=p_actor_id,reviewed_at=now(),
        review_note=left(coalesce(p_review_note,''),1000)
    where id=p_approval_id and status='pending'
    returning * into v_request;
  if not found then raise exception 'Request not pending'; end if;
  insert into public.secretary_notifications(recipient_id,notification_type,title,body,href)
  values(v_request.requested_by,'approval_decision','Pedido analisado',
    'O proprietário '+case when p_decision='approved' then 'aprovou' else 'rejeitou' end+
    ' o teu pedido. Consulta o Campo da Secretaria.','secretaria.html');
  insert into public.secretary_audit_logs(actor_id,action,target_type,target_id,details)
  values(p_actor_id,'secretary_approval_'+p_decision,'approval_request',p_approval_id::text,
    jsonb_build_object('requested_by',v_request.requested_by));
  return p_approval_id;
end;
$$;
revoke all on function public.review_secretary_approval(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.review_secretary_approval(uuid,text,text,uuid) to service_role;

-- Realtime is enabled only for the private chat table.
do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='secretary_messages'
  ) then
    alter publication supabase_realtime add table public.secretary_messages;
  end if;
end $$;
