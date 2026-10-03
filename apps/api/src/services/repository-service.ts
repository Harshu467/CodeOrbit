import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ProviderError } from '@codeorbit/domain';
import type { ProviderRepository } from '@codeorbit/source-provider-contracts';
import { getPool, inTransaction } from '@codeorbit/persistence';

export interface RepositorySourceProvider {
  getAuthorizedRepository(connectionId: string, uri: string): Promise<ProviderRepository>;
}

export interface RepositoryResource {
  readonly id: string;
  readonly displayName: string;
  readonly state: 'active' | 'disconnected';
  readonly createdAt: string;
}

export interface RepositoryServicePort {
  connect(
    workspaceId: string,
    userId: string,
    uri: string,
    displayName?: string,
  ): Promise<RepositoryResource>;
  list(workspaceId: string): Promise<readonly RepositoryResource[]>;
  get(workspaceId: string, repositoryId: string): Promise<RepositoryResource>;
}

interface RepositoryRow {
  id: string;
  display_name: string;
  state: 'active' | 'disconnected';
  created_at: Date;
}

function toResource(row: RepositoryRow): RepositoryResource {
  return {
    id: row.id,
    displayName: row.display_name,
    state: row.state,
    createdAt: row.created_at.toISOString(),
  };
}

function providerRepositoryId(repository: ProviderRepository): string {
  return repository.providerRepositoryId;
}

export class RepositoryService implements RepositoryServicePort {
  constructor(
    private readonly provider: RepositorySourceProvider,
    private readonly pool = getPool(),
  ) {}

  async connect(
    workspaceId: string,
    userId: string,
    uri: string,
    displayName?: string,
  ): Promise<RepositoryResource> {
    const connection = await this.pool.query<{ id: string; external_connection_id: string }>(
      `SELECT id, external_connection_id FROM source_connections
       WHERE workspace_id = $1 AND provider_key = 'github' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    );
    const sourceConnection = connection.rows[0];
    if (!sourceConnection) throw new ForbiddenError();

    const source = await this.provider.getAuthorizedRepository(sourceConnection.external_connection_id, uri);
    const existing = await this.pool.query<RepositoryRow>(
      `SELECT r.id, r.display_name, r.state, r.created_at
       FROM repositories r JOIN source_bindings b
         ON b.workspace_id = r.workspace_id AND b.repository_id = r.id
       WHERE r.workspace_id = $1 AND b.provider_key = 'github'
         AND b.external_repository_id = $2`,
      [workspaceId, providerRepositoryId(source)],
    );
    if (existing.rows[0]) return toResource(existing.rows[0]);

    const repositoryId = randomUUID();
    const id = randomUUID();
    const name = displayName?.trim() || source.fullName;
    try {
      return await inTransaction(this.pool, async (client) => {
        const inserted = await client.query<RepositoryRow>(
          `INSERT INTO repositories (id, workspace_id, display_name, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, display_name, state, created_at`,
          [repositoryId, workspaceId, name, userId],
        );
        await client.query(
          `INSERT INTO source_bindings
             (id, workspace_id, repository_id, connection_id, provider_key,
              external_repository_id, canonical_source_uri)
           VALUES ($1, $2, $3, $4, 'github', $5, $6)`,
          [
            id,
            workspaceId,
            repositoryId,
            sourceConnection.id,
            providerRepositoryId(source),
            source.uri,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error('Repository insert returned no row.');
        return toResource(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.pool.query<RepositoryRow>(
          `SELECT r.id, r.display_name, r.state, r.created_at
           FROM repositories r JOIN source_bindings b
             ON b.workspace_id = r.workspace_id AND b.repository_id = r.id
           WHERE r.workspace_id = $1 AND b.provider_key = 'github'
             AND b.external_repository_id = $2`,
          [workspaceId, providerRepositoryId(source)],
        );
        if (raced.rows[0]) return toResource(raced.rows[0]);
        throw new ConflictError();
      }
      if (error instanceof ProviderError) throw error;
      throw error;
    }
  }

  async list(workspaceId: string): Promise<readonly RepositoryResource[]> {
    const result = await this.pool.query<RepositoryRow>(
      `SELECT id, display_name, state, created_at
       FROM repositories WHERE workspace_id = $1 ORDER BY created_at DESC, id`,
      [workspaceId],
    );
    return result.rows.map(toResource);
  }

  async get(workspaceId: string, repositoryId: string): Promise<RepositoryResource> {
    const result = await this.pool.query<RepositoryRow>(
      `SELECT id, display_name, state, created_at
       FROM repositories WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, repositoryId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError();
    return toResource(row);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
