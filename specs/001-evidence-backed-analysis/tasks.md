---

description: "Implementation task list for Evidence-Backed Repository Analysis"
---

# Tasks: Evidence-Backed Repository Analysis

**Input**: Design documents from `/specs/001-evidence-backed-analysis/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, and `quickstart.md`.

**Tests**: Tests are required by FR-019. Add the specified unit, integration, and contract tests in each story before implementing that story's behavior.

**Organization**: Tasks are grouped by the four P1 user stories. Shared runtime and domain prerequisites are established before story work.

## Format

Every task follows `- [ ] T### [P?] [US?] Description with file path`.

- `[P]` means the task can proceed in parallel with other marked tasks in its phase because it owns different files and has no incomplete prerequisite.
- `[US#]` maps the task to its user story and is required for user-story phase tasks.
- Every task names the file(s) to create or modify.

## Phase 1: Setup

**Purpose**: Establish the TypeScript monorepo and repeatable local development environment.

- [X] T001 Create pnpm workspace configuration for `apps/*` and `packages/*` in `pnpm-workspace.yaml`.
- [X] T002 Create root package scripts for build, dev, lint, typecheck, unit tests, integration tests, and contract tests in `package.json`.
- [X] T003 [P] Add shared TypeScript compiler defaults for strict type checking in `tsconfig.base.json`.
- [X] T004 [P] Add repository-wide lint and formatting configuration in `eslint.config.js` and `.prettierrc.json`.
- [X] T005 [P] Add local PostgreSQL service and health check in `docker-compose.yml`.
- [X] T006 Create example environment variables for database, API, GitHub App, and application secrets in `.env.example`.
- [X] T007 Create initial package manifests and TypeScript entry points for `apps/web/package.json`, `apps/api/package.json`, `apps/analysis-worker/package.json`, `packages/domain/package.json`, `packages/source-providers/contracts/package.json`, `packages/source-providers/github/package.json`, `packages/analyzers/contracts/package.json`, `packages/analyzers/javascript-typescript/package.json`, `packages/persistence/package.json`, and `packages/api-contracts/package.json`.

## Phase 2: Foundational

**Purpose**: Implement shared domain contracts, PostgreSQL access, authenticated workspace context, API infrastructure, and worker execution primitives required by all stories.

**Blocking checkpoint**: Complete this phase before starting any user-story implementation.

- [X] T008 Define provider-neutral identifiers, workspace context, stable domain errors, and timestamp conventions in `packages/domain/src/ids.ts`, `packages/domain/src/workspace.ts`, and `packages/domain/src/errors.ts`.
- [X] T009 [P] Define the source-provider port for authorized-source listing, immutable revision resolution, and snapshot acquisition in `packages/source-providers/contracts/src/source-provider.ts`.
- [X] T010 [P] Define language-analyzer inputs, extracted-finding outputs, source spans, and parse issues in `packages/analyzers/contracts/src/language-analyzer.ts`.
- [X] T011 [P] Define shared API schemas and generated contract type entry points from `specs/001-evidence-backed-analysis/contracts/openapi.yaml` in `packages/api-contracts/src/index.ts`.
- [X] T012 Configure PostgreSQL connections, migration execution, and transaction helpers in `packages/persistence/src/client.ts`, `packages/persistence/src/migrate.ts`, and `packages/persistence/src/transaction.ts`.
- [X] T013 Create the initial workspace membership and authenticated principal schema with tenant-scoped foreign keys in `packages/persistence/src/migrations/0001_workspace.sql`.
- [X] T014 Implement authenticated workspace resolution and deny-by-default authorization middleware in `apps/api/src/middleware/authenticate.ts` and `apps/api/src/middleware/workspace-scope.ts`.
- [X] T015 Create versioned API routing, request validation, sanitized error mapping, and readiness endpoints in `apps/api/src/app.ts` and `apps/api/src/routes/health.ts`.
- [X] T016 Configure structured logs and redaction rules that exclude authorization headers, GitHub tokens, private keys, and source excerpts in `packages/domain/src/observability/redaction.ts` and `apps/api/src/observability/logger.ts`.
- [X] T017 Define durable worker job envelopes, database-backed claim/lease helpers, and lease-generation guards in `apps/analysis-worker/src/jobs/job-envelope.ts` and `packages/persistence/src/worker-jobs.ts`.
- [X] T018 Define the standard fixture repository layout and expected finding manifest in `tests/fixtures/repositories/standard/README.md` and `tests/fixtures/repositories/standard/expected.json`.

