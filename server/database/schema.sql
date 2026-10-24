-- Apply explicitly with wrangler d1 execute <database> --file=server/database/schema.sql.
-- Singleton document adapter. NULL is uninitialized, never an empty live store.
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision <= 9007199254740991),
  snapshot TEXT CHECK (snapshot IS NULL OR (
    length(CAST(snapshot AS BLOB)) <= 1000000
    AND json_valid(snapshot)
    AND json_type(snapshot, '$') = 'object'
    AND json_extract(snapshot, '$.version') = 1
    AND json_type(snapshot, '$.users') = 'array'
    AND json_type(snapshot, '$.sessions') = 'array'
    AND json_type(snapshot, '$.records') = 'array'
    AND json_type(snapshot, '$.reminders') = 'array'
    AND (json_type(snapshot, '$.enterprises') IS NULL OR json_type(snapshot, '$.enterprises') = 'array')
    AND (json_type(snapshot, '$.inventory') IS NULL OR json_type(snapshot, '$.inventory') = 'array')
    AND (json_type(snapshot, '$.referrals') IS NULL OR json_type(snapshot, '$.referrals') = 'array')
    AND (json_type(snapshot, '$.notes') IS NULL OR json_type(snapshot, '$.notes') = 'array')
    AND (json_type(snapshot, '$.marketplaceFarms') IS NULL OR json_type(snapshot, '$.marketplaceFarms') = 'array')
    AND (json_type(snapshot, '$.marketplaceProducts') IS NULL OR json_type(snapshot, '$.marketplaceProducts') = 'array')
    AND (json_type(snapshot, '$.marketplaceImages') IS NULL OR json_type(snapshot, '$.marketplaceImages') = 'array')
    AND (json_type(snapshot, '$.farmWorkspaces') IS NULL OR json_type(snapshot, '$.farmWorkspaces') = 'array')
  ) IS TRUE)
);
INSERT INTO app_state (id, snapshot) VALUES (1, NULL) ON CONFLICT(id) DO NOTHING;
