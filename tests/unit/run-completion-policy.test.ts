import { describe, expect, it } from 'vitest';
import { STAGE_NAMES, deriveRunStatus } from '../../packages/domain/src/run-completion.js';

describe('analysis run completion policy', () => {
  it('requires all seven stages to succeed before a run can complete', () => {
    const stages = STAGE_NAMES.map((name) => ({ name, status: 'completed' as const }));
    expect(
      deriveRunStatus({ stages, usefulResults: true, itemIssues: false, retriesExhausted: false }),
    ).toBe('completed');
    expect(
      deriveRunStatus({
        stages: stages.map((stage) =>
          stage.name === 'relationship_extraction'
            ? { ...stage, status: 'failed' as const }
            : stage,
        ),
        usefulResults: true,
        itemIssues: false,
        retriesExhausted: false,
      }),
    ).toBe('failed');
  });

  it('marks incomplete useful work partial and empty analysis failed', () => {
    const stages = STAGE_NAMES.map((name) => ({ name, status: 'completed' as const }));
    expect(
      deriveRunStatus({ stages, usefulResults: true, itemIssues: true, retriesExhausted: false }),
    ).toBe('partial');
    expect(
      deriveRunStatus({ stages, usefulResults: false, itemIssues: false, retriesExhausted: false }),
    ).toBe('failed');
    expect(
      deriveRunStatus({ stages, usefulResults: false, itemIssues: true, retriesExhausted: false }),
    ).toBe('failed');
  });
});
