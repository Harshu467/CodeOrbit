# Feature Specification: Evidence-Backed Repository Analysis

**Feature Branch**: `001-evidence-backed-analysis`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Build the first CodeOrbit product capability: evidence-backed repository analysis. Let engineers connect a source repository, analyze it, and retrieve a persistent, evidence-backed model of its files, projects/modules, symbols, APIs, tests, dependencies, relationships, and source evidence. GitHub is the first source provider behind an abstract provider boundary. The initial analyzer supports JavaScript and TypeScript and must expose analysis creation, progress, status, and summary. Keep later CodeOrbit capabilities out of scope."

## Clarifications

### Session 2026-10-03

- Q: How should engineers authorize CodeOrbit to access GitHub repositories, including private repositories? → A: Use GitHub App installation authorization, with access limited to repositories selected by the user or organization.
- Q: What repository size should the first release be expected to analyze within the performance target? → A: Support repositories up to 1 million source lines; larger repositories may be marked partial when limits are reached.
- Q: What source detail should CodeOrbit retain as evidence after analysis is complete? → A: Retain repository-relative paths and source locations, plus only short necessary evidence excerpts; do not retain full source files as evidence.
- Q: What should CodeOrbit do if an analysis worker stops unexpectedly while a repository run is in progress? → A: Automatically retry transient failures a limited number of times, then mark the run failed with the stage and reason if retries are exhausted.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a Repository (Priority: P1)

As an engineer, I want to register an accessible source repository so that CodeOrbit can analyze it without tying the system model to a specific hosting provider.

**Why this priority**: Repository access is the entry point for all system intelligence and establishes a reusable repository identity.

**Independent Test**: Register a valid GitHub repository and verify it can be retrieved by its CodeOrbit identifier; submit an invalid or inaccessible source and verify a clear error is returned without a usable repository record being created.

**Acceptance Scenarios**:

1. **Given** an accessible GitHub repository and valid access, **When** an engineer registers it, **Then** CodeOrbit returns a repository identifier and records its canonical source identity.
2. **Given** a repository source that cannot be accessed or resolved, **When** an engineer registers it, **Then** CodeOrbit reports a clear failure and does not represent the source as successfully connected.
3. **Given** a repository connected through the initial provider, **When** its repository identity is inspected, **Then** the core repository record uses provider-neutral identity and does not require GitHub-specific concepts.
4. **Given** an engineer connects a private GitHub repository, **When** CodeOrbit requests access, **Then** authorization is granted through a GitHub App installation and limited to repositories selected by the user or organization.

---

### User Story 2 - Analyze a Repository and Track Progress (Priority: P1)

As an engineer, I want to start an analysis and see its progress so that I know what CodeOrbit is doing and whether it completed.

**Why this priority**: The analysis run is the explicit, observable unit of work and is necessary to trust all resulting model data.

**Independent Test**: Start an analysis for a connected repository, retrieve the run while it progresses, and verify stage statuses and final status are available.

**Acceptance Scenarios**:

1. **Given** a connected repository, **When** an engineer starts analysis, **Then** CodeOrbit creates a uniquely identifiable run and exposes its current status.
2. **Given** an analysis run is active, **When** its status is requested, **Then** the response identifies progress through acquisition, file discovery, language detection, parsing, symbol extraction, relationship extraction, and persistence.
3. **Given** another request targets the same repository revision while analysis is already active, **When** the request does not explicitly request a separate run, **Then** CodeOrbit avoids duplicate concurrent work and identifies the existing run.
4. **Given** analysis of one repository revision has completed, **When** a different revision is analyzed, **Then** the resulting run is distinguishable from the earlier run and retains its own snapshot identity.

---

### User Story 3 - Build a Connected, Evidence-Backed System Model (Priority: P1)

As an engineer, I want CodeOrbit to model supported source code and its relationships so that I can understand how the repository is organized and connected.

**Why this priority**: A connected model with traceable evidence is the product's foundational value, beyond a listing of repository files.

**Independent Test**: Analyze a representative JavaScript/TypeScript fixture repository and inspect its persisted model for expected files, projects, symbols, APIs, tests, configuration, dependencies, relationships, and source evidence.

**Acceptance Scenarios**:

1. **Given** a repository snapshot containing supported source and project metadata, **When** analysis reaches completion, **Then** CodeOrbit records discovered files and directories, detected languages, and projects/modules.
2. **Given** supported JavaScript or TypeScript source files, **When** those files are analyzed, **Then** discoverable functions, classes, interfaces, symbols, APIs, imports, exports, tests, and relevant configuration are represented with source locations when available.
3. **Given** repository evidence supports a relationship, **When** relationships are extracted, **Then** CodeOrbit records the relationship kind and links it to the supporting file and source location when available.
4. **Given** repository evidence indicates calls, inheritance, implementation, references, project dependencies, API exposure, event publishing or consumption, database reads or writes, or tests, **When** the analyzer can establish the connection, **Then** it records the supported relationship without asserting unsupported facts.
5. **Given** a relationship target cannot be resolved from available evidence, **When** analysis records the relationship, **Then** it marks the relationship as unresolved or inferred rather than observed.
6. **Given** a repository contains unsupported languages or files that cannot be parsed, **When** analysis completes, **Then** those items are explicitly reported as unsupported, skipped, or failed without suppressing valid findings from other files.

