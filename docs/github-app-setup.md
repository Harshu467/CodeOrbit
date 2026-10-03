# GitHub App and local database setup

## GitHub App

1. Register a GitHub App owned by the organization or account that will install
   it. Configure the setup URL to the GitHub App installation flow and the
   callback URL to
   `https://<CodeOrbit API host>/api/v1/integrations/github/installations/callback`.
2. Grant repository **Contents: read-only** and **Metadata: read-only** access.
   Do not request write access or organization-wide repository access unless the
   installation administrator explicitly selects those repositories.
3. Enable selected-repository installation access. Confirm the installation
   contains only repositories the workspace intends CodeOrbit to analyze.
4. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`,
   `GITHUB_APP_CLIENT_ID`, and `GITHUB_APP_CLIENT_SECRET` in the API's secret
   manager. Restrict read access to the API service; rotate the private key
   through GitHub and the secret manager as part of incident response.
5. Set `SESSION_SECRET` to a high-entropy secret. The install state is
   authenticated and expires after ten minutes. Keep the callback on HTTPS in
   deployed environments.

CodeOrbit creates short-lived installation tokens restricted to the selected
repository and read-only content/metadata permissions. Tokens and private keys
must never be added to repository records, logs, browser responses, or support
tickets. Revoked/unselected repository access is an authorization failure; only
transient provider errors are retried by the worker.

## Local PostgreSQL

Copy `.env.example` to `.env`, set a local `DATABASE_URL`, and run:

```sh
docker compose up -d postgres
pnpm db:migrate
```

The Compose database is for development only. Do not expose it to a public
network or reuse its default password. Integration tests use an isolated
workspace and remove it after each suite.

## Metrics and alerting

The API exposes Prometheus text metrics at `/metrics`; the worker exposes them
on `WORKER_METRICS_PORT` (default `9101`). Restrict both endpoints to trusted
monitoring networks. Useful alert conditions include a nonzero
`codeorbit_worker_stuck_leases`, increasing
`codeorbit_worker_retry_exhaustions_total`, sustained growth in stage failure
rates, and increases in `codeorbit_worker_oversized_partials_total`. Alert
thresholds should be calibrated against deployment traffic and fixture sizes.
