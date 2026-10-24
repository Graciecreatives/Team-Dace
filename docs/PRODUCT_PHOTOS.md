# Marketplace product photos

The product editor now accepts photos from a phone gallery/computer and offers a separate camera picker. A browser decides whether its camera picker is available. JPEG, PNG and WebP inputs up to 8 MB and 40 megapixels are decoded server-side with sharp, rotated according to orientation, resized within 1600 × 1600 and saved as JPEG. EXIF/GPS metadata is stripped. HEIC must first be exported as JPEG. Raw uploaded files are never served.

Uploads are account-owned. Save the product to attach its uploaded photo. Both the product and storefront must be published before anyone else can fetch the image. Draft/unused images are available only to their owner. Removing a photo from the form detaches it, it does not delete the stored file. There is a 500-photo account limit, ten attempts per minute and two concurrent server uploads. Unused-photo garbage collection is not implemented, so storage lifecycle/administrative cleanup remains an operator responsibility. Do not treat obscure image URLs as access control.

## Local development

With local database mode and no Supabase storage configuration, files live in `.data/uploads` beside the JSON snapshot. `FARMBUDDY_UPLOAD_DIR` can override the directory. Back up BOTH the JSON snapshot and uploads. Local files require persistent disk and are not suitable for multi-instance or ephemeral production hosting.

## Supabase production

1. Provision the database and import existing account/feature data using `docs/SUPABASE_DATABASE.md`. This does not migrate image blobs.
2. Review and run `supabase/product-images.sql` in your project's SQL editor. It creates a **private** `farm-products` bucket and restricts browser-role access to its objects. It refuses an already-public bucket rather than altering existing data. Keep that bucket private. If you use a custom bucket, adapt the SQL and policies deliberately.
3. Set server-only `SUPABASE_URL` to your project HTTPS origin, `SUPABASE_SERVICE_ROLE_KEY` to its private service-role key, and `SUPABASE_STORAGE_BUCKET=farm-products`. This service key is NOT the public anon key and is different from `SUPABASE_DATABASE_URL`. Never expose it in NUXT_PUBLIC config, the browser, Git or chat.
4. Set `FARMBUDDY_DATABASE=supabase`. Photo storage automatically uses Supabase. A local image-storage override is refused with a Supabase database. Missing credentials, public buckets and storage outages fail closed without writing local replacements.
5. Restart the server, upload a disposable photo, confirm owner-only preview, publish a test product/storefront, and confirm public viewing. Unpublish and confirm public access is denied. Validate this against your own cloud project before rollout.

Uploads and downloads go through bounded server-side Storage requests and the application authorization layer. No service-role key or signed storage URL is returned to clients. Hosted product photos load directly on public storefronts. External HTTPS images remain optional and require the buyer's opt-in before the browser requests them.

**Cutover:** importing JSON preserves photo metadata but does not copy local image files into Storage. Old local photos deliberately cannot be served in Supabase mode. Re-upload those photos after cutover and save the affected products, while preserving private local backups. Do not delete old files or switch providers expecting automatic synchronization.

## Verification

`node --test tests/product-images.test.js` covers real decoding/orientation/metadata removal, input rejection, safe private Storage requests with mocked networking, ownership, publication privacy and cross-farm attachment denial. `npm run test:production` after building checks upload packaging and photo persistence across a real server restart. No paid/live cloud requests are made by these tests.
