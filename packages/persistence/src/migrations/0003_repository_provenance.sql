ALTER TABLE repositories ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'repositories_creator_fk'
  ) THEN
    ALTER TABLE repositories
      ADD CONSTRAINT repositories_creator_fk
      FOREIGN KEY (workspace_id, created_by)
      REFERENCES workspace_members(workspace_id, user_id);
  END IF;
END
$migration$;

ALTER TABLE source_connections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'needs_attention'));
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS authorized_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE source_bindings ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE source_bindings ADD COLUMN IF NOT EXISTS canonical_source_uri text;
ALTER TABLE source_bindings ADD COLUMN IF NOT EXISTS last_verified_at timestamptz NOT NULL DEFAULT now();

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'source_bindings'
      AND column_name = 'source_uri'
  ) THEN
    UPDATE source_bindings SET canonical_source_uri = source_uri
    WHERE canonical_source_uri IS NULL;
  END IF;
  UPDATE source_bindings b SET connection_id = c.id
  FROM source_connections c
  WHERE b.connection_id IS NULL AND b.workspace_id = c.workspace_id
    AND b.provider_key = c.provider_key;
END
$migration$;

ALTER TABLE source_bindings ALTER COLUMN connection_id SET NOT NULL;
ALTER TABLE source_bindings ALTER COLUMN canonical_source_uri SET NOT NULL;
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'source_bindings_connection_fk'
  ) THEN
    ALTER TABLE source_bindings
      ADD CONSTRAINT source_bindings_connection_fk
      FOREIGN KEY (workspace_id, connection_id)
      REFERENCES source_connections(workspace_id, id) ON DELETE CASCADE;
  END IF;
END
$migration$;

ALTER TABLE source_bindings DROP COLUMN IF EXISTS source_uri;
