CREATE TABLE analysis_directories (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  path text NOT NULL,
  parent_directory_id uuid,
  disposition text NOT NULL CHECK (disposition IN ('included', 'excluded', 'inaccessible')),
  exclusion_reason text,
  UNIQUE (workspace_id, run_id, id),
  UNIQUE (run_id, path),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, parent_directory_id)
    REFERENCES analysis_directories(workspace_id, run_id, id),
  CHECK (path = '.' OR (path <> '' AND path !~ '(^/|(^|/)\.\.(/|$)|//)'))
);

CREATE TABLE analysis_projects (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  name text NOT NULL,
  path text NOT NULL,
  manifest_path text,
  manifest_type text,
  language text,
  discovery_basis text NOT NULL CHECK (discovery_basis IN ('manifest', 'structure', 'mixed')),
  status text NOT NULL CHECK (status IN ('complete', 'partial', 'unresolved')),
  UNIQUE (workspace_id, run_id, id),
  UNIQUE (run_id, path),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX analysis_projects_summary_idx ON analysis_projects(workspace_id, run_id);

CREATE TABLE analysis_files (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  path text NOT NULL,
  directory_id uuid,
  project_id uuid,
  language text,
  language_version text,
  file_kind text NOT NULL CHECK (file_kind IN (
    'source', 'test', 'configuration', 'generated', 'vendored', 'binary', 'other'
  )),
  content_hash text,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  status text NOT NULL CHECK (status IN ('discovered', 'parsed', 'partial', 'unsupported', 'skipped', 'failed')),
  issue_summary text,
  UNIQUE (workspace_id, run_id, id),
  UNIQUE (run_id, path),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, directory_id)
    REFERENCES analysis_directories(workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id, project_id)
    REFERENCES analysis_projects(workspace_id, run_id, id),
  CHECK (path <> '' AND path !~ '(^/|(^|/)\.\.(/|$)|//)')
);

CREATE INDEX analysis_files_summary_idx ON analysis_files(run_id, status);

CREATE TABLE analysis_symbols (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  file_id uuid NOT NULL,
  name text NOT NULL,
  qualified_name text,
  kind text NOT NULL,
  start_line integer NOT NULL CHECK (start_line > 0),
  start_column integer NOT NULL CHECK (start_column > 0),
  end_line integer NOT NULL CHECK (end_line > 0),
  end_column integer NOT NULL CHECK (end_column > 0),
  exported boolean,
  is_test boolean,
  UNIQUE (workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, file_id)
    REFERENCES analysis_files(workspace_id, run_id, id) ON DELETE CASCADE,
  CHECK (end_line > start_line OR (end_line = start_line AND end_column >= start_column))
);

CREATE INDEX analysis_symbols_summary_idx ON analysis_symbols(run_id);

CREATE TABLE analysis_source_evidence (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  file_id uuid NOT NULL,
  revision text NOT NULL,
  start_line integer CHECK (start_line IS NULL OR start_line > 0),
  start_column integer CHECK (start_column IS NULL OR start_column > 0),
  end_line integer CHECK (end_line IS NULL OR end_line > 0),
  end_column integer CHECK (end_column IS NULL OR end_column > 0),
  excerpt text,
  fact_kind text NOT NULL,
  UNIQUE (workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, file_id)
    REFERENCES analysis_files(workspace_id, run_id, id) ON DELETE CASCADE,
  CHECK (excerpt IS NULL OR char_length(excerpt) <= 500),
  CHECK (
    start_line IS NULL OR end_line IS NULL OR end_line > start_line OR
    (end_line = start_line AND (end_column IS NULL OR start_column IS NULL OR end_column >= start_column))
  )
);

CREATE TABLE analysis_apis (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  project_id uuid,
  symbol_id uuid,
  name text NOT NULL,
  kind text NOT NULL,
  exposure_basis text NOT NULL CHECK (exposure_basis IN ('observed', 'inferred')),
  start_line integer NOT NULL CHECK (start_line > 0),
  end_line integer NOT NULL CHECK (end_line >= start_line),
  evidence_id uuid NOT NULL,
  UNIQUE (workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, project_id)
    REFERENCES analysis_projects(workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id, symbol_id)
    REFERENCES analysis_symbols(workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id, evidence_id)
    REFERENCES analysis_source_evidence(workspace_id, run_id, id)
);

CREATE INDEX analysis_apis_summary_idx ON analysis_apis(workspace_id, run_id);

CREATE TABLE analysis_tests (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  file_id uuid NOT NULL,
  symbol_id uuid,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('test_file', 'suite', 'case', 'association')),
  target_symbol_id uuid,
  resolution text NOT NULL CHECK (resolution IN ('observed', 'inferred', 'unresolved')),
  start_line integer,
  end_line integer,
  evidence_id uuid,
  UNIQUE (workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, file_id)
    REFERENCES analysis_files(workspace_id, run_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, symbol_id)
    REFERENCES analysis_symbols(workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id, target_symbol_id)
    REFERENCES analysis_symbols(workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id, evidence_id)
    REFERENCES analysis_source_evidence(workspace_id, run_id, id)
);

CREATE INDEX analysis_tests_summary_idx ON analysis_tests(workspace_id, run_id);

CREATE TABLE analysis_dependencies (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  source_project_id uuid NOT NULL,
  target_project_id uuid,
  package_name text,
  version_constraint text,
  dependency_kind text NOT NULL CHECK (dependency_kind IN ('project', 'package', 'external')),
  resolution text NOT NULL CHECK (resolution IN ('observed', 'inferred', 'unresolved')),
  evidence_id uuid,
  UNIQUE (workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, source_project_id)
    REFERENCES analysis_projects(workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id, target_project_id)
    REFERENCES analysis_projects(workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id, evidence_id)
    REFERENCES analysis_source_evidence(workspace_id, run_id, id)
);

CREATE INDEX analysis_dependencies_summary_idx ON analysis_dependencies(workspace_id, run_id);

CREATE TABLE analysis_relationships (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  source_entity_type text NOT NULL,
  source_entity_id uuid,
  target_entity_type text NOT NULL,
  target_entity_id uuid,
  unresolved_target text,
  type text NOT NULL CHECK (type IN (
    'imports', 'calls', 'inherits', 'implements', 'references', 'depends_on',
    'exposes_api', 'publishes_event', 'consumes_event', 'reads_data', 'writes_data', 'tests'
  )),
  resolution text NOT NULL CHECK (resolution IN ('observed', 'inferred', 'unresolved')),
  evidence_id uuid NOT NULL,
  description text,
  UNIQUE (workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, evidence_id)
    REFERENCES analysis_source_evidence(workspace_id, run_id, id),
  CHECK (resolution <> 'unresolved' OR target_entity_id IS NULL),
  CHECK (resolution = 'unresolved' OR target_entity_id IS NOT NULL)
);

CREATE INDEX analysis_relationships_summary_idx ON analysis_relationships(run_id);

CREATE TABLE analysis_issues (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  run_id uuid NOT NULL,
  stage_name text,
  file_id uuid,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  code text NOT NULL,
  message text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('repository', 'directory', 'file', 'project', 'symbol', 'relationship')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, run_id, id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES analysis_runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id, stage_name)
    REFERENCES analysis_stages(workspace_id, run_id, name),
  FOREIGN KEY (workspace_id, run_id, file_id)
    REFERENCES analysis_files(workspace_id, run_id, id)
);

CREATE INDEX analysis_issues_run_idx ON analysis_issues(workspace_id, run_id, severity);
