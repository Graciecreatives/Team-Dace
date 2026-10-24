-- Run in your Supabase SQL editor after reviewing. No public upload/read policy is created.
-- Existing buckets are never modified silently.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('farm-products', 'farm-products', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'farm-products' and public = true) then
    raise exception 'farm-products already exists as public. Make it private before using FarmBuddy photos.';
  end if;
  -- Restrictive policy prevents broad existing app policies from granting browser access.
  -- The server-only service_role key bypasses RLS and must never be exposed to clients.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'farmbuddy_private_product_photos') then
    create policy farmbuddy_private_product_photos on storage.objects
      as restrictive for all to anon, authenticated
      using (bucket_id <> 'farm-products')
      with check (bucket_id <> 'farm-products');
  end if;
end $$;
