import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ConflictError, NotFoundError } from '@codeorbit/domain';
import type { RunStatus, StageName, StageStatus } from '@codeorbit/domain';
import type { StartAnalysisRequest } from '@codeorbit/api-contracts';
import type { SourceProvider } from '@codeorbit/source-provider-contracts';
import { getPool, inTransaction } from '@codeorbit/persistence';

const ANALYZER_VERSION = 'javascript-typescript-v1';
const STAGE_NAMES: readonly StageName[] = [
  'acquisition',
  'file_discovery',
  'language_detection',
  'parsing',
  'symbol_extraction',
  'relationship_extraction',
  'persistence',
];

export interface AnalysisStageResource {
  readonly name: StageName;
  readonly status: StageStatus;
  readonly attemptCount: number;
  readonly progress?: { readonly current?: number; readonly total?: number };
  readonly error?: { readonly code: string; readonly message: string };
}

export interface AnalysisRunResource {
  readonly id: string;
  readonly repositoryId: string;
  readonly status: RunStatus;
  readonly requestedRevision?: string;
  readonly snapshotRevision?: string;
  readonly stages: readonly AnalysisStageResource[];
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly nextAttemptAt?: string;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface StartedAnalysis {
  readonly run: AnalysisRunResource;
  readonly reused: boolean;
}

export interface AnalysisRunServicePort {
  start(
    workspaceId: string,
    userId: string,
    repositoryId: string,
    request: StartAnalysisRequest,
    idempotencyKey?: string,
  ): Promise<StartedAnalysis>;
  get(workspaceId: string, runId: string): Promise<AnalysisRunResource>;
}

interface SourceBindingRow {
  source_binding_id: string;
  external_connection_id: string;
  external_repository_id: string;
}

interface RunRow {
  id: string;
  repository_id: string;
  status: RunStatus;
  requested_revision: string | null;
  snapshot_revision: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  next_attempt_at: Date | null;
  error_summary: string | null;
}

interface StageRow {
  name: StageName;
  status: StageStatus;
  attempt_count: number;
  progress_current: number | null;
  progress_total: number | null;
  error_code: string | null;
  error_summary: string | null;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toRunResource(run: RunRow, stages: readonly StageRow[]): AnalysisRunResource {
  return {
    id: run.id,
    repositoryId: run.repository_id,
    status: run.status,
    ...(run.requested_revision !== null ? { requestedRevision: run.requested_revision } : {}),
    ...(run.snapshot_revision !== null ? { snapshotRevision: run.snapshot_revision } : {}),
    stages: stages.map((stage) => ({
      name: stage.name,
      status: stage.status,
      attemptCount: stage.attempt_count,
      ...(stage.progress_current !== null || stage.progress_total !== null
        ? {
            progress: {
              ...(stage.progress_current !== null ? { current: stage.progress_current } : {}),
              ...(stage.progress_total !== null ? { total: stage.progress_total } : {}),
            },
          }
        : {}),
      ...(stage.error_code && stage.error_summary
        ? { error: { code: stage.error_code, message: stage.error_summary } }
        : {}),
    })),
    createdAt: run.created_at.toISOString(),
    ...(run.started_at ? { startedAt: run.started_at.toISOString() } : {}),
    ...(run.completed_at ? { completedAt: run.completed_at.toISOString() } : {}),
    ...(run.next_attempt_at ? { nextAttemptAt: run.next_attempt_at.toISOString() } : {}),
    ...(run.error_summary
      ? { error: { code: 'analysis_failed', message: run.error_summary } }
      : {}),
  };
}

async function selectRun(
  queryable: pg.Pool | pg.PoolClient,
  workspaceId: string,
  runId: string,
): Promise<AnalysisRunResource> {
  const result = await queryable.query<RunRow>(
    `SELECT id, repository_id, status, requested_revision, snapshot_revision,
            created_at, started_at, completed_at, next_attempt_at, error_summary
     FROM analysis_runs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, runId],
  );
  const run = result.rows[0];
  if (!run) throw new NotFoundError();
  const stageResult = await queryable.query<StageRow>(
    `SELECT name, status, attempt_count, progress_current, progress_total,
            error_code, error_summary
     FROM analysis_stages WHERE workspace_id = $1 AND run_id = $2
     ORDER BY array_position($3::text[], name)`,
    [workspaceId, runId, STAGE_NAMES],
  );
  return toRunResource(run, stageResult.rows);
}

export class AnalysisRunService implements AnalysisRunServicePort {
  constructor(
    private readonly provider: Pick<SourceProvider, 'resolveRevision'>,
    private readonly pool = getPool(),
  ) {}

  async start(
    workspaceId: string,
    userId: string,
    repositoryId: string,
    request: StartAnalysisRequest,
    idempotencyKey?: string,
  ): Promise<StartedAnalysis> {
    const requestHash = hash(
      JSON.stringify({
        repositoryId,
        revision: request.revision?.trim() || null,
        createDistinctRun: request.createDistinctRun,
      }),
    );
    const binding = await this.findBinding(workspaceId, repositoryId);

    if (idempotencyKey) {
      const existing = await this.pool.query<{ request_hash: string; run_id: string }>(
        `SELECT request_hash, run_id FROM idempotency_records
         WHERE workspace_id = $1 AND key = $2`,
        [workspaceId, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) throw new ConflictError();
        return {
          run: await this.get(workspaceId, existing.rows[0].run_id),
          reused: true,
        };
      }
    }

    const revision = await this.provider.resolveRevision(
      binding.external_connection_id,
      binding.external_repository_id,
      request.revision,
    );
    const configurationHash = hash('default-analysis-configuration-v1');

    return inTransaction(this.pool, async (client) => {
      if (idempotencyKey) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`idempotency:${workspaceId}:${idempotencyKey}`],
        );
        const previous = await client.query<{ request_hash: string; run_id: string }>(
          `SELECT request_hash, run_id FROM idempotency_records
           WHERE workspace_id = $1 AND key = $2 FOR UPDATE`,
          [workspaceId, idempotencyKey],
        );
        if (previous.rows[0]) {
          if (previous.rows[0].request_hash !== requestHash) throw new ConflictError();
          return {
            run: await selectRun(client, workspaceId, previous.rows[0].run_id),
            reused: true,
          };
        }
      }

      if (!request.createDistinctRun) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [
            `analysis:${workspaceId}:${binding.source_binding_id}:${revision.snapshotRevision}:${ANALYZER_VERSION}:${configurationHash}`,
          ],
        );
        const active = await client.query<{ id: string }>(
          `SELECT id FROM analysis_runs
           WHERE workspace_id = $1 AND source_binding_id = $2
             AND snapshot_revision = $3 AND analyzer_version = $4
             AND configuration_hash = $5 AND status IN ('queued', 'running')
             AND distinct_run = false
           ORDER BY created_at LIMIT 1`,
          [
            workspaceId,
            binding.source_binding_id,
            revision.snapshotRevision,
            ANALYZER_VERSION,
            configurationHash,
          ],
        );
        if (active.rows[0]) {
          return {
            run: await selectRun(client, workspaceId, active.rows[0].id),
            reused: true,
          };
        }
      }

      const runId = randomUUID();
      const inserted = await client.query<RunRow>(
        `INSERT INTO analysis_runs
           (id, workspace_id, repository_id, source_binding_id, status,
            requested_revision, snapshot_revision, analyzer_version,
            configuration_hash, distinct_run, created_by)
         VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9, $10)
         RETURNING id, repository_id, status, requested_revision, snapshot_revision,
                   created_at, started_at, completed_at, next_attempt_at, error_summary`,
        [
          runId,
          workspaceId,
          repositoryId,
          binding.source_binding_id,
          revision.requestedRevision,
          revision.snapshotRevision,
          ANALYZER_VERSION,
          configurationHash,
          request.createDistinctRun,
          userId,
        ],
      );
      for (const name of STAGE_NAMES) {
        await client.query(
          `INSERT INTO analysis_stages (workspace_id, run_id, name, status)
           VALUES ($1, $2, $3, 'queued')`,
          [workspaceId, runId, name],
        );
      }
      if (idempotencyKey) {
        await client.query(
          `INSERT INTO idempotency_records (workspace_id, key, request_hash, run_id)
           VALUES ($1, $2, $3, $4)`,
          [workspaceId, idempotencyKey, requestHash, runId],
        );
      }
      const row = inserted.rows[0];
      if (!row) throw new Error('Analysis run insert returned no row.');
      const stages = await client.query(
        `SELECT name, status, attempt_count, progress_current, progress_total,
                error_code, error_summary
         FROM analysis_stages WHERE workspace_id = $1 AND run_id = $2
         ORDER BY array_position($3::text[], name)`,
        [workspaceId, runId, STAGE_NAMES],
      );
      return { run: toRunResource(row, stages.rows), reused: false };
    });
  }

  async get(workspaceId: string, runId: string): Promise<AnalysisRunResource> {
    return selectRun(this.pool, workspaceId, runId);
  }

  private async findBinding(workspaceId: string, repositoryId: string): Promise<SourceBindingRow> {
    const result = await this.pool.query<SourceBindingRow>(
      `SELECT b.id AS source_binding_id, c.external_connection_id, b.external_repository_id
       FROM source_bindings b JOIN source_connections c
         ON c.workspace_id = b.workspace_id AND c.id = b.connection_id
       WHERE b.workspace_id = $1 AND b.repository_id = $2 AND c.status = 'active'`,
      [workspaceId, repositoryId],
    );
    const binding = result.rows[0];
    if (!binding) throw new NotFoundError();
    return binding;
  }
}
