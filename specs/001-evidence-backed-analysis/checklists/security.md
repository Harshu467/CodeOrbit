# Security Requirements Checklist: Evidence-Backed Repository Analysis

**Purpose**: Review whether repository-access, source-retention, and workspace-isolation requirements are complete and unambiguous  
**Created**: 2026-10-03  
**Feature**: [spec.md](../spec.md)

**Note**: This custom checklist is a reviewer-owned requirements-quality review artifact.  
**Review Ownership**: Mark an item `[x]` only when the reviewer determines the requirements-quality criterion is satisfied.  
**Marker Semantics**: `[x]` means reviewed and satisfactory as a requirement; it does not mean implementation is complete.

## Requirement Completeness

- [ ] CHK001 Are requirements defined for where GitHub App private keys are stored, which service may use them, and how key rotation is handled? [Gap, Spec §FR-020, §NFR-005]
- [ ] CHK002 Are installation-token permissions, repository scope, lifetime, refresh, and revocation requirements explicitly bounded? [Completeness, Spec §FR-020, §Assumptions]
- [ ] CHK003 Are authorization requirements specified for repository registration, repository listing, analysis creation, run status, summaries, and evidence access? [Coverage, Spec §FR-001, §FR-004, §NFR-005]
- [ ] CHK004 Are workspace/tenant boundaries and ownership rules specified for repositories, source connections, runs, findings, and evidence? [Gap, Spec §FR-001, §FR-014, §NFR-004]
- [ ] CHK005 Are requirements defined for removing a repository connection and handling its associated credentials, snapshots, findings, excerpts, and historical runs? [Gap, Spec §FR-014, §NFR-005]

## Requirement Clarity

- [ ] CHK006 Is “short relevant evidence excerpt” given a measurable maximum size and clear rules for redaction of secrets or personal data? [Ambiguity, Spec §FR-012, §NFR-002, §NFR-005]
- [ ] CHK007 Are retention duration and deletion requirements defined for source excerpts, provider bindings, analysis output, and operational logs? [Gap, Spec §FR-014, §NFR-005]
- [ ] CHK008 Are “ordinary error messages” and “analysis summaries” clearly distinguished from restricted diagnostic logs, including what source or provider details each may contain? [Clarity, Spec §NFR-005]
- [ ] CHK009 Are public-repository access and selected private-repository access described separately so “only selected repositories” has an unambiguous security meaning? [Clarity, Spec §FR-020]

## Requirement Consistency

- [ ] CHK010 Are the requirements to retain source excerpts for evidence consistent with minimizing retained source content and protecting excerpts as sensitive data? [Consistency, Spec §FR-012, §NFR-002, §NFR-005]
- [ ] CHK011 Are requirements consistent about whether provider-specific installation references may exist in integration records while remaining excluded from the core repository and run model? [Consistency, Spec §FR-001–FR-002, §FR-018, §FR-020]
- [ ] CHK012 Are run errors and issue details consistently required to identify the affected stage/scope without disclosing credentials or unnecessary source text? [Consistency, Spec §FR-016, §FR-021, §NFR-005]

## Scenario and Edge Case Coverage

- [ ] CHK013 Are user-visible outcomes specified for revoked installations, removed repository selection, insufficient permissions, and expired authorization? [Coverage, Spec §Edge Cases, §FR-020]
- [ ] CHK014 Are rate limiting, provider outage, and transient authorization-service failures distinguished from permanent permission errors for retry and disclosure purposes? [Coverage, Spec §Edge Cases, §FR-021]
- [ ] CHK015 Are security expectations defined for logs, telemetry, and error reporting when acquisition or analysis handles credentials and source content? [Gap, Spec §NFR-005]
- [ ] CHK016 Are requirements specified for preventing one workspace's users from discovering another workspace's repository or analysis resource through identifiers or error differences? [Coverage, Spec §FR-001, §FR-004, §NFR-004]

## Dependencies & Assumptions

- [ ] CHK017 Are responsibility and operational dependencies for GitHub App ownership, installation approval, permission changes, key rotation, and incident response documented? [Dependency, Spec §FR-020, §Assumptions]
- [ ] CHK018 Are any applicable legal, contractual, or organizational source-code retention constraints identified, or explicitly left for workspace policy? [Gap, Spec §NFR-002, §NFR-005, §Assumptions]

## Notes

- All items are intentionally unchecked for reviewer evaluation; they assess requirement quality, not implementation completion.
- `/speckit-implement` reads checklist checkbox state as a gate and must not modify markers.
- `checklists/requirements.md` remains the separate built-in specification-quality checklist.
- Items reference the specification where possible and use explicit gap/ambiguity markers otherwise.
