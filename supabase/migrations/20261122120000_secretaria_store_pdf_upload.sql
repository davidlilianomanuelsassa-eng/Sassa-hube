-- Allow an active secretary with catalogue create/update permission to upload PDFs
-- into their own folder in the private store-files bucket.
drop policy if exists "Secretary can upload own catalogue PDFs" on storage.objects;
create policy "Secretary can upload own catalogue PDFs"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    private.has_secretaria_permission('catalog','create')
    or private.has_secretaria_permission('catalog','update')
  )
);
