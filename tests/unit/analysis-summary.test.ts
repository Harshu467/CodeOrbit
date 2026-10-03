import { describe, expect, it } from 'vitest';
import { AnalysisSummaryService } from '../../apps/api/src/services/analysis-summary-service.js';

describe('analysis summary service', () => {
  it('maps scoped aggregate counts and sanitized issue rows to the summary resource', async () => {
    const pool = {
      query: async (sql: string) => {
        if (sql.includes('analysis_runs')) return { rows: [{ id: 'run-1', status: 'partial' }] };
        return {
          rows: [
            {
              files: '4',
              projects: '1',
              symbols: '3',
              apis: '1',
              tests: '2',
              dependencies: '2',
              relationships: '5',
              unresolved_relationships: '1',
            },
          ],
        };
      },
    } as never;
    const issuePool = {
      query: async () => ({
        rows: [
          {
            code: 'syntax_error',
            message: 'The parser found invalid syntax.',
            stage_name: 'parsing',
            path: 'src/broken.ts',
          },
        ],
      }),
    } as never;
    const service = new AnalysisSummaryService({
      query: async (sql: string, values?: readonly unknown[]) =>
        sql.includes('analysis_issues') ? issuePool.query(sql, values) : pool.query(sql, values),
    } as never);

    await expect(service.get('workspace-1', 'run-1')).resolves.toEqual({
      runId: 'run-1',
      status: 'partial',
      counts: {
        files: 4,
        projects: 1,
        symbols: 3,
        apis: 1,
        tests: 2,
        dependencies: 2,
        relationships: 5,
        unresolvedRelationships: 1,
      },
      issues: [
        {
          code: 'syntax_error',
          message: 'The parser found invalid syntax.',
          stage: 'parsing',
          path: 'src/broken.ts',
        },
      ],
    });
  });
});
