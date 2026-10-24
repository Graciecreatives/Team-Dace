# FarmBuddy backend

**Storage selection:** the local-file details below apply only to `FARMBUDDY_DATABASE=local`. Supabase PostgreSQL is supported through a private transactional snapshot adapter. For production explicitly select `FARMBUDDY_DATABASE=supabase`, provision and safely import using `docs/SUPABASE_DATABASE.md`. Product phone-photo storage and cloud cutover are covered in `docs/PRODUCT_PHOTOS.md`. Authentication can separately use Supabase Auth with `FARMBUDDY_AUTH=supabase`, see `docs/SUPABASE_AUTH.md` for configuration and non-automatic existing-account migration.

Run with `npm run dev` or `npm run host` for LAN previews, or `npm run build` followed by `node .output/server/index.mjs`. Local core features need no external services. Supabase, OpenRouter and YarnGPT features need private server configuration. The API creates no demo data.

## Contracts

All bodies below are JSON objects (`Content-Type: application/json`). Successful responses are HTTP 200. Errors use H3's JSON error envelope with `statusCode` and `statusMessage`.

| Method | Endpoint | Input | Response |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{name,email,password,farmName?,farmType?}` | `{user}` and session cookie |
| POST | `/api/auth/login` | `{email,password}` | `{user}` and session cookie |
| GET | `/api/auth/me` | none | `{user}` or 401 |
| POST | `/api/auth/logout` | none | `{ok:true}` and cleared cookie |
| PATCH | `/api/farm/profile` | `{farmName,farmType,onboardingCompleted:true,location?,mainEnterprises?,preferredLanguage?}` | `{user}` |
| GET | `/api/farm` | none | `{records:[],reminders:[]}` for current user |
| POST | `/api/farm/records` | `{title,category,amount?,note?}` | `{record}` |
| DELETE | `/api/farm/records/:id` | none | `{ok:true}` |
| POST | `/api/farm/reminders` | `{title,date}` | `{reminder}` |
| PATCH | `/api/farm/reminders/:id` | `{completed:boolean}` | `{reminder}` |

`user` is exactly `{id,name,email,farmName,farmType,onboardingCompleted,location,mainEnterprises,preferredLanguage}`. Optional text fields default to empty strings. Registration always creates `onboardingCompleted:false`. Existing accounts without the flag are exposed as incomplete, with no destructive migration. Email is trimmed and lowercased. Passwords are not trimmed.

`PATCH /api/farm/profile` requires an authenticated session and same-origin JSON mutation protections. It updates only the session owner's profile atomically. Required fields are nonblank `farmName` (maximum 150 characters), `farmType` (`crops`, `livestock`, or `mixed`, with legacy `poultry` accepted and persisted as `livestock`), and the literal boolean `onboardingCompleted:true`. Optional plain-text strings are `location` (200 characters), `mainEnterprises` (500), and `preferredLanguage` (80). Limits apply before trimming. Text is trimmed, angle brackets and control characters are rejected, omitted optional fields preserve stored values, and empty optional strings clear values. Nulls, nonstrings, unknown fields, invalid types, missing required fields, and any completion value other than true return 400. Unauthenticated requests return 401 before body parsing. Success is 200 `{user}` with the persisted public profile. No user ID, email, or ownership field is accepted. Language is profile metadata, not an app translation setting.

Login and registration route incomplete users to `/onboarding`. Completed crops users go to `/dashboard/crops`, livestock (including legacy poultry) to `/dashboard/livestock`, and mixed users to `/dashboard`. Onboarding checks `/api/auth/me` on entry and redirects completed users to the same authoritative destination.

`record` is `{id,title,category,amount,note,createdAt}`. Categories are `income`, `expense`, or `activity`. Omitted amount is `null`, supplied amount must be a finite number from 0 through 1e12. Omitted note defaults to an empty string. `createdAt` is an ISO timestamp.

`reminder` is `{id,title,date,completed}`. Dates must be real calendar dates formatted `YYYY-MM-DD`, years 0001 through 9999. Completion defaults to false. Farm endpoints require authentication. Other users' resource IDs return 404, and ownership is never accepted from request bodies.

## Security and limits

- Built-in Node scrypt uses independent 16-byte random salts, N=16384, r=8, p=1, and 64-byte hashes. Passwords are 8-256 characters at registration. Login uses constant-time hash comparison and a dummy scrypt for unknown emails.
- Sessions use 32-byte random tokens, with only SHA-256 token digests persisted. They expire after seven days, with at most ten live sessions per account. Login/register rotate the session represented by the incoming cookie. Logout is idempotent and revokes the incoming session.
- Cookies use HttpOnly, SameSite=Lax, Path=/, and Secure when `NODE_ENV=production`. Production requires HTTPS. Never expose a production deployment over plain HTTP.
- Mutations reject cross-site Fetch Metadata and reject supplied Origin values unless their scheme/host/port match the request Host and expected scheme. Non-browser clients may omit Origin. Forwarded host/protocol headers are not trusted. A TLS-terminating proxy must preserve the public Host, sanitize incoming headers, and restrict accepted public hosts. Do not expose the backend behind a proxy that rewrites Host to an internal name.
- JSON bodies are limited to 16 KiB, including streamed bodies. Name is capped at 100 characters, email 254, farmName 150, farmType 100, title 200, and note 2000. Invalid values return 400, oversized bodies 413, and non-JSON bodies 415.
- Register/login share a per-socket-IP limit of 20 attempts per 15 minutes, including successful attempts. The in-memory limiter holds at most 10,000 IPs and allows at most four concurrent scrypt operations. It returns 429 when busy. It deliberately ignores spoofable forwarding headers. Behind a proxy, clients may share a bucket. Limits reset on restart and are not distributed.
- API responses are marked `Cache-Control: no-store`. No password recovery, email verification, MFA, or account deletion is provided.

## Persistence operations and limitations

Default storage is `.data/farmbuddy.json` relative to the process working directory. `.data/` is git-ignored. Set `FARMBUDDY_DATA_FILE` to a dedicated absolute file path to override it, especially in tests. Keep custom paths out of version control and use a private directory. New directories use mode 0700 and new files use 0600, subject to platform semantics.

All reads and read-modify-write mutations are queued within one process. Writes use a unique same-directory temporary file followed by atomic rename. Invalid existing JSON fails closed instead of silently resetting accounts. Failed mutations do not replace the store. Expired sessions are rejected on every authenticated request and pruned during login, registration, and logout.

**Run exactly one Node process against one store.** There is no cross-process lock, clustering support, shared/network-filesystem guarantee, or distributed throttling. Never point multiple workers or replicas at the same file. Every request reads the entire file, and each mutation rewrites it. Account and farm history growth is not globally capped. This is for modest local workloads, not a scalable production database. Storage contains personal data and password hashes without encryption at rest. Restrict filesystem access and use disk encryption if appropriate.

Atomic rename prevents partially written JSON during ordinary failures, but writes are not fsynced and do not promise durability across power loss. Back up the file securely, preferably while the server is stopped, and test restores. A crash may leave a private `.tmp` file beside the store, which can be removed while the server is stopped. Ephemeral/serverless filesystems lose data on redeploy or restart, so use a durable local volume and fixed working directory. Migrate to a transactional database before multi-instance deployment or significant growth.

## Validation

Run `node server/tests/integration.mjs` from the repository root. It starts a real local HTTP listener with the API handler, creates temporary isolated storage, exercises both accounts and concurrent mutations, inspects stored secrets, verifies persistence in a separate process, and cleans up afterward. No real account data is read or modified. The suite also checks production cookie flags, invalid inputs/dates, cross-origin denials, cross-user denials, session rotation/expiration/logout, corrupt storage, and throttling. `npm run build` additionally checks Nuxt/Nitro packaging. After building, run `node server/tests/production.mjs` to check the packaged Nitro server and verify that both the session and farm records survive a full server-process restart using temporary storage.
