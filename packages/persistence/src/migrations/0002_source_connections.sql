CREATE TABLE IF NOT EXISTS source_connections (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  external_connection_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'needs_attention')),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, provider_key, external_connection_id)
);

CREATE TABLE IF NOT EXISTS repositories (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  created_by text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS source_bindings (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  repository_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  provider_key text NOT NULL,
  external_repository_id text NOT NULL,
  canonical_source_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, repository_id)
    REFERENCES repositories(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, connection_id)
    REFERENCES source_connections(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT source_bindings_workspace_id_key UNIQUE (workspace_id, id),
  CONSTRAINT source_bindings_repository_id_key UNIQUE (workspace_id, repository_id, id),
  UNIQUE (workspace_id, provider_key, external_repository_id),
  UNIQUE (workspace_id, repository_id, provider_key),
  CHECK (provider_key <> '')
);

CREATE INDEX IF NOT EXISTS source_bindings_repository_idx
  ON source_bindings (workspace_id, repository_id);
