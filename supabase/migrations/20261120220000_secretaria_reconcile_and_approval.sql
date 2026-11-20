-- Reconcile the core workspace with configurable task permissions and approval decisions.
drop index if exists public.one_secretary_assistant_only;
drop index if exists public.site_members_one_active_assistant;
create unique index site_members_one_active_assistant
  on public.site_members(role) where role='assistant' and status='active';

alter table public.site_members drop constraint if exists site_members_status_check;
alter table public.site_members add constraint site_members_status_check
  check (status in ('pending','active','suspended'));

alter table public.secretary_approval_requests add column if not exists executed_at timestamptz;
alter table public.secretary_approval_requests drop constraint if exists secretary_approval_requests_status_check;
alter table public.secretary_approval_requests add constraint secretary_approval_requests_status_check
  check(status in ('pending','approved','rejected','cancelled','executed','failed'));

alter table public.secretary_audit_logs alter column actor_id set not null;

drop policy if exists "secretaria_tasks_create_as_member" on public.secretary_tasks;
drop policy if exists secretary_tasks_insert_members on public.secretary_tasks;
drop policy if exists secretary_tasks_update_members on public.secretary_tasks;
create policy secretaria_tasks_create_with_permission
on public.secretary_tasks for insert to authenticated
with check (
  created_by=(select auth.uid())
  and private.has_secretaria_permission('tasks','create')
  and (assigned_to is null or private.is_secretaria_active_member(assigned_to))
);

grant update (title,description,due_at,status,assigned_to,updated_at)
on public.secretary_tasks to authenticated;
create policy secretaria_tasks_update_with_permission
on public.secretary_tasks for update to authenticated
using (
  private.is_secretaria_owner()
  or (private.has_secretaria_permission('tasks','update')
      and (created_by=(select auth.uid()) or assigned_to=(select auth.uid())))
)
with check (
  private.is_secretaria_owner()
  or (private.has_secretaria_permission('tasks','update')
      and (created_by=(select auth.uid()) or assigned_to=(select auth.uid()))
      and (assigned_to is null or private.is_secretaria_active_member(assigned_to)))
);

create or replace function public.review_secretary_approval(
  p_approval_id uuid,
  p_decision text,
  p_review_note text,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.secretary_approval_requests%rowtype;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;
  if not exists(
    select 1 from public.site_members
    where user_id=p_actor_id and role='owner' and status='active'
  ) then
    raise exception 'Owner required';
  end if;

  update public.secretary_approval_requests
  set status=p_decision,
      reviewed_by=p_actor_id,
      reviewed_at=now(),
      review_note=left(coalesce(p_review_note,''),1000)
  where id=p_approval_id and status='pending'
  returning * into v_request;

  if not found then
    raise exception 'Request not pending';
  end if;

  insert into public.secretary_notifications(
    recipient_id,notification_type,title,body,href
  ) values (
    v_request.requested_by,
    'approval_decision',
    'Pedido analisado',
    'O proprietário '||case when p_decision='approved' then 'aprovou' else 'rejeitou' end||
      ' o teu pedido. Consulta o Campo da Secretaria.',
    'secretaria.html'
  );

  insert into public.secretary_audit_logs(
    actor_id,action,target_type,target_id,details
  ) values (
    p_actor_id,
    'secretary_approval_'||p_decision,
    'approval_request',
    p_approval_id::text,
    jsonb_build_object('requested_by',v_request.requested_by)
  );

  return p_approval_id;
end;
$$;

revoke all on function public.review_secretary_approval(uuid,text,text,uuid)
from public,anon,authenticated;
grant execute on function public.review_secretary_approval(uuid,text,text,uuid)
to service_role;

grant all on public.site_members,public.site_member_permissions,
  public.secretary_approval_requests,public.secretary_notifications,
  public.secretary_messages,public.secretary_tasks,public.secretary_audit_logs
to service_role;
grant usage,select on sequence public.secretary_audit_logs_id_seq to service_role;
