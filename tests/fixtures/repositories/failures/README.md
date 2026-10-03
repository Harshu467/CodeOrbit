# Failure fixtures

`malformed.ts` verifies syntax recovery while retaining unaffected declarations.
`unsupported.py` verifies that an unsupported-language file stays visible without
being parsed as JavaScript or TypeScript. Integration scenarios for inaccessible
provider snapshots, persistence failures, and repository limits inject those
failures at their respective service boundaries.
