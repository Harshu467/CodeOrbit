# CodeOrbit

CodeOrbit connects authorized GitHub repositories to a durable, evidence-backed
JavaScript/TypeScript analysis pipeline. Runs are pinned to immutable revisions;
status, stage progress, source locations, partial results, and failures remain
inspectable. Full source files are processed transiently and are not persisted as
evidence.

## Local development

Requirements: Node.js 20+, pnpm, and Docker Compose.

```sh
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
```

Set `API_AUTH_TOKEN`, `WEB_ACCESS_PASSWORD`, and `SESSION_SECRET` to local-only
random secrets in `.env`. Create the initial development workspace/member using
the SQL shown in
[the feature quickstart](specs/001-evidence-backed-analysis/quickstart.md),
then start the API, worker, and web app with `pnpm dev`.

To connect live GitHub repositories, configure a GitHub App and its selected
repository read-only permissions as described in
[docs/github-app-setup.md](docs/github-app-setup.md). Do not use production
credentials in local development.

## Validation

```sh
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:contract
```

PostgreSQL integration tests require `DATABASE_URL` and the current schema.
`tests/performance/analysis-read-path.test.ts` additionally requires
`ANALYSIS_PERFORMANCE_RUN_ID` pointing to a representative standard-fixture run.

See [the feature quickstart](specs/001-evidence-backed-analysis/quickstart.md)
for end-to-end fixture, revision-pinning, and failure scenarios, and
[docs/extending-analysis.md](docs/extending-analysis.md) for analyzer/provider
boundaries.
