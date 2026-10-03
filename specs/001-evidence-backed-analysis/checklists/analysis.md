# Analysis Requirements Checklist: Evidence-Backed Repository Analysis

**Purpose**: Review the completeness, clarity, consistency, and testability of repository-analysis requirements  
**Created**: 2026-10-03  
**Feature**: [spec.md](../spec.md)

**Note**: This custom checklist is a reviewer-owned requirements-quality review artifact.  
**Review Ownership**: Mark an item `[x]` only when the reviewer determines the requirements-quality criterion is satisfied.  
**Marker Semantics**: `[x]` means reviewed and satisfactory as a requirement; it does not mean implementation is complete.

## Requirement Completeness

- [ ] CHK001 Are provider-neutral identity and provider-specific authorization responsibilities clearly separated across repository registration and analysis? [Completeness, Spec §FR-001–FR-002, §FR-018]
- [ ] CHK002 Are all facts expected in the initial system model identified, including directory, project, file, symbol, API, test, dependency, relationship, evidence, stage, and issue data? [Completeness, Spec §Key Entities, §FR-007, §FR-010–FR-015]
- [ ] CHK003 Are the supported project metadata and configuration categories sufficiently defined to make project, module, and dependency discovery expectations consistent? [Gap, Spec §FR-010–FR-011]
- [ ] CHK004 Are the initial GitHub authorization and repository-selection boundaries explicit for both public and private repositories? [Completeness, Spec §FR-020, §Assumptions]
- [ ] CHK005 Are user-visible behavior and acceptance criteria for the web application defined, or is the web interface explicitly limited to a future phase? [Gap, Spec §Initial Technology Constraints, §User Scenarios]

## Requirement Clarity

- [ ] CHK006 Are “short relevant excerpts” and the maximum retained excerpt size defined well enough to enforce source-retention limits? [Ambiguity, Spec §FR-012, §NFR-002]
- [ ] CHK007 Are the supported conventions for identifying APIs, tests, event publishing/consumption, and database reads/writes explicit enough to distinguish observed from unresolved findings? [Clarity, Spec §FR-010–FR-013]
- [ ] CHK008 Are the source-location coordinate rules consistent between one-based public locations and parser byte offsets, including Unicode columns and end-position inclusivity? [Clarity, Spec §FR-012, §NFR-002]
- [ ] CHK009 Are “useful partial results,” “required stage,” and “pipeline-wide failure” defined with objective criteria for choosing `partial` versus `failed`? [Ambiguity, Spec §FR-005–FR-006, §FR-016, §FR-021]
- [ ] CHK010 Are repository-size and analysis-limit measures defined consistently (source lines versus total lines/files/bytes) for the one-million-line target? [Clarity, Spec §NFR-007, §SC-008]

## Requirement Consistency

- [ ] CHK011 Do the requirements consistently distinguish run status `failed` after exhausted worker retries from `partial` when useful results remain? [Consistency, Spec §FR-016, §FR-021, §Acceptance Scenarios]
- [ ] CHK012 Do the provider-neutral core identity requirements remain consistent with the GitHub-specific source registration and installation authorization boundary? [Consistency, Spec §FR-001–FR-002, §FR-018, §FR-020]
- [ ] CHK013 Are excluded generated, vendored, ignored, binary, and oversized paths represented consistently in discovered-file counts and completeness reporting? [Consistency, Spec §FR-007, §NFR-007, §Assumptions]

## Acceptance Criteria Quality

- [ ] CHK014 Can each success criterion be evaluated against a defined fixture, expected findings, or measurable threshold without relying on unspecified “standard fixture” contents? [Measurability, Spec §SC-001–SC-008]
- [ ] CHK015 Is the two-second p95 status/summary target accompanied by enough workload and measurement conditions to reproduce acceptance results? [Clarity, Spec §NFR-006, §SC-006]
- [ ] CHK016 Are extraction and relationship requirements traceable to acceptance scenarios covering supported, ambiguous, and unsupported source patterns? [Traceability, Spec §FR-009–FR-013, §User Story 3]

## Scenario and Edge Case Coverage

- [ ] CHK017 Are recovery expectations specified for failures after partial persistence, including which already committed model results remain retrievable? [Coverage, Spec §Edge Cases, §FR-014, §FR-016]
- [ ] CHK018 Are access revocation, missing permissions, GitHub rate limits, and provider unavailability distinguished by retryability and user-visible outcome? [Coverage, Spec §Edge Cases, §FR-020–FR-021]
- [ ] CHK019 Are empty repositories and repositories with no supported source files assigned explicit terminal statuses and summary semantics? [Gap, Spec §Edge Cases, §FR-005, §FR-015–FR-016]
- [ ] CHK020 Are concurrent duplicate requests and explicit distinct reruns defined consistently for both idempotency-key reuse and same-revision analysis? [Clarity, Spec §FR-003, §FR-017]

## Non-Functional Requirements

