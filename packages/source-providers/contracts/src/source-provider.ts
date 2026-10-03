import type { RepositorySnapshot, ResolvedRevision } from './snapshot.js';

export type { RepositorySnapshot, ResolvedRevision } from './snapshot.js';

export interface ProviderRepository {
  readonly providerRepositoryId: string;
  readonly fullName: string;
  readonly uri: string;
  readonly private: boolean;
}

export interface SourceProvider {
  readonly key: string;
  listAuthorizedRepositories(connectionId: string): Promise<readonly ProviderRepository[]>;
  resolveRevision(
    connectionId: string,
    providerRepositoryId: string,
    requestedRevision?: string,
  ): Promise<ResolvedRevision>;
  acquireSnapshot(
    connectionId: string,
    providerRepositoryId: string,
    revision: ResolvedRevision,
  ): Promise<RepositorySnapshot>;
}
