import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerStageName } from '@codeorbit/persistence';

import { AnalysisPipeline } from '../../apps/analysis-worker/src/pipeline.js';

describe('analysis worker pipeline', () => {
  let rootPath: string | undefined;

  afterEach(async () => {
    if (rootPath) await rm(rootPath, { recursive: true, force: true });
    rootPath = undefined;
    vi.clearAllMocks();
  });

  it('dispatches all seven stages against the pinned revision and persists useful model output', async () => {
    rootPath = await mkdtemp(join(process.cwd(), 'codeorbit-pipeline-'));
    await mkdir(join(rootPath, 'src'));
    await writeFile(join(rootPath, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(
      join(rootPath, 'src', 'index.ts'),
      'export function greet() { return "hello"; }',
    );
    const snapshotCleanup = vi.fn(async () => undefined);
    const provider = {
      acquireSnapshot: vi.fn(async (_connectionId, _repositoryId, revision) => ({
        rootPath: rootPath!,
        revision,
        cleanup: snapshotCleanup,
      })),
    };
    const persistedQueries: { readonly sql: string; readonly values?: readonly unknown[] }[] = [];
    const pool = {
      query: async () => ({
        rows: [
          {
            connection_id: 'connection-1',
            external_repository_id: 'repo-1',
            snapshot_revision: 'immutable-commit',
          },
        ],
      }),
      connect: async () => ({
        query: async (sql: string, values?: readonly unknown[]) => {
          persistedQueries.push({ sql, ...(values ? { values } : {}) });
          if (sql.includes('SELECT snapshot_revision')) {
            return { rows: [{ snapshot_revision: 'immutable-commit' }], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        },
        release: () => undefined,
      }),
    };
    const job = {
      runId: 'run-1',
      workspaceId: 'workspace-1',
      leaseGeneration: 1,
      attemptCount: 1,
    };
    const stages: WorkerStageName[] = [];
    const context = {
      assertLeaseCurrent: async () => undefined,
      updateProgress: async () => undefined,
      runStage: async <T>(name: WorkerStageName, execute: () => Promise<T>) => {
        stages.push(name);
        return execute();
      },
    };
    const pipeline = new AnalysisPipeline(provider as never, pool as never);

    const outcome = await pipeline.execute(job, context);

    expect(stages).toEqual([
      'acquisition',
      'file_discovery',
      'language_detection',
      'parsing',
      'symbol_extraction',
      'relationship_extraction',
      'persistence',
    ]);
    expect(provider.acquireSnapshot).toHaveBeenCalledWith('connection-1', 'repo-1', {
      requestedRevision: null,
      snapshotRevision: 'immutable-commit',
    });
    expect(
      persistedQueries.some(
        ({ sql, values }) =>
          sql.includes('INSERT INTO analysis_symbols') && values?.includes('greet'),
      ),
    ).toBe(true);
    expect(
      persistedQueries.some(
        ({ sql, values }) =>
          sql.includes('INSERT INTO analysis_files') &&
          values?.includes('src/index.ts') &&
          values?.includes('parsed'),
      ),
    ).toBe(true);
    expect(outcome).toEqual({ usefulResults: true, itemIssues: false });
    expect(snapshotCleanup).toHaveBeenCalledOnce();
  });
});