- [ ] CHK021 Are security requirements for GitHub App private-key storage, installation-token lifetime, scope, revocation, and log redaction complete? [Completeness, Spec §FR-020, §NFR-005]
- [ ] CHK022 Are availability, retention/deletion, backup/recovery, and workspace isolation requirements defined for persisted repository findings and sensitive excerpts? [Gap, Spec §FR-014, §NFR-005]
- [ ] CHK023 Are resource limits and partial-result expectations for the one-million-line target measurable across memory, file count, file size, and runtime? [Coverage, Spec §NFR-007, §SC-008]

## Dependencies & Assumptions

- [ ] CHK024 Are ownership and availability dependencies for GitHub App setup, installation selection, and workspace authorization documented? [Dependency, Spec §FR-020, §Assumptions]
- [ ] CHK025 Are the V1-supported JavaScript, TypeScript, and TSX grammar versions and compatibility policy stated consistently in requirements or explicitly delegated to design? [Clarity, Spec §FR-008–FR-009, §Initial Technology Constraints]

## Ambiguities & Conflicts

- [ ] CHK026 Is the specification's use of “MUST,” “when evidence permits,” and “when available” consistently bounded so optional findings are not mistaken for required complete coverage? [Ambiguity, Spec §FR-010–FR-012]
- [ ] CHK027 Are scope boundaries clear between repository-derived test relationships in this feature and the explicitly excluded later test-intelligence capability? [Consistency, Spec §Non-Goals, §FR-011]

## Notes

- All items are intentionally unchecked for reviewer evaluation; checklist state concerns requirement quality, not implementation completion.
- `/speckit-implement` reads checklist checkbox state as a gate and must not modify markers.
- `checklists/requirements.md` is the separate built-in specification-quality checklist and was not changed by this custom checklist.
- Checklist items reference the feature spec's FR, NFR, SC, scenario, entity, and non-goal sections where possible.

## Security & Privacy Requirements

- [ ] CHK028 Does the authorization requirement distinguish GitHub App installation access to selected private repositories from access to publicly available repositories? [Clarity, Spec §FR-020]
- [ ] CHK029 Are requirements for GitHub App private-key custody, short-lived installation-token scope, expiration, revocation, and log redaction explicit? [Completeness, Spec §FR-020, §NFR-005]
- [ ] CHK030 Are authorization and workspace-isolation requirements stated for repository creation/listing, run creation/status, summaries, and retained evidence? [Coverage, Spec §FR-001, §FR-004, §NFR-005]
- [ ] CHK031 Are source-excerpt access, retention duration, and deletion expectations defined in addition to the prohibition on retaining full source files? [Gap, Spec §FR-012, §FR-014, §NFR-002, §NFR-005]
- [ ] CHK032 Are permission revocation, installation removal, and reauthorization expectations defined without exposing provider credentials or repository contents in errors? [Coverage, Spec §Edge Cases, §FR-020, §NFR-005]

## API Contract Requirements

- [ ] CHK033 Are connection authorization and the source-selection exchange specified as user-facing flows, not only as a provider field in repository creation? [Gap, Spec §User Story 1, §FR-001–FR-002, Contract §CreateRepositoryRequest]
- [ ] CHK034 Are request validation, inaccessible source, permission denial, rate limiting, and internal failure responses clearly distinguished and consistently sanitized? [Completeness, Spec §FR-001, §FR-020–FR-021, Contract §Responses]
- [ ] CHK035 Are successful repository registration, duplicate registration, and idempotent retry outcomes clearly distinguished by status and resource identity? [Clarity, Spec §FR-001, Contract §POST /repositories]
- [ ] CHK036 Are request idempotency and active-run deduplication defined together for same-key retries, different payload reuse, and distinct-run requests? [Consistency, Spec §FR-017, Contract §IdempotencyKey]
- [ ] CHK037 Are required fields and availability rules clear for run status during acquisition, after a pinned revision exists, and in every terminal state? [Clarity, Spec §FR-003, §FR-005–FR-006, Contract §AnalysisRun]
- [ ] CHK038 Are summary count definitions clear about excluded, unsupported, skipped, failed, partial, and unresolved repository items? [Clarity, Spec §FR-007, §FR-015–FR-016, Contract §AnalysisSummary]
- [ ] CHK039 Are API versioning, pagination, and maximum response-size expectations specified for repository and issue/summary collections? [Gap, Spec §FR-004, Contract §Paths]
- [ ] CHK040 Are run and summary resource visibility rules clear when a resource exists in another workspace, so authorization failures cannot disclose its existence? [Security, Spec §FR-001, §FR-004, §NFR-005, Contract §NotFound]

## Notes

- This appended section uses standard depth with security/privacy and API-contract quality as the default high-impact focus areas; all new items remain unchecked for reviewer evaluation.
- Items CHK028–CHK040 are requirements-quality prompts, not implementation or runtime tests.
