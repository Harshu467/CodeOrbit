export interface ResolvedRevision {
  readonly requestedRevision: string | null;
  readonly snapshotRevision: string;
}

export interface RepositorySnapshot {
  readonly revision: ResolvedRevision;
  readonly rootPath: string;
  readonly cleanup: () => Promise<void>;
}

export interface SnapshotFile {
  readonly path: string;
  readonly sizeBytes: number;
  readonly isDirectory: boolean;
}
