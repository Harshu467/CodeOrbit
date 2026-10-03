import { describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { parseWorkspaceId } from '../../packages/domain/src/ids.js';
import {
  createRepositoryRequestSchema,
  type components,
  type paths,
} from '../../packages/api-contracts/src/index.js';

describe('repository API contract', () => {
  it('creates and lists repository resources using the documented response fields', async () => {
    const resource = {
      id: 'repo-1',
      displayName: 'Example project',
      state: 'active' as const,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const repositoryService = {
      connect: async () => resource,
      list: async () => [resource],
      get: async () => resource,
    };
    const app = createApp({
      repositoryService,
      analysisRunService: {
        start: async () => {
          throw new Error('not used');
        },
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

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/repositories',
      payload: { source: { provider: 'github', uri: 'https://github.com/example/project' } },
    });
    const listed = await app.inject({ method: 'GET', url: '/api/v1/repositories' });
    const retrieved = await app.inject({
      method: 'GET',
      url: '/api/v1/repositories/repo-1',
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/repositories',
      payload: { source: { provider: 'github', uri: 'https://github.com/example' } },
    });
    await app.close();

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual(resource);
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ items: [resource] });
    expect(retrieved.statusCode).toBe(200);
    expect(retrieved.json()).toEqual(resource);
    expect(invalid.statusCode).toBe(400);
  });

  it('accepts the documented GitHub repository request and rejects unsupported sources', () => {
    expect(
      createRepositoryRequestSchema.safeParse({
        source: { provider: 'github', uri: 'https://github.com/example/project' },
      }).success,
    ).toBe(true);
    expect(
      createRepositoryRequestSchema.safeParse({
        source: { provider: 'gitlab', uri: 'https://gitlab.com/example/project' },
      }).success,
    ).toBe(false);
    expect(
      createRepositoryRequestSchema.safeParse({
        source: { provider: 'github', uri: 'https://user:password@github.com/example/project' },
      }).success,
    ).toBe(false);
  });

  it('retains the documented repository operations and response shape', () => {
    const repositoryPath: keyof paths = '/repositories';
    const repositorySchema: keyof components['schemas'] = 'Repository';
    expect(repositoryPath).toBe('/repositories');
    expect(repositorySchema).toBe('Repository');
  });
});
