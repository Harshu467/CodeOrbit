import type pg from 'pg';
import { NotFoundError } from '@codeorbit/domain';
import type { RunStatus } from '@codeorbit/domain';
import { getPool } from '@codeorbit/persistence';

export interface AnalysisSummaryIssue {
  readonly code: string;
  readonly message: string;
  readonly stage?: string;
  readonly path?: string;
}

export interface AnalysisSummaryResource {
  readonly runId: string;
  readonly status: RunStatus;
  readonly counts: {
    readonly files: number;
    readonly projects: number;
    readonly symbols: number;
    readonly apis: number;
    readonly tests: number;
    readonly dependencies: number;
    readonly relationships: number;
    readonly unresolvedRelationships: number;
  };
  readonly issues: readonly AnalysisSummaryIssue[];
}

interface RunSummaryRow {
  readonly id: string;
  readonly status: RunStatus;
}

interface CountsRow {
  readonly files: string;
  readonly projects: string;
  readonly symbols: string;
  readonly apis: string;
  readonly tests: string;
  readonly dependencies: string;
  readonly relationships: string;
  readonly unresolved_relationships: string;
}

interface IssueRow {
  readonly code: string;
  readonly message: string;
  readonly stage_name: string | null;
  readonly path: string | null;
}

export class AnalysisSummaryService {
  constructor(private readonly configuredPool?: pg.Pool) {}

  async get(workspaceId: string, runId: string): Promise<AnalysisSummaryResource> {
    const pool = this.configuredPool ?? getPool();
    const runResult = await pool.query<RunSummaryRow>(
      `SELECT id, status FROM analysis_runs WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, runId],
    );
    const run = runResult.rows[0];
    if (!run) throw new NotFoundError();

    const countResult = await pool.query<CountsRow>(
      `SELECT
         (SELECT count(*) FROM analysis_files WHERE workspace_id = $1 AND run_id = $2) AS files,
         (SELECT count(*) FROM analysis_projects WHERE workspace_id = $1 AND run_id = $2) AS projects,
         (SELECT count(*) FROM analysis_symbols WHERE workspace_id = $1 AND run_id = $2) AS symbols,
         (SELECT count(*) FROM analysis_apis WHERE workspace_id = $1 AND run_id = $2) AS apis,
         (SELECT count(*) FROM analysis_tests WHERE workspace_id = $1 AND run_id = $2) AS tests,
         (SELECT count(*) FROM analysis_dependencies WHERE workspace_id = $1 AND run_id = $2) AS dependencies,
         (SELECT count(*) FROM analysis_relationships WHERE workspace_id = $1 AND run_id = $2) AS relationships,
         (SELECT count(*) FROM analysis_relationships
          WHERE workspace_id = $1 AND run_id = $2 AND resolution = 'unresolved')
           AS unresolved_relationships`,
      [workspaceId, runId],
    );
    const issueResult = await pool.query<IssueRow>(
      `SELECT code, message, stage_name, f.path
       FROM analysis_issues i
       LEFT JOIN analysis_files f
         ON f.workspace_id = i.workspace_id AND f.run_id = i.run_id AND f.id = i.file_id
       WHERE i.workspace_id = $1 AND i.run_id = $2
       UNION ALL
       SELECT 'unresolved_relationship' AS code,
              'A relationship target could not be resolved from available source evidence.' AS message,
              'relationship_extraction' AS stage_name, NULL::text AS path
       FROM analysis_relationships
       WHERE workspace_id = $1 AND run_id = $2 AND resolution = 'unresolved'
       ORDER BY code
       LIMIT 100`,
      [workspaceId, runId],
    );
    const counts = countResult.rows[0];
    if (!counts) throw new Error('Analysis summary count query returned no row.');
    return {
      runId: run.id,
      status: run.status,
      counts: {
        files: Number(counts.files),
        projects: Number(counts.projects),
        symbols: Number(counts.symbols),
        apis: Number(counts.apis),
        tests: Number(counts.tests),
        dependencies: Number(counts.dependencies),
        relationships: Number(counts.relationships),
        unresolvedRelationships: Number(counts.unresolved_relationships),
      },
      issues: issueResult.rows.map((issue) => ({
        code: issue.code,
        message: issue.message,
        ...(issue.stage_name ? { stage: issue.stage_name } : {}),
        ...(issue.path ? { path: issue.path } : {}),
      })),
    };
  }
}
