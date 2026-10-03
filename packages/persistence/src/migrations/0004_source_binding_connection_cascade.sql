ALTER TABLE source_bindings DROP CONSTRAINT IF EXISTS source_bindings_connection_fk;
ALTER TABLE source_bindings
  ADD CONSTRAINT source_bindings_connection_fk
  FOREIGN KEY (workspace_id, connection_id)
  REFERENCES source_connections(workspace_id, id) ON DELETE CASCADE;