## Phase 3: User Story 1 - Connect a Repository (Priority: P1)

**Goal**: Connect an authorized GitHub repository and retain a provider-neutral CodeOrbit repository identity and provider binding.

**Independent Test**: Register and retrieve an accessible selected repository; reject an inaccessible or unselected source without creating a falsely connected repository. Confirm provider credentials are absent from domain and repository records.

### Tests for User Story 1

- [X] T019 [P] [US1] Add repository creation/retrieval and invalid-source contract tests against `specs/001-evidence-backed-analysis/contracts/openapi.yaml` in `tests/contract/repositories.test.ts`.
- [X] T020 [P] [US1] Add GitHub App installation selection, selected-repository validation, and permission-denial adapter tests in `tests/unit/github-source-provider.test.ts`.
- [X] T021 [P] [US1] Add PostgreSQL integration tests for workspace-scoped Repository, SourceConnection, and SourceBinding uniqueness and credential exclusion in `tests/integration/repository-registration.test.ts`.

### Implementation for User Story 1

- [X] T022 [US1] Implement Repository, SourceConnection, and SourceBinding schemas in `packages/persistence/src/migrations/0002_source_connections.sql`, `0003_repository_provenance.sql`, and `0004_source_binding_connection_cascade.sql`; enforce SourceBinding “Unique by `(workspace_id, provider_key, external_repository_id)`,” ensure Repository “Must belong to one workspace and have a stable CodeOrbit ID” and “Must not contain provider credentials or require a GitHub-specific field to identify the logical repository,” ensure SourceConnection “Contains no plaintext private key or access token,” and verify selected resources are accessible before binding them.
- [X] T023 [P] [US1] Implement the GitHub App adapter for selected installation repositories, scoped read-only installation tokens, and normalized provider errors in `packages/source-providers/github/src/github-source-provider.ts`.
- [X] T024 [US1] Implement repository registration and retrieval services that validate workspace access through the provider port and persist provider-neutral Repository plus SourceBinding records in `apps/api/src/services/repository-service.ts`.
- [X] T025 [US1] Implement `POST /api/v1/repositories`, `GET /api/v1/repositories`, and `GET /api/v1/repositories/{repositoryId}` per the OpenAPI contract in `apps/api/src/routes/repositories.ts`.
- [X] T026 [US1] Implement GitHub App installation-start, callback, and selected-repository listing operations in `apps/api/src/routes/github-installation.ts` and `apps/web/app/repositories/connect/page.tsx` as specified in `specs/001-evidence-backed-analysis/contracts/openapi.yaml`; never return or log tokens.
- [X] T027 [US1] Add repository list, connect, and access-denied states with responsive and keyboard-accessible controls in `apps/web/app/repositories/page.tsx` and `apps/web/src/components/repository-connect-form.tsx`.

**Checkpoint**: An authorized user can connect, list, and retrieve a selected repository; invalid or inaccessible sources return sanitized errors without a successful repository record.

## Phase 4: User Story 2 - Analyze a Repository and Track Progress (Priority: P1)

**Goal**: Start a revision-pinned analysis, expose all seven durable stages, deduplicate active work, and retry transient worker failures within a bounded policy.

**Independent Test**: Start an analysis for a selected repository, retrieve the run as its stages progress, submit a duplicate active request, and confirm a new revision produces a separate run. Inject transient worker failures and confirm retries then explicit terminal failure.

### Tests for User Story 2

