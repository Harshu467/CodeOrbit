# Quickstart: Validate Evidence-Backed Repository Analysis

This guide defines implementation-time end-to-end validation for repository registration, analysis, progress, evidence, summaries, and failure behavior. Commands assume the planned pnpm monorepo scripts; add or adjust scripts consistently during implementation.

## Prerequisites

- Node.js 20 or newer and pnpm.
- Docker Compose and a local PostgreSQL service.
- A configured GitHub App with read-only repository contents access and selected-repository installation access for live-provider tests.
- Test fixtures under `tests/fixtures/repositories`, including JavaScript, TypeScript, TSX, tests, manifests, ambiguous calls, malformed syntax, and unsupported files.

## Start local dependencies and services

```sh
pnpm install
cp .env.example .env
# Set long random API_AUTH_TOKEN, WEB_ACCESS_PASSWORD, and SESSION_SECRET values.
docker compose up -d postgres
pnpm db:migrate
docker compose exec -T postgres psql -U codeorbit -d codeorbit <<'SQL'
INSERT INTO workspaces (id, name) VALUES ('local-workspace', 'Local workspace')
ON CONFLICT (id) DO NOTHING;
INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES ('local-workspace', 'local-development-user', 'owner')
ON CONFLICT (workspace_id, user_id) DO NOTHING;
SQL
pnpm dev
```

Configure `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`, and the GitHub App callback URL `http://localhost:4000/api/v1/integrations/github/installations/callback` for live repository connection. The web UI uses `WEB_ACCESS_PASSWORD` for its local shared-password sign-in; API bearer credentials stay server-side.

Expected outcome: the API, web application, and analysis worker start; PostgreSQL schema is current; readiness checks report available database and worker dependencies.

## Run automated checks

```sh
pnpm test
pnpm test:integration
pnpm test:contract
```

Expected outcome: unit tests cover domain, provider, and parsing rules; PostgreSQL integration tests cover run/stage persistence and concurrency; contract tests validate API requests/responses against [the OpenAPI contract](contracts/openapi.yaml).

## Validate an end-to-end fixture analysis

1. Authenticate to the local CodeOrbit API and connect a repository fixture using `POST /api/v1/repositories`.
2. Start analysis with `POST /api/v1/repositories/{repositoryId}/analysis-runs`.
3. Poll `GET /api/v1/analysis-runs/{runId}` until a terminal status is returned.
4. Retrieve `GET /api/v1/analysis-runs/{runId}/summary`.
5. Inspect the persisted model/evidence for fixture expectations.

Expected outcome:

- A run is created with an immutable snapshot revision and all seven stage records.
- The JavaScript/TypeScript fixture's expected directories, projects, files, declarations, exports/APIs, tests, dependencies, and relationships are persisted.
- Every observed relationship has a source path/location and short evidence excerpt where required; ambiguous targets are inferred or unresolved.
- Summary counts match fixture assertions; no full source file is retained as evidence.

## Validate GitHub authorization and revision pinning

1. Install the GitHub App with only the selected private fixture repository and read-only contents permission.
2. Register the repository through the authenticated CodeOrbit provider integration.
3. Start an analysis using a branch ref, then update that branch while analysis is running.
4. Inspect the run revision and repeat acquisition after a simulated transient failure.

Expected outcome: the run analyzes the resolved immutable revision, retries use that same revision, the installation cannot read unselected private repositories, and errors/status output do not contain access tokens.

## Validate partial and failed analysis

Use fixtures for an unsupported language, malformed JS/TS syntax, an inaccessible source, an oversized repository, a transient worker interruption, and a persistence failure.

Expected outcome:

- Unsupported files and parse damage remain visible; unaffected files still produce findings.
- Recoverable incomplete scope is marked `partial` with stage/path/reason details.
- A required stage failure or exhausted bounded retries ends in `failed`; no such run is reported `completed`.
- Status and summary endpoints return within the 2-second p95 target on the standard fixture, independently of analysis runtime.

For entity constraints and transitions, see [data-model.md](data-model.md); for API shapes and error responses, see [contracts/openapi.yaml](contracts/openapi.yaml).
