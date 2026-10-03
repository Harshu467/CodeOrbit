export const RUN_STATUSES = ['queued', 'running', 'completed', 'partial', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const STAGE_NAMES = [
  'acquisition',
  'file_discovery',
  'language_detection',
  'parsing',
  'symbol_extraction',
  'relationship_extraction',
  'persistence',
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export type StageStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'skipped';

export interface CompletionInput {
  readonly stages: ReadonlyArray<{ name: StageName; status: StageStatus }>;
  readonly usefulResults: boolean;
  readonly itemIssues: boolean;
  readonly retriesExhausted: boolean;
}

export function deriveRunStatus(input: CompletionInput): RunStatus {
  if (input.retriesExhausted) return 'failed';
  if (input.stages.some((stage) => stage.status === 'queued' || stage.status === 'running')) {
    return 'running';
  }
  if (input.stages.some((stage) => stage.status === 'failed' && stage.name === 'acquisition')) {
    return 'failed';
  }
  if (input.stages.some((stage) => stage.status === 'failed' || stage.status === 'skipped')) {
    return input.usefulResults ? 'partial' : 'failed';
  }
  if (input.stages.some((stage) => stage.status === 'partial') || input.itemIssues) return 'partial';
  if (input.stages.length === STAGE_NAMES.length && input.stages.every((stage) => stage.status === 'completed')) {
    return 'completed';
  }
  return input.usefulResults ? 'partial' : 'failed';
}
