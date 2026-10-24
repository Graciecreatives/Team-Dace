# Marketplace product photos

The product editor accepts phone-gallery/computer photos and has a separate camera picker. Browser camera support varies. JPEG, PNG and WebP are supported. HEIC must first be exported as JPEG. Raw uploaded files are never served.

The server verifies file signatures and dimensions, actually decodes pixels with a Worker-compatible WASM codec, applies EXIF orientation, resizes within 1600 × 1600, flattens transparency to white and re-encodes JPEG without EXIF/GPS metadata. Uploads are limited to 8 MiB and stored JPEGs to 4 MiB. Cloudflare inputs are additionally capped at 4 megapixels to bound Worker memory, while Node local inputs allow up to 40 megapixels. The picker prepares larger phone photos before uploading when supported, with errors shown rather than pretending an upload succeeded.

Photos are account-owned. Saving a product attaches the uploaded photo. Both product and storefront must be published before anyone else can fetch it. Draft/unused images are available only to their owner. The server checks publication again after reading object storage. Removing a photo from the form detaches it, but does not delete the stored object. Limits are 500 photos per account, ten upload attempts per minute, one concurrent cloud upload or two local uploads per isolate. Unused-photo garbage collection remains an operator responsibility. Obscure URLs are not access control.

## Cloudflare production

`FARMBUDDY_DATABASE=cloudflare` requires private R2 photo storage. `FARMBUDDY_IMAGES` is a binding to the `farmbuddy-products` bucket in `wrangler.jsonc`. No R2 API keys or public bucket URLs are sent to browsers. The bucket is private and no `r2.dev` access is enabled. Application routes enforce account and publication checks. Missing bindings or storage failures fail closed, with no local-disk fallback.

Upload and download requests go through the FarmBuddy backend. The stored object uses an account-hashed prefix and random image ID. Hosted photos can appear directly in published storefronts. Optional external HTTPS product images still require buyer opt-in before contacting that external host.

Provisioning, one-time snapshot migration and deployment are covered in `CLOUDFLARE.md`. JSON migration alone does not copy image blobs. The current installation had no saved image metadata at cutover. For another installation with local photos, preserve backups and explicitly migrate blobs or re-upload and save each affected product. Never relabel local metadata as cloud storage without copying the object.

## Local development

`npm run host` with local database/storage keeps files under `.data/uploads` beside `.data/farmbuddy.json`. `FARMBUDDY_UPLOAD_DIR` can override the directory. Back up both snapshot and uploads. Local files require persistent disk and one process. `npm run cf:dev` instead uses emulated D1 and R2 under `.wrangler/`, separate from remote resources.

## Verification

`node --test tests/product-images.test.js` checks actual decoding, orientation, metadata removal, input rejection, private R2 object access, ownership, publication and cross-farm attachment denial. Native sharp is a development-only fixture/verification dependency, not the production codec. `server/tests/cloudflare.mjs` exercises the built Worker, D1 connected business flow and actual local/remote R2 photos. Node restart coverage remains in `npm run test:production` after a Node build. Tests make no live AI/voice calls.