---

### User Story 4 - Inspect Analysis Results and Failures (Priority: P1)

As an engineer, I want to retrieve an analysis summary and its issues so that I can judge the completeness and usefulness of the model.

**Why this priority**: Users need to distinguish useful partial results from complete results and understand failed analysis without relying on hidden system behavior.

**Independent Test**: Retrieve a completed run summary, then repeat with a fixture that causes a stage or file failure; verify counts, status, and actionable error information in both cases.

**Acceptance Scenarios**:

1. **Given** an analysis run, **When** its summary is requested, **Then** CodeOrbit reports the run status and aggregate counts for files, projects/modules, symbols, APIs, tests, dependencies, and relationships.
2. **Given** a run has skipped or failed stages or files but retains useful results, **When** its summary is requested, **Then** it is marked partial and identifies the incomplete portions.
3. **Given** a required analysis stage fails, **When** its summary is requested, **Then** the run is marked failed or partial, includes the failure reason, and is never presented as fully complete.
4. **Given** an unknown run identifier is requested, **When** the status or summary is retrieved, **Then** CodeOrbit returns a not-found result rather than an empty success-shaped response.

### Edge Cases

- A repository is empty, too large for configured analysis limits, or contains no supported source files.
- A repository exceeds the initial target of 1 million source lines.
- A repository revision changes while acquisition or analysis is in progress.
- The provider becomes unavailable or access is revoked during acquisition.
- Some project metadata is malformed, nested projects overlap, or dependency references cannot be resolved.
- A source file is binary, generated, vendored, ignored, or syntactically invalid.
- The same symbol name appears in multiple files or scopes.
- Relationship evidence exists but its target cannot be uniquely determined.
- A persistence failure occurs after extraction has produced partial results.
- An analysis is retried after a failure or submitted concurrently for the same repository revision.
- An analysis worker stops unexpectedly during a stage, including after retries have been exhausted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an engineer to create and retrieve a repository record through a provider-neutral source identity.
- **FR-002**: The system MUST accept repository sources through an abstract source-provider boundary, with GitHub as the initial provider.
- **FR-003**: The system MUST create a uniquely identifiable analysis run whenever a repository revision is analyzed and retain the snapshot or revision identity used.
- **FR-004**: The system MUST expose operations to create a repository, start an analysis, retrieve run status, and retrieve a run summary.
- **FR-005**: The system MUST report run lifecycle states that distinguish queued, running, completed, partial, and failed analysis.
- **FR-006**: The system MUST track progress and outcomes for acquisition, file discovery, language detection, parsing, symbol extraction, relationship extraction, and persistence.
- **FR-007**: The system MUST discover repository files and directories and identify supported, unsupported, skipped, and failed items.
- **FR-008**: The system MUST detect languages and analyze JavaScript and TypeScript source in the initial release.
- **FR-009**: The system MUST use deterministic Tree-sitter-based parsing for supported JavaScript and TypeScript source.
- **FR-010**: The system MUST identify projects/modules and extract discoverable symbols, functions, classes, interfaces, APIs, imports, exports, tests, and relevant configuration from repository evidence.
- **FR-011**: The system MUST extract supported relationships for imports, calls, inheritance, implementation, references, project dependencies, API exposure, event publishing or consumption, database reads or writes, and tests when evidence permits.
- **FR-012**: The system MUST preserve source evidence for important extracted facts, including repository-relative file path and source location when available, and may retain only short excerpts needed to explain the fact rather than full source files.
- **FR-013**: The system MUST distinguish directly observed relationships from inferred, unresolved, or otherwise uncertain relationships.
- **FR-014**: The system MUST persist repository records, analysis runs, model entities, relationships, stage outcomes, and relevant errors so results can be retrieved after the run ends.
- **FR-015**: The system MUST provide analysis summaries with counts for files, projects/modules, symbols, APIs, tests, dependencies, and relationships.
- **FR-016**: The system MUST represent incomplete or failed analysis explicitly, retain useful partial results where possible, and MUST NOT report a run as complete when a required stage has failed.
- **FR-017**: The system MUST avoid duplicate concurrent work for the same repository revision unless a separate run is explicitly requested.
- **FR-018**: The system MUST support adding source providers and language analyzers without requiring provider-specific concepts in the core repository and analysis model.
- **FR-019**: The system MUST include automated unit, integration, and contract tests for repository registration, analysis lifecycle and progress, extraction and evidence, summaries, and error/partial-result behavior.
- **FR-020**: The initial GitHub provider MUST use GitHub App installation authorization and MUST access only repositories selected by the user or organization.
- **FR-021**: The system MUST automatically retry transient analysis-worker failures using a bounded retry policy; if retries are exhausted, it MUST mark the run failed and identify the affected stage and failure reason.

