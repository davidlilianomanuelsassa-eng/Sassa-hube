-- Make the audit stream append-only for application users.
revoke insert, update, delete on public.secretary_audit_logs from authenticated, anon;
drop policy if exists "secretaria_audit_insert_as_actor" on public.secretary_audit_logs;

create or replace function public.log_secretary_task_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return coalesce(new,old);
  end if;
  insert into public.secretary_audit_logs(actor_id,action,target_type,target_id,details)
  values (
    v_actor,
    case when tg_op='INSERT' then 'task_created' else 'task_updated' end,
    'task',
    coalesce(new.id,old.id)::text,
    jsonb_build_object('status',coalesce(new.status,old.status))
  );
  return coalesce(new,old);
end;
$$;
revoke all on function public.log_secretary_task_change() from public,anon,authenticated;

drop trigger if exists secretary_tasks_audit on public.secretary_tasks;
create trigger secretary_tasks_audit
after insert or update on public.secretary_tasks
for each row execute function public.log_secretary_task_change();

-- The owner and assistant may only read their own private task/notification data.
