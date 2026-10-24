# Cloudflare deployment and operations

FarmBuddy runs as a full-stack **Cloudflare Worker**, with **D1** application data and **private R2** product images. Authentication is application-owned email/password plus opaque HttpOnly sessions stored in D1, not a separate managed authentication service. OpenRouter, YarnGPT and OpenWeather remain external optional providers. No database passwords, public database SDK, R2 access keys or old provider credentials are needed.

## Provisioned resources

`wrangler.jsonc` contains the selected account and resource IDs:

- Worker: `farmbuddy`
- Live site: https://farmbuddy.oladapo.workers.dev
- Verified deployment version: `3bb3576d-ed82-4ebd-bf4c-c574221f59e1` (October 24, 2026)
- D1 database: `farmbuddy-db`, binding `FARMBUDDY_DB`
- Private R2 bucket: `farmbuddy-products`, binding `FARMBUDDY_IMAGES`
- Static site assets: `ASSETS`, bundled from `.output/public`

The R2 bucket must remain private. Downloads are authorized by FarmBuddy, not a public bucket URL. No custom domain/DNS record is changed automatically. The deployed Workers URL is printed by Wrangler. Other accounts must create their own resources and replace the IDs before deployment.

## Commands

```sh
npm install
# Normal Node development, local JSON and local image files
npm run host
# Cloudflare build and local workerd with emulated D1/R2, port 8787
npm run cf:dev
# Build for Workers and deploy the full app with its static assets
npm run cf:deploy
# Generate optional TypeScript binding declarations
npm run cf:types
```

Stop Nuxt dev and Wrangler dev before rebuilding because builds share `.nuxt` and `.output`. `npm run build` remains a Node build for packaged regression tests. Use `npm run build:cloudflare` immediately before Wrangler preview/deployment. `npm run cf:dev` prepares private `.dev.vars` using only allowed provider keys, avoiding accidental import of unrelated `.env` settings. Local D1/R2 state is under git-ignored `.wrangler/` and is separate from the remote production database.

## D1 initialization and safe migration

Schema is explicit, never created by a web request. A missing/uninitialized binding fails closed, with no fallback to local files. Stop existing local writers, make a private backup, and preserve the original until after cutover verification. Do not run local and cloud writers expecting synchronization.

```sh
# Safe to reapply: creates a NULL sentinel only when no state row exists.
npx wrangler d1 execute farmbuddy-db --remote --file=server/database/schema.sql
# Validate and prepare a private one-time import, without contacting Cloudflare.
node scripts/cloudflare-database.mjs import --file=.data/farmbuddy.json --out=.data/import.sql
# Explicitly upload and apply the private SQL file. Never commit it.
npx wrangler d1 execute farmbuddy-db --remote --file=.data/import.sql
```

The import refuses an already initialized destination, even an empty initialized snapshot. There is no force/overwrite flag. Do not delete production state to bypass this guard. Investigate a refused import. For a genuinely new installation only, replace `import --file=...` with `init-empty`. For local Worker previews, use the same commands with `--local` instead of `--remote` and a separate private SQL output filename. SQL output is created exclusively with mode 0600, and may contain password hashes and personal data. Keep it private. Repeated filenames are refused rather than overwritten.

The October 24 cutover backup is `.data/farmbuddy.pre-cloudflare-20261024.json`. The original local snapshot is not removed. Existing local account IDs, password hashes, records and ownership are preserved. There were no product image blobs in the local snapshot at cutover. Imports from another installation containing local image metadata require an explicit private image-copy migration or re-upload before publication. Never silently relabel local image metadata as R2 objects.

### Persistence boundaries

The current adapter preserves the existing versioned JSON snapshot, with an explicit **1,000,000-byte global snapshot limit**, not one megabyte per farmer. Each write uses a primary-session revision compare-and-swap. Conflicts rerun pure callbacks up to eight attempts. Compound harvest, stock, sales and bookkeeping changes commit together. Callback/domain failures do not commit. Ambiguous transport failures are not automatically replayed. External side effects must stay outside callbacks.

