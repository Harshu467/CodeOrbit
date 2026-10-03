DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_bindings_workspace_id_key') THEN
    ALTER TABLE source_bindings
      ADD CONSTRAINT source_bindings_workspace_id_key UNIQUE (workspace_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_bindings_repository_id_key') THEN
    ALTER TABLE source_bindings
      ADD CONSTRAINT source_bindings_repository_id_key UNIQUE (workspace_id, repository_id, id);
  END IF;
END
$migration$;

CREATE TABLE analysis_runs (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL,
  source_binding_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
  requested_revision text,
  snapshot_revision text,
  analyzer_version text NOT NULL,
  configuration_hash text NOT NULL,
  distinct_run boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  lease_expires_at timestamptz,
  lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  error_summary text,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, repository_id)
    REFERENCES repositories(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, repository_id, source_binding_id)
    REFERENCES source_bindings(workspace_id, repository_id, id),
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_members(workspace_id, user_id),
  CHECK (
    (status IN ('queued', 'running') AND completed_at IS NULL)
    OR (status IN ('completed', 'partial', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX analysis_runs_active_dedupe_idx
  ON analysis_runs
    (workspace_id, source_binding_id, snapshot_revision, analyzer_version, configuration_hash)
  WHERE status IN ('queued', 'running') AND distinct_run = false AND snapshot_revision IS NOT NULL;

CREATE TABLE analysis_stages (
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  name text NOT NULL CHECK (name IN (
    'acquisition', 'file_discovery', 'language_detection', 'parsing',
    'symbol_extraction', 'relationship_extraction', 'persistence'
  )),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  progress_current integer CHECK (progress_current IS NULL OR progress_current >= 0),
  progress_total integer CHECK (progress_total IS NULL OR progress_total >= 0),
  error_code text,
  error_summary text,
  output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, name),
  UNIQUE (workspace_id, run_id, name),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  CHECK (progress_total IS NULL OR progress_current IS NULL OR progress_current <= progress_total),
  CHECK (
    (status IN ('queued', 'running') AND completed_at IS NULL)
    OR (status IN ('completed', 'partial', 'failed', 'skipped') AND completed_at IS NOT NULL)
  )
);

CREATE TABLE analysis_attempts (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  stage_name text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text,
  error_summary text,
  UNIQUE (run_id, stage_name, attempt_number),
  FOREIGN KEY (workspace_id, run_id, stage_name)
    REFERENCES analysis_stages(workspace_id, run_id, name) ON DELETE CASCADE
);

CREATE TABLE idempotency_records (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 200),
  request_hash text NOT NULL,
  run_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION prevent_snapshot_revision_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.snapshot_revision IS NOT NULL
     AND NEW.snapshot_revision IS DISTINCT FROM OLD.snapshot_revision THEN
    RAISE EXCEPTION 'snapshot_revision is immutable once assigned';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER analysis_runs_snapshot_revision_immutable
  BEFORE UPDATE OF snapshot_revision ON analysis_runs
  FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_revision_change();
