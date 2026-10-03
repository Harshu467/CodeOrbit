import { describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { parseWorkspaceId } from '../../packages/domain/src/ids.js';
import { NotFoundError } from '../../packages/domain/src/errors.js';
import { UnauthorizedError } from '../../packages/domain/src/errors.js';

describe('analysis-summary API contract', () => {
  it('returns run-scoped counts, unresolved findings, and issues', async () => {
    const summary = {
      runId: 'run-1',
      status: 'partial',
      counts: {
        files: 5,
        projects: 2,
        symbols: 8,
        apis: 1,
        tests: 1,
        dependencies: 2,
        relationships: 4,
        unresolvedRelationships: 1,
      },
      issues: [
        {
          code: 'unresolved_relationship',
          message: 'A relationship target could not be resolved from available source evidence.',
          stage: 'relationship_extraction',
        },
      ],
    };
    const app = createApp({
      analysisSummaryService: { get: async () => summary },
      analysisRunService: {
        start: async () => {
          throw new Error('not used');
        },
        get: async () => {
          throw new Error('not used');
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
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/analysis-runs/run-1/summary',
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(summary);
  });

  it('hides unknown and workspace-invisible run summaries', async () => {
    const app = createApp({
      analysisSummaryService: {
        get: async () => {
          throw new NotFoundError();
        },
      },
      analysisRunService: {
        start: async () => {
          throw new Error('not used');
        },
        get: async () => {
          throw new Error('not used');
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
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/analysis-runs/missing/summary',
    });
    await app.close();
    expect(response.statusCode).toBe(404);
  });

  it('requires an authenticated workspace before returning a summary', async () => {
    const app = createApp({
      analysisSummaryService: { get: async () => { throw new Error('must not be called'); } },
      analysisRunService: {
        start: async () => { throw new Error('not used'); },
        get: async () => { throw new Error('not used'); },
      },
      repositoryService: {
        connect: async () => { throw new Error('not used'); },
        list: async () => [],
        get: async () => { throw new Error('not used'); },
      },
      authenticateRequest: async () => { throw new UnauthorizedError(); },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/analysis-runs/run-1/summary',
    });
    await app.close();
    expect(response.statusCode).toBe(401);
  });
});