This is a compatibility adapter for the current small installation, not a normalized unlimited farm database. Every write replaces the whole snapshot, and contention/size exhaustion fails visibly. Normalize tables before significant account/history growth. Set up retention, monitoring, recovery and private exports. Never log snapshots or hashes. D1 is bound only to the backend, with no browser SQL endpoint.

## Authentication

Registration/login create opaque random sessions. Only token digests are stored. Cookies are HttpOnly, SameSite=Lax and Secure in production. CSRF, account ownership and workspace-role checks remain enforced. Legacy passwords are verified without resets and upgraded only after successful verification. Missing configuration must not silently switch databases. There is no email verification, password recovery, MFA, social login or email delivery integration. Do not advertise those features as available. Login uses the same credentials as the migrated local account, not a Cloudflare dashboard password.

## Provider secrets

Fill `.env` privately using `.env.example`, then:

```sh
npm run cf:secrets
# Explicitly upload nonempty allowed keys to the deployed Worker
npm run cf:secrets -- --apply
```

Only `OPENROUTER_API_KEY`, `YARNGPT_API_KEY`, `YARNGPT_VOICE` and `OPENWEATHER_API_KEY` are uploaded. Values are not printed or passed in command-line arguments. Empty keys are not uploaded and do not delete existing remote secrets. Update `OPENROUTER_MODEL` in `wrangler.jsonc` for production. Without keys, the app accurately reports unavailable live AI/voice/weather rather than fabricating responses. No live paid inference is performed by tests. Set provider budgets yourself.

Wrangler uses the existing local OAuth login. CI can use a scoped `CLOUDFLARE_API_TOKEN` in its private secret store. Never put it in public runtime config or commit it. Resource creation did not enable a paid plan, but usage remains subject to your account plan and provider billing. No payment, SMS or invitation-email service is provisioned.

## Photos and runtime limits

Worker photos use a WASM image codec, not native sharp. The `cloudflare/worker.mjs` entry bounds request bodies before Nitro buffers them, including chunked uploads. API readers also enforce their own limits on Node streams and Nitro's buffered Worker input. Inputs are actually decoded, oriented, resized and re-encoded to remove EXIF/GPS metadata. Workers limit input resolution to 4 megapixels to bound memory. The phone picker compresses larger images before uploading when supported. See `PRODUCT_PHOTOS.md` for current picker behavior and privacy. R2 object data is served only through owner/published-product checks.

## Verification

The October 24 cutover passed the complete Node regression suite (119 tests plus the native Workers crypto check), Node production build/restart checks, Cloudflare build, and actual local workerd and deployed HTTPS acceptance. Live acceptance covered registration/login and Secure cookies, CSRF rejection, harvest → stock → sale → bookkeeping with replay deduplication, real R2 upload with WASM JPEG orientation/metadata stripping, private/public/unpublished photo visibility, and persisted login data. The two original account objects were compared against the private pre-cutover backup and remained unchanged. Only the exact disposable QA account, its records and its R2 photo were removed. Browser checks confirmed the deployed homepage and login form render without the obsolete setup banner.

Provider secret inspection found no configured nonempty AI, voice or weather keys. These integrations remain unavailable until valid keys are filled and explicitly uploaded. Tests did not call paid inference providers. The intentional corrupt-store regression cases log `Invalid FarmBuddy store` while asserting fail-closed behavior. Those messages are expected during the passing test suite, not evidence that the production database is corrupt.

```sh
npm test
npm run test:database
npm run build && npm run test:production
npm run build:cloudflare
npx wrangler deploy --dry-run
# With wrangler dev running against disposable local D1/R2:
npm run test:cloudflare
node scripts/cloudflare-smoke-cleanup.mjs
node scripts/cloudflare-smoke-cleanup.mjs --apply
```

Node regression tests are isolated from real provider credentials/data. Actual local Worker and deployed HTTPS behavior must also be checked, especially password crypto, D1 persistence, R2 upload/download, phone image limits and public-storefront privacy. In-memory auth/upload/provider rate limits are per-isolate, not a distributed abuse-defense service. Add production account-level monitoring and appropriately scoped Cloudflare rate controls before broad public rollout.
