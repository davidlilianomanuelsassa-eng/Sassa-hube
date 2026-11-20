-- Extend moderate assistant permissions to selected existing SASSA HUBE modules.
-- This migration assumes the private-core migration has been applied first.

-- Task owners/assignees may update workflow fields; no delete is granted.
grant update (title, description, due_at, status, assigned_to, updated_at)
on public.secretary_tasks to authenticated;

create policy "secretaria_tasks_update_owner_or_participant"
on public.secretary_tasks for update to authenticated
using (
  public.is_secretaria_owner()
  or (
    public.is_secretaria_member()
    and (created_by = auth.uid() or assigned_to = auth.uid())
  )
)
with check (
  public.is_secretaria_owner()
  or (
    public.is_secretaria_member()
    and (created_by = auth.uid() or assigned_to = auth.uid())
    and (assigned_to is null or public.is_secretaria_active_member(assigned_to))
  )
);

-- Content creation and editing are explicit permission grants.
create policy "secretaria_assistant_create_store_products"
on public.store_products for insert to authenticated
with check (public.has_secretaria_permission('catalog','create'));

create policy "secretaria_assistant_update_store_products"
on public.store_products for update to authenticated
using (
  public.has_secretaria_permission('catalog','update')
  or public.has_secretaria_permission('catalog','publish')
)
with check (
  public.has_secretaria_permission('catalog','update')
  or public.has_secretaria_permission('catalog','publish')
);

create policy "secretaria_assistant_read_store_orders"
on public.store_orders for select to authenticated
using (public.has_secretaria_permission('orders','read'));

create policy "secretaria_assistant_create_works"
on public.works for insert to authenticated
with check (public.has_secretaria_permission('publications','create'));

create policy "secretaria_assistant_update_works"
on public.works for update to authenticated
using (
  public.has_secretaria_permission('publications','update')
  or public.has_secretaria_permission('publications','publish')
)
with check (
  public.has_secretaria_permission('publications','update')
  or public.has_secretaria_permission('publications','publish')
);

create policy "secretaria_assistant_read_questions"
on public.site_questions for select to authenticated
using (public.has_secretaria_permission('questions','read'));

-- Answers are written through a future server-side action, not unrestricted row updates.
-- No assistant DELETE policy is added for products, publications, orders, or questions.