- [X] T028 [P] [US2] Add contract tests for run creation, stage progress, status states, immutable revision fields, and unknown run responses in `tests/contract/analysis-runs.test.ts`.
- [X] T029 [P] [US2] Add provider integration tests proving refs resolve to immutable revisions and retries reacquire the same revision in `tests/integration/revision-pinning.test.ts`.
- [X] T030 [P] [US2] Add PostgreSQL concurrency integration tests for active-run deduplication, idempotency-key conflicts, leases, and stale lease generations in `tests/integration/run-concurrency.test.ts`.
- [X] T031 [P] [US2] Add worker lifecycle tests for transient retry limits, permanent failure classification, and exhausted-retry run failure in `tests/unit/worker-retry-policy.test.ts`.

### Implementation for User Story 2

- [X] T032 [US2] Create AnalysisRun, AnalysisStage, AnalysisAttempt, and IdempotencyRecord schemas in `packages/persistence/src/migrations/0005_analysis_runs.sql`; preserve run states `queued`, `running`, `completed`, `partial`, `failed` and stage names `acquisition`, `file_discovery`, `language_detection`, `parsing`, `symbol_extraction`, `relationship_extraction`, `persistence`; enforce “`completed_at` is set only for terminal states,” “`snapshot_revision` is immutable once set,” “Exactly one current stage record per `(run_id, name)`,” “Progress values are non-negative, and current does not exceed total when total is known,” and “Unique by `(workspace_id, key)`.”
- [X] T033 [US2] Implement source-ref resolution, immutable `snapshot_revision` assignment, and snapshot acquisition result normalization in `packages/source-providers/contracts/src/snapshot.ts` and `packages/source-providers/github/src/github-source-provider.ts`.
- [X] T034 [US2] Implement start-analysis service with request hashing, workspace-scoped idempotency, and active-run deduplication in `apps/api/src/services/analysis-run-service.ts`; enforce “Reuse with the same request returns the associated run; reuse with a different request hash returns conflict” and deduplicate by `(snapshot_revision, analyzer_version, configuration_hash)` only while matching work is active unless a distinct run is requested.
- [X] T035 [US2] Implement `POST /api/v1/repositories/{repositoryId}/analysis-runs` and `GET /api/v1/analysis-runs/{runId}` with `202 Accepted`, `Location`, seven stage records, progress, timestamps, and sanitized errors in `apps/api/src/routes/analysis-runs.ts`.
- [ ] T036 [US2] Implement database-backed worker claim, lease heartbeat, attempt persistence, stale-worker fencing, and bounded transient retry with capped backoff in `apps/analysis-worker/src/runner.ts` and `apps/analysis-worker/src/retry-policy.ts`.
- [ ] T037 [US2] Implement acquisition, file discovery, language detection, parsing, symbol extraction, relationship extraction, and persistence stage dispatch with durable transition updates in `apps/analysis-worker/src/pipeline.ts`.
- [X] T038 [US2] Implement run progress, retry-wait, duplicate-run, and terminal error views in `apps/web/src/app/analysis-runs/[runId]/page.tsx` and `apps/web/src/components/analysis-progress.tsx`.

**Checkpoint**: Runs are revision-pinned and observable, duplicate active work is not repeated by default, and exhausted transient retries end in failed status with the stage and reason.

## Phase 5: User Story 3 - Build a Connected, Evidence-Backed System Model (Priority: P1)

**Goal**: Discover repository structure and produce deterministic JavaScript/TypeScript model entities and evidence-backed relationships while preserving uncertainty.

**Independent Test**: Analyze the standard fixture repository and compare persisted directories, projects, files, symbols, APIs, tests, dependencies, relationships, source locations, excerpts, and unresolved findings with its expected manifest.

### Tests for User Story 3

