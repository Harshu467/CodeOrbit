# Research: Evidence-Backed Repository Analysis

Research is scoped to the explicit technology and product constraints in the feature spec. The current repository contains specifications and Spec Kit configuration but no application code or dependency manifests; therefore this phase defines the V1 design baseline rather than claiming compatibility with existing runtime conventions.

## 1. Provider-neutral repository acquisition

**Decision**: Define a source-provider port that can enumerate authorized sources, resolve a requested ref to an immutable snapshot revision, and acquire that exact snapshot. Implement GitHub as an adapter backed by GitHub App installation authorization. Keep the App private key and short-lived installation tokens in a secret boundary, never in core repository/run records. Limit installation access and each acquisition token to the selected repository and read-only content permission. Retry acquisition against the already resolved revision, never re-resolve a moving branch during a retry.

**Rationale**: GitHub's selected-repository installation model and installation-token repository/permission scoping support least privilege. Immutable revision pinning makes findings reproducible while keeping provider identifiers and credentials outside the domain model.

**Alternatives considered**: PATs would couple access to a user's long-lived secret and wider scopes; public-only access excludes requested private-repository use; storing GitHub installation IDs on the core Repository would make the domain provider-specific. A source archive may be considered later but requires its own credential-safe redirect and integrity validation.

**Sources**:
- [GitHub App installation setup](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)
- [List repositories accessible to an installation](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation)
- [Choose GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Generate a scoped installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [GitHub App security best practices](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)
- [Get a Git reference](https://docs.github.com/en/rest/git/refs#get-a-reference)

## 2. Deterministic JavaScript/TypeScript parsing

**Decision**: Use Tree-sitter grammars for JavaScript, TypeScript, and TSX, with version-pinned grammar/query bundles and language-specific queries plus limited post-processing. Extract declarations and syntax-backed references with start/end spans. Normalize persisted line/column locations to one-based coordinates; test Unicode source so parser byte offsets are not confused with user-visible columns. Detect `ERROR` and `MISSING` nodes and retain unaffected findings while marking affected source ranges/files incomplete. Treat syntax call sites as observed syntax; resolve call targets or specialized event/database relationships only where the analyzer's explicit deterministic rules support them.

**Rationale**: Tree-sitter provides resilient concrete syntax trees and source locations across incomplete code; queries make common declaration/reference capture concise and testable. Syntax alone cannot prove runtime behavior or resolve every dynamic target, so evidence and confidence classification must remain conservative.

**Alternatives considered**: Regular expressions are brittle for nested syntax and source positions. A full TypeScript compiler program offers more semantic resolution but adds project/configuration and dependency-resolution complexity; defer it unless requirements expand. A generic tree walk remains appropriate for syntax patterns queries cannot express cleanly.

**Sources**:
- [Tree-sitter query syntax](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html)
- [Tree-sitter query operators and captures](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/2-operators.html)
- [Tree-sitter parsing and node positions](https://tree-sitter.github.io/tree-sitter/using-parsers/2-basic-parsing.html)
- [Tree-sitter JavaScript grammar and tags query](https://github.com/tree-sitter/tree-sitter-javascript)
- [Tree-sitter TypeScript grammar](https://github.com/tree-sitter/tree-sitter-typescript)
- [Tree-sitter ABI compatibility](https://tree-sitter.github.io/tree-sitter/using-parsers/7-abi-versions.html)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)

## 3. Durable run and stage lifecycle

**Decision**: Represent each run and each named stage as durable PostgreSQL records. Claim queued work with a short transaction and lease/attempt generation, commit before expensive analysis, then persist stage results and transition together. Retry classified transient failures with bounded attempts, capped exponential backoff and jitter; do not retry permanent permission, validation, or unsupported-input errors. Persist attempt/error details and mark exhausted runs failed with the affected stage. A failed required stage cannot yield a completed run; recoverable file-level errors or non-required work may yield partial results.

**Rationale**: Durable stage state allows users to inspect progress and lets workers recover without pretending the run completed. PostgreSQL uniqueness constraints and row-level locking provide concurrency-safe deduplication and work claiming. Stage-boundary retries avoid repeating every completed step and avoid relying on exactly-once execution.

**Alternatives considered**: A single volatile in-memory job or JSON progress field loses reliable queryable stage state. Holding a database transaction open during source acquisition/parsing is unsafe. A dedicated broker/workflow engine is deferred until throughput or scheduling needs justify additional infrastructure.

**Completion policy**: All seven named stages must reach a successful outcome for `completed`. A file- or project-scoped issue with useful model data retained results in `partial`. An acquisition failure, a pipeline-wide required-stage failure, or a run with no useful durable model results in `failed`. A transient worker failure that exhausts its bounded retries always fails the run, as required by FR-021, even if earlier stage outputs remain available. Failure to persist model output must never be converted to success; a run record should be committed before dispatch so the system can report a terminal error when storage becomes available again.

**Sources**:
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)
- [PostgreSQL SELECT locking and SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [Google long-running operations pattern](https://google.aip.dev/151)
- [Google request idempotency guidance](https://google.aip.dev/155)
- [Temporal retry policies](https://docs.temporal.io/encyclopedia/retry-policies)
- [AWS retry with backoff guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html)
- [AWS transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)

## 4. API shape and duplicate work

**Decision**: Use versioned HTTP resource operations. Repository creation returns a repository resource; run creation returns `202 Accepted` and a durable run identifier; status and summary are separately retrievable resources. Accept an idempotency key for client retries and enforce it with a uniqueness constraint. Independently deduplicate active work for the same repository snapshot and analysis configuration, unless the caller explicitly requests a distinct run. Report same-key/different-request reuse as a conflict.

**Rationale**: Repository analysis is long-running and must not occupy the create request until completion. Durable resource URLs and explicit status responses expose lifecycle and failure consistently.

**Alternatives considered**: A synchronous analysis endpoint is unsuitable for an operation with observable stages and worker retries. In-memory deduplication is unsafe under multiple API instances.

**Source**: [Google long-running operations pattern](https://google.aip.dev/151), [Google request idempotency guidance](https://google.aip.dev/155), [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html).

## 5. Evidence retention and uncertainty

**Decision**: Persist the immutable revision, repository-relative path, one-based source locations, typed finding/relationship, and only short excerpts needed to substantiate findings. Do not persist full source files as evidence. Keep extraction facts deterministic; preserve unresolved targets and parse damage as explicit issues rather than manufacturing confident edges.

**Rationale**: This meets the spec's explainability and privacy requirements while maintaining a stable audit trail for a snapshot.

**Alternatives considered**: Storing full snapshots as evidence increases code retention and exposure. Retaining locations only reduces storage but weakens independent review if provider access later changes; short excerpts balance traceability and minimization.

## Resolved spec choices

- Initial production provider: GitHub App integration; the source-provider boundary remains provider-neutral.
- Initial source languages: JavaScript, TypeScript, and TSX under Tree-sitter.
- Persistence: PostgreSQL.
- Maximum expected repository size: 1 million source lines; beyond configured limits, report partial scope.
- Worker failure: bounded retries for transient failures, then explicit failed status.
- Evidence retention: paths, locations, and short excerpts only.

No unresolved implementation-blocking technical choices remain. The exact retry attempt count, backoff values, resource thresholds, and supported relationship conventions are implementation policy values to be set and covered by tests; they do not change the product-level scope.
