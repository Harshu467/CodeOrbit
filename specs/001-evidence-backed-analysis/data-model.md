# Data Model: Evidence-Backed Repository Analysis

## Conventions

- Every persisted model record is scoped to a CodeOrbit workspace/tenant and has an opaque stable ID.
- A run is pinned to an immutable provider snapshot revision; revision strings are opaque in the core model.
- Source paths are normalized repository-relative paths. Source line and column values exposed by CodeOrbit are one-based; column conversion must account for Tree-sitter's byte offsets.
- Provider credentials and full source file contents are not model data. Short evidence excerpts are sensitive and access-controlled.
- Analysis output is scoped to a run so reanalysis of a changed repository revision cannot silently overwrite the prior model.

## Entities

### Repository

Provider-neutral logical repository registered in a workspace.

- `id`: opaque unique identifier
- `workspace_id`: owning workspace
- `display_name`: user-facing repository name
- `created_by`: user who connected it
- `created_at`, `updated_at`: timestamps
- `state`: `active` or `disconnected`

Validation:
- Must belong to one workspace and have a stable CodeOrbit ID.
- Must not contain provider credentials or require a GitHub-specific field to identify the logical repository.

### SourceBinding

Integration mapping between a Repository and one configured source provider.

- `id`, `repository_id`, `workspace_id`
- `provider_key`: e.g. `github`, isolated in this integration record
- `external_repository_id`: opaque provider identifier
- `canonical_source_uri`: normalized source address
- `connection_id`: reference to the workspace/provider authorization connection
- `created_at`, `last_verified_at`

Validation:
- Unique by `(workspace_id, provider_key, external_repository_id)`.
- Provider credentials are stored only in a dedicated secret store and are never copied into this row.
- A selected provider resource must be verified as accessible by the associated connection before analysis.

### SourceConnection

Workspace's authorization relationship to a source provider.

- `id`, `workspace_id`, `provider_key`
- `external_installation_ref`: opaque adapter-owned reference, nullable for providers without installations
- `status`: `active`, `revoked`, or `needs_attention`
- `authorized_at`, `last_verified_at`, `revoked_at`

Validation:
- Contains no plaintext private key or access token.
- GitHub App connection grants access only to selected installation repositories; per-acquisition tokens are short-lived and repository-scoped.

### AnalysisRun

Analysis of one repository snapshot with a fixed analyzer/configuration version.

- `id`, `workspace_id`, `repository_id`, `source_binding_id`
- `status`: `queued`, `running`, `completed`, `partial`, or `failed`
- `requested_revision`: requested ref or provider revision hint, optional
- `snapshot_revision`: immutable resolved revision, nullable until acquisition resolves it
- `analyzer_version`, `configuration_hash`
- `created_by`, `created_at`, `started_at`, `completed_at`
- `attempt_count`, `next_attempt_at`, `lease_expires_at`, `lease_generation`
- `error_summary`: sanitized terminal/high-level explanation
- `counts`: computed or cached counts for model entities
- `supersedes_run_id`: optional link for explicit reruns

Validation:
- `(snapshot_revision, analyzer_version, configuration_hash)` is the logical deduplication identity once resolved; only active matching work is coalesced unless an explicit distinct run is requested.
- `completed_at` is set only for terminal states.
- A run cannot be `completed` if any required stage failed or if required repository scope was omitted.
- `snapshot_revision` is immutable once set.

### AnalysisStage

Durable status and outcome for a named pipeline stage.

- `id`, `run_id`
- `name`: `acquisition`, `file_discovery`, `language_detection`, `parsing`, `symbol_extraction`, `relationship_extraction`, or `persistence`
- `status`: `queued`, `running`, `completed`, `partial`, `failed`, or `skipped`
- `attempt_count`, `started_at`, `completed_at`, `duration_ms`
- `progress_current`, `progress_total`, optional when measurable
- `error_code`, `error_summary`: sanitized error details
- `output_summary`: stage counts or bounded metadata

Validation:
- Exactly one current stage record per `(run_id, name)`; attempt history may be represented in a separate `AnalysisAttempt` record or append-only events.
- Progress values are non-negative, and current does not exceed total when total is known.
- Retries apply to transient stage failures with bounded attempts; exhausted worker retries fail the run and retain stage/error information.
- All seven pipeline stages must succeed for a `completed` run. Item-scoped issues with useful model output retained make the run `partial`; acquisition failure, pipeline-wide required-stage failure, exhausted worker retries, or no useful durable model output makes it `failed`.

### Directory

Directory discovered in the immutable repository snapshot.

- `id`, `run_id`, `path`, `parent_directory_id`
- `project_id`: optional project association
- `disposition`: `included`, `excluded`, or `inaccessible`
- `exclusion_reason`: optional

Validation:
- Path is normalized and unique within a run.
- A directory cannot be both included and excluded.

### Project

Logical module/package identified from repository metadata or structure.

- `id`, `run_id`, `name`, `path`
- `manifest_path`, `manifest_type`: optional
- `language`: optional declared or detected language
- `discovery_basis`: `manifest`, `structure`, or `mixed`
- `status`: `complete`, `partial`, or `unresolved`

Validation:
- Project path is repository-relative and unique within a run when deterministically identifiable.
- Overlapping/nested project roots are allowed; project membership resolution records uncertainty when ambiguous.

### File

Repository file and its analysis disposition.

- `id`, `run_id`, `path`, `directory_id`, `project_id`
- `language`, `language_version`: nullable for unknown/unsupported
- `file_kind`: source, test, configuration, generated, vendored, binary, or other
- `content_hash`: optional hash for snapshot reproducibility
- `size_bytes`
- `status`: `discovered`, `parsed`, `partial`, `unsupported`, `skipped`, or `failed`
- `issue_summary`: optional

