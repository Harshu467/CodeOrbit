# CodeOrbit Constitution

## Core Principles

### 1. Evidence Before Inference
The system MUST distinguish observed repository evidence from inferred conclusions. Important relationships, architectural claims, flows, dependencies, and investigation results SHOULD retain traceable evidence such as file, symbol, and line information when available.

### 2. System Model Over File Search
CodeOrbit MUST model software as connected systems rather than treat the repository as a flat collection of files. Repository intelligence SHOULD connect files, symbols, projects, APIs, dependencies, data, events, tests, runtime boundaries, and history where available.

### 3. Explainable Intelligence
AI-generated answers MUST be grounded in retrieved CodeOrbit evidence. The system MUST NOT invent source locations, relationships, runtime behavior, test results, historical changes, or dependencies.

### 4. Incremental and Extensible Architecture
The platform MUST support adding languages, repository providers, analyzers, intelligence domains, and storage/search implementations without redesigning the core system model.

### 5. Safe Engineering Change
Impact analysis and change planning MUST favor completeness of affected dependencies and explicit uncertainty over unsupported certainty. Proposed changes SHOULD identify affected symbols, consumers, tests, flows, and boundaries when evidence permits.

### 6. Observable Analysis
Repository ingestion and analysis MUST be represented as explicit runs with status, progress, errors, and reproducible inputs. A user MUST be able to understand whether an analysis is complete, partial, or failed.

### 7. Product Scope Discipline
Each feature specification MUST define explicit goals and non-goals. The initial product SHOULD prioritize a working evidence-backed code intelligence foundation before advanced visualization, autonomous agents, or broad integrations.

## Quality Standards

- Prefer deterministic analysis for facts that can be derived from source code.
- Preserve provenance through the analysis pipeline.
- Fail explicitly when required evidence is unavailable.
- Keep domain models independent from UI presentation.
- Optimize for maintainability and testability before premature scale optimization.

## Governance

These principles apply to all CodeOrbit specifications and implementation plans. Any proposed exception MUST be documented in the relevant specification or design decision with its rationale and affected principles.
