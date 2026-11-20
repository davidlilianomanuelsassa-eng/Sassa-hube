-- Restrict default table grants on the secretary workspace.
-- RLS remains the row-level boundary; SQL privileges are narrowed as defense in depth.
revoke all privileges on table
  public.site_members,
  public.site_member_permissions,
  public.secretary_approval_requests,
  public.secretary_notifications,
  public.secretary_messages,
  public.secretary_tasks,
  public.secretary_audit_logs
from authenticated;

revoke update (read_at) on public.secretary_notifications,public.secretary_messages from authenticated;
revoke update (title,description,due_at,status,assigned_to,updated_at) on public.secretary_tasks from authenticated;

grant select on
  public.site_members,
  public.site_member_permissions,
  public.secretary_approval_requests,
  public.secretary_notifications,
  public.secretary_messages,
  public.secretary_tasks,
  public.secretary_audit_logs
to authenticated;

grant insert on public.secretary_tasks to authenticated;
grant update (read_at) on public.secretary_notifications,public.secretary_messages to authenticated;
grant update (title,description,due_at,status,assigned_to,updated_at)
on public.secretary_tasks to authenticated;
