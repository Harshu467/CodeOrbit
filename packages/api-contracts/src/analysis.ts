import type { RunStatus, StageName, StageStatus } from '@codeorbit/domain';

export interface AnalysisRunDto {
  readonly id: string;
  readonly repositoryId: string;
  readonly status: RunStatus;
  readonly snapshotRevision?: string;
  readonly stages: readonly {
    readonly name: StageName;
    readonly status: StageStatus;
    readonly attemptCount: number;
  }[];
  readonly createdAt: string;
}