- [ ] T039 [P] [US3] Add Tree-sitter query fixture tests for JavaScript declarations, imports, exports, calls, inheritance, syntax errors, and malformed-source recovery in `tests/unit/javascript-extraction.test.ts`.
- [ ] T040 [P] [US3] Add TypeScript and TSX grammar/query tests for interfaces, types, classes, exports, source spans, and Unicode location conversion in `tests/unit/typescript-extraction.test.ts`.
- [ ] T041 [P] [US3] Add fixture tests for manifest-based projects, test recognition, dependency parsing, and overlapping project roots in `tests/unit/project-discovery.test.ts`.
- [ ] T042 [P] [US3] Add fixture tests ensuring only explicitly supported conventions produce observed API/event/database relationships and ambiguous targets remain unresolved in `tests/unit/relationship-resolution.test.ts`.
- [ ] T043 [P] [US3] Add PostgreSQL integration tests for entity run scoping, source evidence retention constraints, and same-name symbols in `tests/integration/system-model-persistence.test.ts`.

### Implementation for User Story 3

- [ ] T044 [US3] Create Directory, Project, File, Symbol, API, Test, Dependency, Relationship, SourceEvidence, and AnalysisIssue schemas in `packages/persistence/src/migrations/0006_system_model.sql`; enforce File “`(run_id, path)` is unique” and “Unsupported/skipped/failed files remain visible and cannot be counted as parsed,” plus same-run foreign-key or repository validation for all model references.
- [ ] T045 [US3] Implement repository directory/file discovery, generated/vendor/binary classification, and normalized repository-relative paths in `packages/analyzers/javascript-typescript/src/discovery.ts`; enforce “Path is normalized and unique within a run” and “A directory cannot be both included and excluded.”
- [ ] T046 [US3] Implement project discovery from `package.json`, `pnpm-workspace.yaml`, and `tsconfig.json` project references plus repository structure; extract declared package and workspace dependencies with manifest-path evidence in `packages/analyzers/javascript-typescript/src/projects.ts`; enforce “Project path is repository-relative and unique within a run when deterministically identifiable” and “Overlapping/nested project roots are allowed; project membership resolution records uncertainty when ambiguous.”
- [ ] T047 [US3] Pin JavaScript, TypeScript, and TSX grammar/query versions and implement deterministic Tree-sitter parsing with `ERROR`/`MISSING` issue capture in `packages/analyzers/javascript-typescript/src/parser.ts` and `packages/analyzers/javascript-typescript/queries/`.
- [ ] T048 [US3] Implement symbol, import/export, API, and test extraction in `packages/analyzers/javascript-typescript/src/extract-symbols.ts`; enforce Symbol “Must reference a file in the same run,” “Source span must be valid and one-based when present,” and “Same-named symbols remain distinct using file, scope/qualification, kind, and source span”; enforce API “requires direct source evidence for its exposed declaration or endpoint pattern” and Test “Test recognition is based on declared V1 file/name/framework conventions or syntax patterns” and “An unresolvable target is retained as unresolved rather than omitted or guessed.”
- [ ] T049 [US3] Implement deterministic relationship and dependency extraction in `packages/analyzers/javascript-typescript/src/extract-relationships.ts`; enforce Relationship “Both resolved endpoints must belong to the same run,” “Observed relationships require source evidence,” “Dynamic calls, generic events, and database operations are not marked observed without an explicit supported pattern and evidence,” and “Unresolved relationships may retain a textual target expression but not a fabricated entity ID”; enforce Dependency “Preserve declared dependencies even if the target cannot be resolved to an in-repository project.”
- [ ] T050 [US3] Implement evidence excerpt redaction and source-location conversion in `packages/analyzers/javascript-typescript/src/evidence.ts`; enforce SourceEvidence “Must reference a file and immutable revision in the same run,” “Excerpts are bounded and sanitized; entire file contents are never retained as evidence,” and “Evidence location follows one-based line/column convention. Internal Tree-sitter byte offsets are converted before persistence,” with a 500-Unicode-code-point maximum excerpt; enforce AnalysisIssue errors/warnings do not expose tokens or sensitive source details.
- [ ] T051 [US3] Implement normalized model persistence with per-stage transactions and run-scoped entity references in `packages/persistence/src/system-model-repository.ts`.
- [ ] T052 [US3] Add multi-package JavaScript/TypeScript and failure fixtures plus expected model records for all required relationships in `tests/fixtures/repositories/standard/` and `tests/fixtures/repositories/failures/`.

