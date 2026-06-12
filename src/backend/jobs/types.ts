import type { GenerationJobSnapshot, GenerationJobType } from '../../shared/api/generationJobs';

export {
  GENERATION_JOB_TYPES,
  isGenerationJobType,
} from '../../shared/api/generationJobs';

export type {
  GenerationJobEvent,
  GenerationJobListFilters,
  GenerationJobSnapshot,
  GenerationJobStatus,
  GenerationJobType,
} from '../../shared/api/generationJobs';

export interface GenerationJobRunnerContext {
  signal: AbortSignal;
  runId?: string;
  emit: (event: Record<string, unknown>) => void;
  enqueueJob?: (type: GenerationJobType, input: Record<string, unknown>) => Promise<GenerationJobSnapshot>;
}

export type GenerationJobRunner = (
  input: Record<string, unknown>,
  context: GenerationJobRunnerContext,
) => Promise<unknown>;

export type GenerationJobRunnerMap = Partial<Record<GenerationJobType, GenerationJobRunner>>;
