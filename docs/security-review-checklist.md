# Analysis security and privacy review

Review performed against the API routes, worker pipeline, persistence layer,
and system-model schema for the V1 implementation.

| Control                     | Implementation evidence                                                                                                                                                                               | Result |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Workspace isolation         | Run, source-binding, summary, issue, and model queries include workspace/run scope; composite foreign keys prevent cross-run model references.                                                        | Pass   |
| Credential handling         | GitHub App private key and short-lived tokens are environment/secret-manager inputs; API logger redaction covers credentials; worker errors persist only validated error codes and generic summaries. | Pass   |
| Excerpt retention           | `analysis_source_evidence.excerpt` is capped at 500 characters; parser excerpts are redacted and truncated to 500 Unicode code points.                                                                | Pass   |
| Full source retention       | Full contents are read only inside the worker pipeline; persistence accepts findings, bounded excerpts, paths, locations, and revision, not source buffers.                                           | Pass   |
| Partial and failed analysis | Required stage failures and exhausted retries cannot become completed; item issues and oversized line-limit scope remain visible.                                                                     | Pass   |
| Provider scope              | GitHub adapter validates installation repository selection and uses read-only, repository-scoped installation authorization.                                                                          | Pass   |

Operational notes:

- Protect `/metrics` and the worker metrics port with network policy; metrics
  expose aggregate route and processing behavior.
- Source snapshots are temporary worker files and are cleaned after model
  persistence or an analysis failure.
- The current V1 model has no user-facing connection deletion/retention policy;
  workspace deletion cascades persisted repository and run data. Define an
  explicit product retention policy before production rollout.
- This implementation review does not replace deployment-specific secret
  rotation, monitoring access control, backup protection, or a formal
  organizational security assessment.