**Checkpoint**: The standard fixture produces the expected evidence-backed system model; unsupported files and parse damage remain visible, and ambiguous dynamic relationships are not asserted as observed.

## Phase 6: User Story 4 - Inspect Analysis Results and Failures (Priority: P1)

**Goal**: Return accurate model counts, stage outcomes, and actionable sanitized issue details for completed, partial, and failed runs.

**Independent Test**: Retrieve summaries for a completed fixture, item-level partial analysis, inaccessible acquisition, required-stage failure, and exhausted retries; compare status, counts, and issue scope to expected outcomes.

### Tests for User Story 4

- [ ] T053 [P] [US4] Add contract tests for summary counts, issues, partial/failed status, unauthorized scope, and unknown run behavior in `tests/contract/analysis-summary.test.ts`.
- [ ] T054 [P] [US4] Add integration tests for completed, partial, required-stage failure, exhausted-retry failure, and empty-repository summary semantics in `tests/integration/analysis-summary.test.ts`.
- [ ] T055 [P] [US4] Add domain tests proving no run with an unsuccessful required stage can transition to completed in `tests/unit/run-completion-policy.test.ts`.

### Implementation for User Story 4

- [ ] T056 [US4] Implement run completion policy for completed, partial, and failed outcomes, including useful persisted result detection and required-stage failure handling in `packages/domain/src/run-completion.ts`.
- [ ] T057 [US4] Implement run-scoped counts for files, projects, symbols, APIs, tests, dependencies, and relationships plus sanitized issue retrieval in `packages/persistence/src/analysis-summary-repository.ts`.
- [ ] T058 [US4] Implement `GET /api/v1/analysis-runs/{runId}/summary` with stable counts, issues, and explicit not-found/authorization semantics in `apps/api/src/routes/analysis-summary.ts`.
- [ ] T059 [US4] Implement summary UI for entity counts, partial scope, failed stage, unresolved findings, and empty-result states in `apps/web/src/components/analysis-summary.tsx` and `apps/web/src/app/analysis-runs/[runId]/summary/page.tsx`.
- [ ] T060 [US4] Enforce two-second p95 status/summary response target for the documented standard fixture and add a reproducible performance scenario in `tests/performance/analysis-read-path.test.ts`.

**Checkpoint**: Users can distinguish completed, partial, and failed runs from persisted counts/issues without false completion or credential/source-content leakage.

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Confirm integration boundaries, operational safety, and end-to-end acceptance across all stories.

- [ ] T061 [P] Add operational metrics and alerts for stuck leases, retry exhaustion, stage latency, failure rates, and oversized snapshot partials in `apps/analysis-worker/src/observability/metrics.ts` and `apps/api/src/observability/metrics.ts`.
- [ ] T062 [P] Document GitHub App setup, selected-repository permission configuration, token/key secret handling, and local PostgreSQL setup in `README.md` and `docs/github-app-setup.md`.
- [ ] T063 [P] Document provider-port and language-analyzer extension contracts without introducing additional production providers or languages in `docs/extending-analysis.md`.
- [ ] T064 Review API, worker, and persistence paths for workspace isolation, credential redaction, excerpt limits, and full-source non-retention in `docs/security-review-checklist.md`.
- [ ] T065 Run the complete end-to-end and failure validation scenarios documented in `specs/001-evidence-backed-analysis/quickstart.md`, recording reproducible outputs in `tests/fixtures/repositories/standard/expected.json`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No prerequisite; creates the monorepo, tooling, and local service definitions.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user-story phases by providing shared contracts, authorization context, database access, logging, and worker claim primitives.
- **User Stories (Phases 3–6)**: Depend on Foundation and are delivered in product flow order. US2 requires a connected source binding from US1; US3 requires a pinned snapshot and pipeline from US2; US4 summarizes model and run data from US2/US3.
- **Polish (Phase 7)**: Depends on all four user stories.

### User Story Dependencies

