-- Apply explicitly with scripts/supabase-database.mjs schema --apply.
-- This schema must NOT be added to Supabase's exposed API schemas.
CREATE SCHEMA IF NOT EXISTS farmbuddy_private;
REVOKE ALL ON SCHEMA farmbuddy_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS farmbuddy_private.app_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  snapshot jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Refresh the constraint on explicit re-application too. Existing snapshot data
-- is never rewritten. Invalid existing rows abort the enclosing schema transaction.
ALTER TABLE farmbuddy_private.app_state DROP CONSTRAINT IF EXISTS app_snapshot_format;
ALTER TABLE farmbuddy_private.app_state ADD CONSTRAINT app_snapshot_format CHECK (snapshot IS NULL OR (
    jsonb_typeof(snapshot) = 'object'
    AND snapshot->'version' = '1'::jsonb
    AND jsonb_typeof(snapshot->'users') = 'array'
    AND jsonb_typeof(snapshot->'sessions') = 'array'
    AND jsonb_typeof(snapshot->'records') = 'array'
    AND jsonb_typeof(snapshot->'reminders') = 'array'
    AND jsonb_typeof(snapshot->'enterprises') = 'array'
    AND jsonb_typeof(snapshot->'inventory') = 'array'
    AND jsonb_typeof(snapshot->'referrals') = 'array'
    AND jsonb_typeof(snapshot->'notes') = 'array'
    AND (NOT (snapshot ? 'marketplaceFarms') OR jsonb_typeof(snapshot->'marketplaceFarms') = 'array')
    AND (NOT (snapshot ? 'marketplaceProducts') OR jsonb_typeof(snapshot->'marketplaceProducts') = 'array')
    AND (NOT (snapshot ? 'marketplaceImages') OR jsonb_typeof(snapshot->'marketplaceImages') = 'array')
  ) IS TRUE);
ALTER TABLE farmbuddy_private.app_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA farmbuddy_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA farmbuddy_private REVOKE ALL ON TABLES FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA farmbuddy_private FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA farmbuddy_private FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA farmbuddy_private REVOKE ALL ON TABLES FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
-- NULL means deliberately uninitialized, never a usable empty application state.
INSERT INTO farmbuddy_private.app_state (id, snapshot) VALUES (1, NULL) ON CONFLICT (id) DO NOTHING;
