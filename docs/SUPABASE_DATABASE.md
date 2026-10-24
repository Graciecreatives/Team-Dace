# Supabase PostgreSQL persistence

FarmBuddy retains its existing `store(callback, mutate)` API. Authentication is selected separately: `FARMBUDDY_AUTH=supabase` uses Supabase email/password Auth, while `local` preserves legacy development accounts. See `docs/SUPABASE_AUTH.md` before switching existing users. PostgreSQL holds one versioned JSONB application snapshot in `farmbuddy_private.app_state`, not a normalized rewrite of every feature.

## Choose a backend

Set server-only environment variables through your deployment's secret manager:

- `FARMBUDDY_DATABASE=supabase` selects PostgreSQL and requires `SUPABASE_DATABASE_URL`.
- `SUPABASE_DATABASE_URL` is the PostgreSQL connection URI from Supabase's Connect panel, **not** the project HTTPS URL, anon key, or service-role API key.
- `FARMBUDDY_DATABASE=local` explicitly selects the existing JSON file backend. Its path remains `FARMBUDDY_DATA_FILE` (default `.data/farmbuddy.json`).
- If the mode is omitted, a present database URL selects Supabase. Without a URL the default is local for development. Invalid modes and missing required credentials fail closed.

**Production: explicitly set `FARMBUDDY_DATABASE=supabase`.** Do not rely on automatic selection: a missing deployment secret without an explicit mode intentionally selects development-local storage. Never use the file backend on ephemeral or multiple-instance production hosting. Restart the server after changing backend/credentials. A Supabase failure, missing schema, uninitialized state, invalid snapshot or invalid credentials never reads/writes the local file or creates a replacement empty database.

The server uses the `postgres` npm driver. TLS certificate and hostname verification are required (`rejectUnauthorized: true`), including when the connection URI contains weaker TLS flags. Do not disable certificate verification. Configure trusted system CAs through your platform/Node trust configuration where needed. Keep database credentials out of client/public runtime config, logs and source control.

## Explicit provisioning and migration

No application startup request creates schema, initializes state or imports local files. Run these commands from the repository root using a trusted operator environment with `SUPABASE_DATABASE_URL` already configured. The schema command needs a schema/table-owning database role, such as the Supabase connection owner. Review `server/database/schema.sql` before applying it.

1. Stop local-file application writers and make a private backup of the existing JSON file. Preserve it through cutover. Do not run local and PostgreSQL writers in parallel expecting synchronization.
2. Preview schema setup, then provision explicitly:

   ```sh
   node scripts/supabase-database.mjs schema
   node scripts/supabase-database.mjs schema --apply
   ```

3. Import an existing file, **or** deliberately initialize a new installation. Never run `init-empty` before importing an existing file:

   ```sh
   # No database connection and no writes, validates the source locally.
   node scripts/supabase-database.mjs import --file=.data/farmbuddy.json --dry-run
   # Explicit one-time data import.
   node scripts/supabase-database.mjs import --file=.data/farmbuddy.json --apply

   # Alternative only for a genuinely NEW installation:
   node scripts/supabase-database.mjs init-empty --apply
   ```

4. Deploy with explicit Supabase mode. Verify sign-in, existing records and a new persisted record before retiring the old backend. Keep the original file/backup private, because it contains password hashes and session state.

All commands default to dry-run unless `--apply` is supplied. Dry-run validates local source format, does not connect to PostgreSQL and therefore cannot confirm remote connectivity or emptiness. Source file contents are never changed or removed. The import reads the JSON snapshot, preserves its fields and existing server sessions, and fills only missing legacy optional collections with empty arrays.

