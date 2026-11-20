-- Permission-scoped access to existing SASSA HUBE content modules.
-- The core migration must be applied first.

grant update (title, description, due_at, status, assigned_to, updated_at)
on public.secretary_tasks to authenticated;

create policy secretaria_assistant_read_store_products
on public.store_products for select to authenticated
using (
  active = true
  or private.has_secretaria_permission('catalog','read')
);

create policy secretaria_assistant_create_store_products
on public.store_products for insert to authenticated
with check (private.has_secretaria_permission('catalog','create'));

create policy secretaria_assistant_update_store_products
on public.store_products for update to authenticated
using (
  private.has_secretaria_permission('catalog','update')
  or private.has_secretaria_permission('catalog','publish')
)
with check (
  private.has_secretaria_permission('catalog','update')
  or private.has_secretaria_permission('catalog','publish')
);

create policy secretaria_assistant_read_store_orders
on public.store_orders for select to authenticated
using (private.has_secretaria_permission('orders','read'));

create policy secretaria_assistant_create_works
on public.works for insert to authenticated
with check (private.has_secretaria_permission('publications','create'));

create policy secretaria_assistant_update_works
on public.works for update to authenticated
using (
  private.has_secretaria_permission('publications','update')
  or private.has_secretaria_permission('publications','publish')
)
with check (
  private.has_secretaria_permission('publications','update')
  or private.has_secretaria_permission('publications','publish')
);

create policy secretaria_assistant_read_questions
on public.site_questions for select to authenticated
using (private.has_secretaria_permission('questions','read'));

-- No assistant DELETE policy is added for products, publications, orders, or questions.
