import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalysisSummaryService } from '../../apps/api/src/services/analysis-summary-service.js';
import { AnalysisRunService } from '../../apps/api/src/services/analysis-run-service.js';
import { closePool, getPool } from '../../packages/persistence/src/index.js';

const runId = process.env.ANALYSIS_PERFORMANCE_RUN_ID;
const enabled = Boolean(process.env.DATABASE_URL && runId);

describe.skipIf(!enabled)('analysis read-path performance', () => {
  let pool: ReturnType<typeof getPool>;
  let service: AnalysisSummaryService;
  let runService: AnalysisRunService;

  beforeAll(() => {
    pool = getPool();
    service = new AnalysisSummaryService(pool);
    runService = new AnalysisRunService(
      {
        resolveRevision: async () => {
          throw new Error('not used');
        },
      },
      pool,
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('keeps status summary reads under the two-second p95 target', async () => {
    const run = await pool.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM analysis_runs WHERE id = $1`,
      [runId],
    );
    const workspaceId = run.rows[0]?.workspace_id;
    expect(workspaceId).toBeDefined();
    const durations: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const started = performance.now();
      await service.get(workspaceId!, runId!);
      await runService.get(workspaceId!, runId!);
      durations.push(performance.now() - started);
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(2_000);
  });
});