Validation:
- `(run_id, path)` is unique.
- Unsupported/skipped/failed files remain visible and cannot be counted as parsed.

### Symbol

Source declaration or other extracted code symbol.

- `id`, `run_id`, `file_id`
- `name`, `qualified_name`: latter nullable when unresolved
- `kind`: function, method, class, interface, type, variable, module, or other supported declaration
- `start_line`, `start_column`, `end_line`, `end_column`
- `exported`: boolean or unknown
- `is_test`: boolean or unknown

Validation:
- Must reference a file in the same run.
- Source span must be valid and one-based when present.
- Same-named symbols remain distinct using file, scope/qualification, kind, and source span.

### API

Source-backed interface exposed by a project/module.

- `id`, `run_id`, `project_id`, `symbol_id`
- `name`, `kind`: route, exported interface, command, or other recognized API category
- `exposure_basis`: observed or inferred
- `start_line`, `end_line`

Validation:
- An API record requires direct source evidence for its exposed declaration or endpoint pattern.
- Framework-specific exposure not recognized by deterministic rules remains a symbol or unresolved finding, not a proven API.

### Test

Test file, case, or test-to-code association found in repository source.

- `id`, `run_id`, `file_id`, `symbol_id`: symbol optional
- `name`, `kind`: test file, suite, case, or association
- `target_symbol_id`: optional resolved code target
- `resolution`: observed, inferred, or unresolved
- source span

Validation:
- Test recognition is based on declared V1 file/name/framework conventions or syntax patterns.
- An unresolvable target is retained as unresolved rather than omitted or guessed.

### Dependency

Declared dependency between projects/modules or packages.

- `id`, `run_id`
- `source_project_id`, `target_project_id`: target project nullable for external/unresolved dependency
- `package_name`, `version_constraint`: optional for declared package dependencies
- `dependency_kind`: project, package, or external
- `resolution`: observed, inferred, or unresolved
- `evidence_id`: manifest/source evidence

Validation:
- Preserve declared dependencies even if the target cannot be resolved to an in-repository project.
- Dependency source evidence references a manifest or source location when available.

### Relationship

Typed edge between model entities.

- `id`, `run_id`
- `source_entity_type`, `source_entity_id`
- `target_entity_type`, `target_entity_id`: nullable when unresolved
- `type`: imports, calls, inherits, implements, references, depends_on, exposes_api, publishes_event, consumes_event, reads_data, writes_data, or tests
- `resolution`: `observed`, `inferred`, or `unresolved`
- `evidence_id`
- `description`: optional normalized detail

Validation:
- Both resolved endpoints must belong to the same run.
- Observed relationships require source evidence.
- Dynamic calls, generic events, and database operations are not marked observed without an explicit supported pattern and evidence.
- Unresolved relationships may retain a textual target expression but not a fabricated entity ID.

### SourceEvidence

Compact provenance for an extracted fact.

- `id`, `run_id`, `file_id`
- `revision`
- `start_line`, `start_column`, `end_line`, `end_column`: nullable if the provider or fact has no precise location
- `excerpt`: short relevant excerpt, nullable
- `fact_kind`

Validation:
- Must reference a file and immutable revision in the same run.
- Excerpts are bounded and sanitized; entire file contents are never retained as evidence.
- Evidence location follows one-based line/column convention. Internal Tree-sitter byte offsets are converted before persistence.

### AnalysisIssue

Warning, skipped item, unresolved reference, or failure affecting completeness.

- `id`, `run_id`, `stage_id`: nullable
- `file_id`: nullable
- `severity`: `info`, `warning`, or `error`
- `code`, `message`: sanitized
- `scope`: repository, directory, file, project, symbol, or relationship
- `created_at`

Validation:
- Errors and warnings must not expose tokens or sensitive source details.
- Issues explaining partial/failed states are visible from the run status or summary.

### IdempotencyRecord

Request de-duplication for analysis creation.

- `workspace_id`, `key`, `request_hash`
- `run_id`, `created_at`, `expires_at`

Validation:
- Unique by `(workspace_id, key)`.
- Reuse with the same request returns the associated run; reuse with a different request hash returns conflict.

## Relationships

- Workspace 1:N Repository, SourceConnection, AnalysisRun.
- Repository 1:N SourceBinding and AnalysisRun.
- SourceConnection 1:N SourceBinding.
- AnalysisRun 1:N AnalysisStage, Directory, Project, File, Symbol, API, Test, Dependency, Relationship, SourceEvidence, and AnalysisIssue.
- Directory 1:N child Directory; Directory 1:N File; Project 1:N File and API.
- File 1:N Symbol, Test, and SourceEvidence.
- Symbol may be the endpoint of relationships and may back an API or Test.
- Relationship N:1 SourceEvidence; Dependency N:1 SourceEvidence.
- IdempotencyRecord references one AnalysisRun.

## State transitions

### AnalysisRun

`queued -> running -> completed | partial | failed`

Transient stage failures are retried while attempts remain; the run remains `running` while an individual stage waits for retry. After the configured maximum, the run is `failed`, though durable results from earlier stages may still be inspectable. Terminal states do not transition in place; a rerun creates a new run linked by `supersedes_run_id`.

### AnalysisStage

`queued -> running -> completed | partial | failed | skipped`

Transient failure may return to queued for a bounded retry. Required stage failure prevents run completion. File-level failures that do not invalidate a required stage can result in a partial run.

### File

`discovered -> parsed | partial | unsupported | skipped | failed`

## Summary counts

Counts are scoped to one run and include files, projects, symbols, APIs, tests, dependencies, and relationships. Counts should derive from persisted model records; if cached, they are updated in the same persistence boundary as the records they summarize.
