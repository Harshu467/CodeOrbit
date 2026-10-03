import { describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { parseWorkspaceId } from '../../packages/domain/src/ids.js';
import { NotFoundError } from '../../packages/domain/src/errors.js';

const stages = [
  'acquisition',
  'file_discovery',
  'language_detection',
  'parsing',
  'symbol_extraction',
  'relationship_extraction',
  'persistence',
].map((name) => ({ name, status: 'queued', attemptCount: 0 }));

describe('analysis-run API contract', () => {
  it('creates a queued revision-pinned run with seven visible stages and a resource location', async () => {
    const run = {
      id: 'run-1',
      repositoryId: 'repository-1',
      status: 'queued',
      reused: false,
      requestedRevision: 'main',
      snapshotRevision: 'commit-sha',
      stages,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const service = {
      start: async () => ({ run, reused: false }),
      get: async () => run,
    };
    const app = createApp({
      analysisRunService: service,
      repositoryService: {
        connect: async () => run,
        list: async () => [],
        get: async () => run,
      },
      authenticateRequest: async (request) => {
        request.principal = {
          userId: 'test-user',
          workspaceId: parseWorkspaceId('test-workspace'),
          roles: ['owner'],
        };
      },
    });

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/repositories/repository-1/analysis-runs',
      payload: { revision: 'main' },
    });
    const retrieved = await app.inject({
      method: 'GET',
      url: '/api/v1/analysis-runs/run-1',
    });
    await app.close();

    expect(started.statusCode).toBe(202);
    expect(started.headers.location).toBe('/api/v1/analysis-runs/run-1');
    expect(started.json()).toEqual(run);
    expect(started.json().stages).toHaveLength(7);
    expect(retrieved.statusCode).toBe(200);
    expect(retrieved.json().snapshotRevision).toBe('commit-sha');
  });

  it('returns not found for unknown or workspace-invisible runs', async () => {
    const app = createApp({
      analysisRunService: {
        start: async () => {
          throw new NotFoundError();
        },
        get: async () => {
          throw new NotFoundError();
        },
      },
      repositoryService: {
        connect: async () => {
          throw new Error('not used');
        },
        list: async () => [],
        get: async () => {
          throw new Error('not used');
        },
      },
      authenticateRequest: async (request) => {
        request.principal = {
          userId: 'test-user',
          workspaceId: parseWorkspaceId('test-workspace'),
          roles: ['owner'],
        };
      },
    });
    const response = await app.inject({ method: 'GET', url: '/api/v1/analysis-runs/unknown' });
    await app.close();
    expect(response.statusCode).toBe(404);
  });
});