### Non-Functional Requirements

- **NFR-001**: Analysis facts that can be derived deterministically from source MUST be produced without relying on generative inference.
- **NFR-002**: Every reported observed relationship MUST be traceable to retained repository evidence; unavailable source locations MUST be identified as unavailable rather than fabricated. Retained evidence MUST be limited to repository-relative paths, source locations, and short relevant excerpts; full source files MUST NOT be retained as evidence.
- **NFR-003**: Each analysis stage MUST expose a state and any applicable error so that users can distinguish active, completed, partial, and failed work.
- **NFR-004**: The core model MUST remain independent of provider-specific metadata and user-interface presentation.
- **NFR-005**: Repository access information and retained source excerpts MUST be handled as sensitive data and MUST NOT be exposed in analysis summaries or ordinary error messages.
- **NFR-006**: For a standard analysis fixture, status and summary retrieval MUST complete within two seconds at the 95th percentile, excluding time spent performing repository analysis.
- **NFR-007**: The system MUST support analysis of repository snapshots up to 1 million source lines; if larger snapshots exceed configured resource limits, the run MUST be marked partial and identify the unprocessed scope.

### Key Entities *(include if feature involves data)*

- **Repository**: Provider-neutral identity and source reference for a repository connected to CodeOrbit.
- **Analysis Run**: A uniquely identified analysis of a specific repository snapshot, including lifecycle status, stage progress, timestamps, and errors.
- **Analysis Stage**: A named unit in the analysis pipeline with its own progress state and outcome.
- **Directory**: A discovered directory within a repository snapshot, related to files and potentially to a project/module.
- **Project/Module**: A logical repository component identified from project metadata or repository structure.
- **File**: A repository-relative file with detected language, disposition, and optional project association.
- **Symbol**: A source construct such as a function, class, interface, or other discoverable declaration, with its file and location.
- **API**: A source-backed interface exposed by a project or module.
- **Test**: A source-backed test file, test case, or test-to-code association.
- **Dependency**: A declared or observed dependency between projects, modules, packages, or external components.
- **Relationship**: A typed connection between model entities, with an observed, inferred, or unresolved state.
- **Source Evidence**: The repository snapshot, file path, source location, and supporting source detail associated with an extracted fact.
- **Analysis Issue**: A skipped item, unresolved reference, warning, or failure that explains incomplete analysis.

### Initial Technology Constraints

- The initial product uses TypeScript and Node.js 20 or later.
- The web application uses Next.js and React; the API and analysis worker use Node.js and TypeScript.
- Persistent model data is stored in PostgreSQL.
- JavaScript and TypeScript parsing uses Tree-sitter.
- Automated tests use Vitest or Jest.

### Non-Goals

- Architecture intelligence, flow exploration, change impact, test intelligence beyond repository-derived test relationships, failure intelligence, repository history intelligence, and AI investigation.
- Three-dimensional visualization, vector databases, graph databases, autonomous agents, runtime tracing, automatic code modification, or AI question answering.
- Providers beyond the initial GitHub provider as production integrations in this feature; provider extension points are in scope, but additional provider implementations are not.
- Full semantic understanding of every language or every possible dynamic relationship; unsupported and unresolved facts remain explicit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a valid repository fixture, an engineer can register the source, start analysis, and retrieve a run summary using the documented product operations.
- **SC-002**: On the standard JavaScript/TypeScript fixture, all predefined expected projects/modules, files, symbols, APIs, tests, and evidence-backed relationships are present in the resulting model.
- **SC-003**: Every predefined observed relationship in the fixture links to a source file and source location; every deliberately ambiguous fixture relationship is labeled inferred or unresolved.
- **SC-004**: All seven required analysis stages are visible in run progress, and each run ends in an explicit completed, partial, or failed state.
- **SC-005**: In tests that inject inaccessible sources, unsupported files, parse failures, and persistence-stage failures, the run response identifies the affected stage or items and never reports false completion.
- **SC-006**: At least 95% of status and summary requests for the standard fixture complete within two seconds, excluding time spent performing analysis.
- **SC-007**: Unit, integration, and contract test suites pass for the core repository-analysis scenarios before the feature is considered ready.
- **SC-008**: A repository snapshot up to 1 million source lines is either analyzed to completion or reported as partial with the affected scope and reason visible in its summary.

## Assumptions

- GitHub access is authorized through a GitHub App installation limited to repositories selected by the user or organization.
- The first release analyzes a stable revision or snapshot, not a live mutable working tree, so results can be reproduced and compared.
- Generated, vendored, binary, ignored, and overly large content may be excluded according to documented defaults; excluded content is reported when relevant to completeness.
- A useful partial model should be retained when non-required items fail, while failures in required pipeline stages prevent a completed status.
- The feature adds no hard language-support promise beyond JavaScript and TypeScript for initial source parsing; other files may still be discovered and categorized.
- The initial provider is GitHub, but canonical repository, run, and model records do not require GitHub identifiers or vocabulary.
