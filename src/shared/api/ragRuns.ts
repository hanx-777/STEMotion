import type { GenerationJobEvent, GenerationJobSnapshot } from './generationJobs';

export type RagRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RagRunRecord {
  runId: string;
  rootJobId: string;
  clientSessionId?: string;
  status: RagRunStatus;
  questionSummary?: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  lastResult?: unknown;
  error?: string;
  errorDiagnostics?: unknown;
  childJobIds: string[];
}

export interface RagRunCreateResponse {
  runId: string;
  rootJobId: string;
  status: RagRunStatus;
}

export interface RagRunSnapshotResponse {
  run: RagRunRecord;
  rootJob: GenerationJobSnapshot;
  events: GenerationJobEvent[];
}

export interface RagRunListResponse {
  runs: RagRunRecord[];
}

export interface RagRunListFilters {
  status?: RagRunStatus;
  clientSessionId?: string;
  limit?: number;
}
