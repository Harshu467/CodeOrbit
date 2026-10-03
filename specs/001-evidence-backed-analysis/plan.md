# Implementation Plan: Evidence-Backed Repository Analysis

**Branch**: `001-evidence-backed-analysis` | **Date**: 2026-10-03 | **Spec**: `/specs/001-evidence-backed-analysis/spec.md`

**Input**: Feature specification from `/specs/001-evidence-backed-analysis/spec.md`

## Summary

Build the first CodeOrbit capability as a provider-neutral repository model and a durable, observable analysis pipeline. A GitHub App-backed source adapter will authorize selected repositories, resolve a mutable ref to an immutable revision, and provide a stable snapshot to a TypeScript/JavaScript Tree-sitter 
analyzer. The Node.js API and worker persist runs, pipeline stages, findings, and compact source evidence in PostgreSQL; users can create repositories and runs and retrieve run status and summaries. Bounded retry of transient worker failures, explicit partial/failure outcomes, and provenance on observed relationships are core behavior.

## Technical Context

**Language/Version**: TypeScript on Node.js 20+.

**Primary Dependencies**: Next.js and React for the web application; Node.js/TypeScript API and worker; PostgreSQL; Tree-sitter JavaScript, TypeScript, and TSX grammars; GitHub App APIs; Vitest or Jest.

**Storage**: PostgreSQL for repositories, provider bindings, runs, stages, discovered model entities, relationships, evidence, and issues. Retain no complete source files as evidence; keep only repository-relative paths, source locations, and short relevant excerpts.

**Testing**: Unit tests for domain transitions, source-provider adapters, parsing and extraction; integration tests against PostgreSQL and local repository fixtures; HTTP contract tests for repository, run, status, and summary operations. Use Vitest or Jest consistently across packages.

**Target Platform**: Node.js 20+ services and worker, PostgreSQL, and a Next.js/React web application. GitHub is the only production source provider in this release.

**Project Type**: TypeScript monorepo containing a web application, API service, analysis worker, and shared domain/analyzer/persistence packages.

**Performance Goals**: Status and summary requests meet the spec's 2-second p95 target on the standard fixture. Analyze snapshots up to 1 million source lines; larger or resource-limited snapshots must report partial status and affected scope. No end-to-end analysis-time SLA is specified.

**Constraints**: Pin analysis to an immutable provider revision; use GitHub App installation authorization limited to user/organization-selected repositories; keep provider-specific identifiers and secrets out of the core domain model; persist every stage outcome; retry transient worker failures only with a bounded policy; never mark required-stage failures completed; never retain full source files as evidence.

**Scale/Scope**: One connected repository snapshot per run, with duplicate concurrent work avoided for the same repository revision unless explicitly overridden. Initial language parsing is JavaScript, TypeScript, and TSX. No additional production provider or later CodeOrbit intelligence capability is included.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence Before Inference — PASS**: Persist revision-pinned source evidence and distinguish observed findings from inferred or unresolved relationships; no unsupported target resolution.
- **System Model Over File Search — PASS**: The model represents repositories, runs, stages, directories, projects, files, symbols, APIs, tests, dependencies, relationships, and evidence as connected records.
- **Explainable Intelligence — PASS**: The feature uses deterministic analysis and exposes provenance, stage outcomes, errors, and partial scope; AI answers are out of scope.
- **Incremental and Extensible Architecture — PASS**: Provider adapters and language analyzers implement separate ports; provider metadata stays outside core entities.
- **Safe Engineering Change — PASS**: Ambiguous/dynamic relationships remain uncertain, and incomplete analysis remains visible.
- **Observable Analysis — PASS**: Durable runs and individually persisted stages carry lifecycle state, progress, and errors across worker restarts.
- **Product Scope Discipline — PASS**: The plan excludes visualization, AI, runtime tracing, modification, graph/vector databases, and later intelligence products.

No constitution violations require exceptions. The security and privacy requirements for GitHub authorization and compact evidence retention are incorporated into the design.

## Project Structure

### Documentation (this feature)

```text
specs/001-evidence-backed-analysis/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── web/                         # Next.js + React repository and run experience
├── api/                         # Node.js/TypeScript HTTP API
└── analysis-worker/             # Durable analysis-stage execution
packages/
├── domain/                      # Provider-neutral entities, IDs, and transitions
├── source-providers/
│   ├── contracts/               # Provider port and normalized acquisition results
│   └── github/                  # GitHub App integration and immutable snapshot acquisition
├── analyzers/
│   ├── contracts/               # Language analyzer contract
│   └── javascript-typescript/   # Tree-sitter grammars, queries, and extraction
├── persistence/                 # PostgreSQL schema, repositories, and transactions
└── api-contracts/               # Shared request/response types generated from OpenAPI
tests/
├── fixtures/repositories/       # Representative JS/TS and failure fixtures
├── unit/
├── integration/
└── contract/
```

**Structure Decision**: Use a monorepo with separately deployable web, API, and worker applications plus shared domain, provider, analyzer, and persistence packages. This matches the required runtime boundaries while keeping the core model free of GitHub concepts and letting additional analyzers/providers be added behind stable contracts.

## Complexity Tracking

No constitution exceptions or unnecessary architectural projects are introduced; the separate packages correspond to explicitly required application, API, worker, provider, and analyzer boundaries.