- **US1 (P1)**: Independent after Foundation; delivers repository connection as the MVP slice.
- **US2 (P1)**: Depends on US1 for a registered source and authorization binding.
- **US3 (P1)**: Depends on US2 for immutable acquisition and stage orchestration; its analyzer can be unit-tested using local fixtures independently.
- **US4 (P1)**: Depends on persisted run lifecycle from US2 and model records from US3 for complete counts; status/failure rules can be unit-tested independently.

### Within Each User Story

- Write story-specific unit, integration, and contract tests first; implement the models/services/endpoints/UI they cover afterward.
- Implement schema/entity foundations before services, services before routes, and durable stage execution before status UI.
- Marked parallel tasks are limited to different files with no unfinished prerequisite; unmarked tasks must follow the numbered order and phase dependencies.

### Parallel Opportunities

- **Setup**: T003, T004, and T005 can proceed alongside T001–T002 after package layout is agreed; T006 can proceed independently.
- **Foundation**: T009, T010, and T011 are separate interface files and can proceed in parallel; T012–T017 provide dependent shared infrastructure.
- **US1**: T019–T021 tests can be authored in parallel; T023 provider adapter can proceed alongside T022 schema work after the source-provider port exists.
- **US2**: T028–T031 tests can be authored in parallel; later source/acquisition and worker layers can proceed in parallel once their contracts are stable.
- **US3**: T039–T043 tests can be authored in parallel; discovery/project work and grammar-query work use separate package files once contracts are stable.
- **US4**: T053–T055 tests can be authored in parallel; completion policy and read-path persistence work are separable before route/UI integration.
- **Polish**: T061–T063 can proceed in parallel.

## Parallel Execution Examples

### User Story 1

```text
Task: T019 repository API contract tests in tests/contract/repositories.test.ts
Task: T020 GitHub authorization adapter tests in tests/unit/github-source-provider.test.ts
Task: T021 repository persistence integration tests in tests/integration/repository-registration.test.ts
```

### User Story 2

```text
Task: T028 analysis-run contract tests in tests/contract/analysis-runs.test.ts
Task: T029 revision-pinning tests in tests/integration/revision-pinning.test.ts
Task: T030 concurrency and idempotency tests in tests/integration/run-concurrency.test.ts
Task: T031 retry-policy tests in tests/unit/worker-retry-policy.test.ts
```

### User Story 3

```text
Task: T039 JavaScript extraction tests in tests/unit/javascript-extraction.test.ts
Task: T040 TypeScript/TSX extraction tests in tests/unit/typescript-extraction.test.ts
Task: T041 project discovery tests in tests/unit/project-discovery.test.ts
Task: T042 relationship resolution tests in tests/unit/relationship-resolution.test.ts
Task: T043 persistence integration tests in tests/integration/system-model-persistence.test.ts
```

### User Story 4

```text
Task: T053 summary contract tests in tests/contract/analysis-summary.test.ts
Task: T054 summary lifecycle integration tests in tests/integration/analysis-summary.test.ts
Task: T055 completion-policy unit tests in tests/unit/run-completion-policy.test.ts
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1 to connect and retrieve an authorized GitHub repository.
3. Validate US1 independently; this is the smallest demonstrable product increment.
4. Add US2 for durable, revision-pinned analysis and visible progress.
5. Add US3 for the evidence-backed model and conservative relationships.
6. Add US4 for counts, partial/failure summaries, and user-facing results.
7. Complete the cross-cutting performance, security, and operational review.

### Incremental Delivery

- Each story has explicit independent acceptance criteria and its own unit/integration/contract coverage.
- The feature's end-to-end outcome requires US1→US2→US3→US4; analyzer packages may be developed in parallel using fixtures once shared contracts are stable.
- Defer all non-goal product capabilities and do not expand beyond GitHub, JavaScript/TypeScript/TSX, and PostgreSQL in this delivery.

## Notes

- All tasks use checkbox + sequential task ID + optional `[P]` + required `[US#]` in user-story phases + concrete file paths.
- Exact entity enums and constraints are defined in `data-model.md`; API field shapes and error responses are defined in `contracts/openapi.yaml`.
- Retry count/backoff caps and excerpt-size limit must be selected as explicit implementation configuration and covered by tests; they are not fixed by the current product spec.
