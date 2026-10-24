# D1 snapshot adapter

## Runtime binding contract

Set `FARMBUDDY_DATABASE=cloudflare` and bind a D1 database as `FARMBUDDY_DB` in Wrangler. The server obtains it exclusively through dynamic `import('cloudflare:workers')`, only after selecting cloudflare mode. `FARMBUDDY_DATABASE=local` (the default) keeps the existing private JSON file and queue. Missing bindings, missing schema, uninitialized state and corrupt data fail closed, never falling back to JSON. No PostgreSQL URL or HTTP database token is used.

D1 binding must implement `withSession('first-primary')`, `prepare().first()` and `prepare().bind().run()` with D1 `success` and `meta.changes`. The adapter starts every attempt at the primary, reads `(snapshot, revision)`, runs the callback and conditionally updates `WHERE revision = ?`. A successful mutation increments revision exactly once. Zero changed rows triggers a fresh read and callback replay, up to eight total attempts. Exhaustion rejects without publishing the stale draft. Driver/ambiguous write failures are sanitized and not retried. Domain callback errors retain identity and are not retried.

**Mutating callbacks must be replay-safe:** no email/network/filesystem writes or other external side effects inside callbacks. Generate returned state from the current callback snapshot, and perform irreversible effects only after store success. Reads receive a consistent snapshot but do not lock concurrent writers. Changes made by a nonmutating callback are discarded. The local mode keeps its existing single-execution queued semantics.

## Provision and import

These are explicit operator instructions, not commands automatically executed by the application:

```sh
wrangler d1 execute <database-name> --remote --file=server/database/schema.sql
node scripts/cloudflare-database.mjs import --file=/private/backup.json --out=/private/farmbuddy-import.sql
wrangler d1 execute <database-name> --remote --file=/private/farmbuddy-import.sql
wrangler d1 execute <database-name> --remote --command='SELECT id, revision, length(CAST(snapshot AS BLOB)) AS bytes FROM app_state'
```

Use `--local` instead of `--remote` for disposable local validation. For a deliberately new installation replace `import --file=...` with `init-empty`. Omitting `--out` performs validation only and creates no file or database connection. Output is exclusive-create with mode 0600 and never overwrites an existing file or the source. Generated SQL contains all private application data, including password hashes and sessions, so keep it outside the repository and remove it securely when no longer required. Never paste it into logs or tickets.

Schema application is idempotent and never resets existing state. Provisioning creates a NULL snapshot. Import requires this NULL snapshot at revision zero and refuses to overwrite any initialized document. SQL is split into short hex chunks in a uniquely named staging table, with one final guarded UPDATE publishing the entire document atomically. A guard CHECK fails if publication did not update exactly one row. If an interrupted/failed import leaves a `farmbuddy_import_<random>` staging table, inspect it privately and remove that specific staging table before retrying with a newly generated SQL file. Never reset `app_state` to retry. Export the old backend as the version-1 JSON snapshot before import; optional collections are added without dropping unknown fields.

## Deliberate limits

The entire UTF-8 serialized snapshot is capped at **1,000,000 bytes**, enforced by both JS serialization and the SQL CHECK constraint. This is intentionally conservative for a singleton-row adapter and leaves headroom below D1's per-value/row limits. Unicode is measured in bytes, not JS character count. Import chunks contain at most 16,000 source bytes, keeping SQL statements below 100 KB even after hex encoding. The integer revision is bounded to JavaScript's safe integer range.

This design reads and rewrites the whole document for every mutation. It is suitable only for small datasets and modest concurrent write traffic, not unlimited storage or throughput. Eight contending attempts can fail under load and must be surfaced as retryable application failures. Before the document reaches the cap, migrate collections to normalized D1 tables and put binary images in R2. Do not raise the cap without reevaluating D1 row/value, statement and request limits. No snapshots are silently truncated, no existing image data is dropped, and oversize imports fail before any database connection.

## Tests

`node --test tests/database.test.js` includes `server/tests/database-d1.mjs`. Node 24's real SQLite engine executes the actual schema, generated import statements and CAS statements using two independent connections. Tests force revision conflicts, bounded exhaustion and domain failure after replay, verify no lost updates and discarded drafts, test schema/import guards, unknown fields, Unicode, size limits and fail-closed Node behavior. These are real SQLite SQL tests with a thin D1 binding-shaped adapter, not a substitute for an eventual deployed Worker/D1 smoke test.
