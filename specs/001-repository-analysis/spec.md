# Feature Specification: Repository Analysis & Initial Code Intelligence Model

**Feature Branch**: `001-repository-analysis`
**Created**: 2026-10-03
**Status**: Draft

## Goal

Enable CodeOrbit to accept a Git repository and produce an evidence-backed initial Code Intelligence Model that describes the repository structure, projects, files, symbols, and basic relationships.

## User Scenarios & Testing

### User Story 1 - Connect a Repository (Priority: P1)

As an engineer, I want to provide a Git repository to CodeOrbit so that CodeOrbit can create an analyzable repository snapshot.

**Acceptance Scenarios**

1. **Given** a valid accessible Git repository, **When** the repository is submitted, **Then** CodeOrbit creates an analysis run and reports its status.
2. **Given** an invalid or inaccessible repository, **When** analysis is requested, **Then** CodeOrbit reports a clear failure without creating a false system model.
3. **Given** an analysis is already running for the same repository revision, **When** another request is submitted, **Then** CodeOrbit avoids creating duplicate work unless explicitly requested.

### User Story 2 - Analyze Repository Structure (Priority: P1)

As an engineer, I want CodeOrbit to discover files, languages, projects, and symbols so that the repository becomes a structured model rather than a file listing.

**Acceptance Scenarios**

1. **Given** a repository snapshot, **When** analysis completes, **Then** supported files and their language information are recorded.
2. **Given** project or module metadata exists, **When** analysis completes, **Then** projects/modules and their relationships to files are recorded.
3. **Given** supported source files, **When** analysis completes, **Then** discoverable symbols are recorded with their source locations.
4. **Given** unsupported or unparsable files, **When** analysis completes, **Then** they are reported as skipped or failed without preventing valid portions of the repository from being modeled.

### User Story 3 - Build Evidence-Backed Relationships (Priority: P1)

As an engineer, I want CodeOrbit to connect discovered entities through observable relationships so that I can reason about how the system is structured.

**Acceptance Scenarios**

1. **Given** source code contains an import/reference, **When** analysis completes, **Then** an evidence-backed relationship is recorded.
2. **Given** a symbol invokes another resolvable symbol, **When** analysis completes, **Then** a call relationship is recorded with source evidence when available.
3. **Given** a relationship cannot be resolved confidently, **When** analysis completes, **Then** CodeOrbit records the uncertainty rather than inventing a target.

### User Story 4 - Inspect Analysis Results (Priority: P1)

As an engineer, I want a summary of an analysis run so that I can tell what CodeOrbit successfully understood.

**Acceptance Scenarios**

1. **Given** an analysis completes, **When** its summary is requested, **Then** CodeOrbit reports counts for files, projects, symbols, and relationships.
2. **Given** analysis is partial, **When** its summary is requested, **Then** the status and incomplete portions are visible.
3. **Given** analysis fails, **When** its summary is requested, **Then** the failure reason is visible and the result is not presented as complete.

## Functional Requirements

- **FR-001**: CodeOrbit MUST accept a repository source and create a uniquely identifiable analysis run.
- **FR-002**: CodeOrbit MUST preserve the repository revision or snapshot identity used for analysis.
- **FR-003**: CodeOrbit MUST discover repository files while excluding configured/generated artifacts where appropriate.
- **FR-004**: CodeOrbit MUST detect supported programming languages and identify unsupported files.
- **FR-005**: CodeOrbit MUST discover projects/modules from supported project metadata and repository structure.
- **FR-006**: CodeOrbit MUST extract symbols from supported source files with source locations.
- **FR-007**: CodeOrbit MUST extract basic relationships including imports/references, calls, inheritance/implementation, and project dependencies when evidence permits.
- **FR-008**: Every persisted relationship SHOULD retain provenance sufficient to locate the supporting source evidence.
- **FR-009**: CodeOrbit MUST distinguish observed evidence from inferred relationships.
- **FR-010**: CodeOrbit MUST expose analysis lifecycle states including queued, running, completed, partial, and failed.
- **FR-011**: CodeOrbit MUST persist analysis errors and skipped/unresolved items.
- **FR-012**: CodeOrbit MUST provide aggregate counts for analyzed entities and relationships.
- **FR-013**: CodeOrbit MUST NOT report an analysis as complete when required analysis stages have failed.
- **FR-014**: Re-running analysis for a different repository revision MUST create a distinguishable analysis result.

## Non-Goals

This feature does not include:

- AI question answering or autonomous investigation.
- Three.js or graph visualization.
- Architecture drift detection.
- Test execution or failure diagnosis.
- Production runtime tracing.
- Multi-provider repository integration beyond the initial repository source required for this feature.
- Vector search or embeddings.
- Automatic code modification.

## Initial Code Intelligence Model

The model SHOULD represent at least:

- Repository
- AnalysisRun
- Project
- File
- Symbol
- Relationship
- SourceEvidence

A relationship SHOULD follow the conceptual shape:

```json
{
  "source": "OrderService.CreateOrder",
  "target": "OrderRepository.Save",
  "type": "calls",
  "confidence": "observed",
  "evidence": {
    "file": "src/services/OrderService.cs",
    "line": 18
  }
}
```

## Success Criteria

- A supported repository can be analyzed from a reproducible snapshot.
- The resulting model contains discoverable repository entities and relationships.
- Important relationships can be traced back to source evidence.
- Partial/failed analysis is explicitly represented.
- The model can serve as the foundation for later architecture, flow, impact, test, and AI investigation features.

## Constraints

- The implementation must follow the CodeOrbit Constitution.
- Deterministic source analysis should be preferred over LLM inference for facts derivable from code.
- The model must remain independent from presentation/UI concerns.
- Initial language support may be deliberately limited; unsupported languages must be represented explicitly rather than silently ignored.

## Open Questions

- Which language should be the first fully supported analyzer?
- Which parser technology should be used for the first language?
- What repository acquisition mechanism should be used for V1?
- Which persistence model should be used for the initial Code Intelligence Model?
- Which generated/vendor directories should be excluded by default?
