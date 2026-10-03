# Extending providers and language analysis

## Source-provider boundary

Implement `SourceProvider` from
`packages/source-providers/contracts/src/source-provider.ts`. An adapter lists
sources available to an authorized connection, resolves requested refs to
immutable `ResolvedRevision` values, then acquires that exact revision as a
`RepositorySnapshot`. Retries must reuse the resolved revision. Keep credentials
inside the adapter's secret boundary; provider-specific IDs belong in
`SourceBinding` and connection records, not in provider-neutral domain entities.
GitHub is the only production provider in this release.

## Analyzer boundary

Implement `LanguageAnalyzer` from
`packages/analyzers/contracts/src/language-analyzer.ts`. `supports(path)` must
be deterministic, and `analyze` returns source-backed findings and parse issues
with repository-relative paths and one-based source coordinates. Use the
JavaScript/TypeScript analyzer package as prior art for syntax trees, Unicode
column conversion, compact/redacted excerpts, and conservative relationship
resolution. Preserve unresolved targets and parse damage instead of guessing.

Pin grammar and query versions through the workspace lockfile. Add fixture tests
for supported syntax, malformed input, evidence spans, and ambiguous references
before wiring an analyzer into the pipeline. Do not add a production provider or
language without updating the feature scope and API/model compatibility.
