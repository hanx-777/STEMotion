import type { FinalQualityDecision } from './lightweightAgentPipeline';

export type GenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export const GENERATION_JOB_TYPES = [
  'rag_ask_stream',
  'rag_visualization',
  'rag_session_generation',
  'artifact_quality_review',
  'deep_interaction',
] as const;

export type GenerationJobType = typeof GENERATION_JOB_TYPES[number];

export function isGenerationJobType(value: unknown): value is GenerationJobType {
  return typeof value === 'string' && GENERATION_JOB_TYPES.includes(value as GenerationJobType);
}

export interface GenerationJobCreateResponse {
  jobId: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
}

export interface GenerationJobListFilters {
  type?: GenerationJobType;
  status?: GenerationJobStatus;
  clientSessionId?: string;
  limit?: number;
}

export interface GenerationJobListResponse {
  jobs: GenerationJobSnapshot[];
}

export interface GenerationJobCancelResponse {
  jobId: string;
  status: GenerationJobStatus;
}

export interface GenerationJobSnapshot {
  id: string;
  runId?: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
  inputSummary: Record<string, unknown>;
  result?: unknown;
  error?: string;
  errorDiagnostics?: unknown;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface GenerationJobEvent extends Record<string, unknown> {
  type: string;
  jobId: string;
  runId?: string;
  sequence: number;
  createdAt: string;
}

export interface GenerationJobCompletedEvent extends GenerationJobEvent {
  type: 'job_completed';
  status: 'completed';
  result?: unknown;
}

export interface GenerationJobFailedEvent extends GenerationJobEvent {
  type: 'job_failed';
  status: 'failed';
  message?: string;
  diagnostics?: unknown;
}

export interface GenerationJobCancelledEvent extends GenerationJobEvent {
  type: 'job_cancelled';
  status: 'cancelled';
}

export interface GenerationJobArtifactReadyEvent extends GenerationJobEvent {
  type: 'artifact_ready';
  artifact: unknown;
}

export interface GenerationJobArtifactQualityUpdatedEvent extends GenerationJobEvent {
  type: 'artifact_quality_updated';
  artifactId: string;
  qualityReport?: unknown;
  feedbackLoop?: unknown;
  finalScore?: unknown;
  changeLog?: unknown;
}

export interface GenerationJobArtifactQualityReviewStartedEvent extends GenerationJobEvent {
  type: 'artifact_quality_review_started';
  artifactId?: string;
  reviewJobId?: string;
  status?: 'queued' | 'running';
}

export interface GenerationJobArtifactQualityReviewCompletedEvent extends GenerationJobEvent {
  type: 'artifact_quality_review_completed';
  artifactId?: string;
  reviewJobId?: string;
  status: 'completed';
  result?: unknown;
}

export interface GenerationJobArtifactQualityReviewFailedEvent extends GenerationJobEvent {
  type: 'artifact_quality_review_failed';
  artifactId?: string;
  reviewJobId?: string;
  status: 'failed';
  message?: string;
  diagnostics?: unknown;
}

export type RagSessionGenerationVisualizationStatus = 'disabled' | 'pending' | 'generating' | 'ready' | 'failed';
export type RagSessionGenerationQualityReviewStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RagSessionGenerationResult {
  type: 'rag_session_generation_result';
  request: {
    question: string;
    subjectId?: string;
    taskType?: string;
    useWebSearch?: boolean;
    qualityMode?: string;
    visualizationMode?: string;
    source?: string;
    clientSessionId?: string;
  };
  answer: unknown;
  visualizationStatus: RagSessionGenerationVisualizationStatus;
  artifact?: unknown;
  qualityReviewJobId?: string;
  qualityReviewStatus?: RagSessionGenerationQualityReviewStatus;
  visualizationError?: string;
  errorDiagnostics?: unknown;
  finalQualityDecision?: FinalQualityDecision;
}

export function isJobCompletedEvent(event: unknown): event is GenerationJobCompletedEvent {
  return isGenerationJobEventLike(event) && event.type === 'job_completed';
}

export function isJobFailedEvent(event: unknown): event is GenerationJobFailedEvent {
  return isGenerationJobEventLike(event) && event.type === 'job_failed';
}

export function isJobCancelledEvent(event: unknown): event is GenerationJobCancelledEvent {
  return isGenerationJobEventLike(event) && event.type === 'job_cancelled';
}

export function isArtifactReadyEvent(event: unknown): event is GenerationJobArtifactReadyEvent {
  return isGenerationJobEventLike(event) && event.type === 'artifact_ready' && 'artifact' in event;
}

export function isArtifactQualityUpdatedEvent(event: unknown): event is GenerationJobArtifactQualityUpdatedEvent {
  return isGenerationJobEventLike(event) && event.type === 'artifact_quality_updated' && 'artifactId' in event;
}

export function isRagSessionGenerationResult(value: unknown): value is RagSessionGenerationResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; answer?: unknown; visualizationStatus?: unknown };
  return candidate.type === 'rag_session_generation_result'
    && 'answer' in candidate
    && typeof candidate.visualizationStatus === 'string';
}

function isGenerationJobEventLike(event: unknown): event is GenerationJobEvent {
  return Boolean(event) && typeof event === 'object' && typeof (event as { type?: unknown }).type === 'string';
}