Schema provisioning inserts a singleton **NULL/uninitialized sentinel**, never a usable empty app snapshot. Import and `init-empty` take a transaction row lock and accept only this sentinel. They refuse to overwrite any initialized snapshot, **even if all its arrays are empty**. Concurrent imports cannot both succeed. Reapplying the schema preserves existing data and refreshes snapshot constraints transactionally. Existing deployments should rerun `node scripts/supabase-database.mjs schema --apply` when upgrading schema validation. Marketplace collections (`marketplaceFarms`, `marketplaceProducts`, `marketplaceImages`) may be absent in legacy snapshots, but must be arrays when present. Reads fill absent collections in memory without writing; imports preserve existing farms, products, image payloads and unknown extension fields. Invalid existing collections make schema validation fail rather than silently repairing or discarding data. There is no force/overwrite flag. Investigate a refused import rather than deleting state to bypass the guard.

## Security boundary

The private schema must **not** be added to Supabase's exposed API schemas. Schema/table privileges are revoked from `PUBLIC`, `anon` and `authenticated`, row-level security is enabled without public policies, and constraints enforce a singleton row, nonnegative revision, version 1 and array-shaped collections. This snapshot includes authentication state, so browser/API-role access is inappropriate.

The application must connect as a trusted server-only database role with access to this table. The provisioning owner works without additional grants because it owns the table and bypasses ordinary RLS. For a separately managed least-privilege runtime role, an administrator must explicitly grant `USAGE` on `farmbuddy_private`, `SELECT, UPDATE` on `farmbuddy_private.app_state`, and create a policy scoped **only** to that trusted role. Do not grant anonymous/authenticated roles, broad schema privileges or bypass-RLS privileges to browser clients. SQL shape constraints validate collection containers, not every feature record's domain rules, which remain enforced by existing application APIs.

Driver failures are mapped to generic errors with no raw error cause, URI, SQL parameters or snapshot in the message. Application callback errors retain their existing behavior so API validation/auth failures continue working. Never log database objects or the environment yourself.

## Transactions, pools and limitations

Every callback, including reads, starts a transaction and obtains `SELECT ... FOR UPDATE` on the singleton row. Mutations update the snapshot and increment `revision` only after the callback succeeds; callback errors roll back. Read-only callback changes are discarded. The adapter never automatically retries/reexecutes callbacks. Existing request handlers and server sessions remain unchanged.

Each server process has a bounded pool of 3 connections, a 10-second connection timeout, 20-second idle timeout and 15-second lock timeout. Queries inside transactions are awaited sequentially. `prepare: false` avoids named prepared statements on transaction poolers. Prefer a direct connection or session pooler for this long-lived transaction-heavy server. The official Supabase Postgres.js guide currently warns that driver pipelining combined with the shared transaction pooler can hang queries or mismatch rows; `prepare: false` alone is not a guarantee against that limitation. Validate your selected connection mode before production, and do not set `max_pipeline: 0`, which the guide notes breaks `sql.begin()`.

Official driver guide: https://supabase.com/docs/guides/database/postgres-js

This is deliberately a **snapshot adapter**: all callbacks across instances serialize on one row, every mutation rewrites the full JSONB snapshot, and reads also lock it. It is suitable for preserving the existing application model, not high-throughput analytics or arbitrary SQL per-user queries. Keep callbacks short and avoid remote calls inside them. Do not call `store` recursively from a callback. Database backups and operational monitoring are still required. A lost connection during commit can have an uncertain outcome; the adapter does not retry, and callers must not assume an error proves the write did not commit. Exactly-once external side effects are not provided.

## Tests

```sh
node --test tests/database.test.js
# Only a fresh disposable LOCAL database, never existing app data:
FARMBUDDY_TEST_DATABASE_URL=postgres://dev@127.0.0.1:55439/postgres \
  node --test server/tests/database-postgres.mjs
```

The PostgreSQL suite refuses non-localhost URLs and existing FarmBuddy schemas. It provisions test schema/roles and intentionally attempts invalid writes, so use a disposable cluster. It covers two independent pools, forty concurrent callbacks without lost updates/reexecution, rollback, read discard, reconnect persistence, import overwrite refusal, schema constraints and revoked API-role privileges. Synthetic tests cover mode resolution, sanitized failures, migration dry-run/source preservation and fail-closed local-file isolation. No paid cloud setup or real Supabase project is needed for these tests. Real Supabase networking, trusted certificates and transaction-pooler behavior still require operator validation against the chosen deployment.
