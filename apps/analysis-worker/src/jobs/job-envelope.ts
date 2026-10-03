export interface AnalysisJobEnvelope {
  readonly runId: string;
  readonly leaseGeneration: number;
  readonly workspaceId: string;
}

export function isCurrentLease(envelope: AnalysisJobEnvelope, generation: number): boolean {
  return envelope.leaseGeneration === generation;
}
