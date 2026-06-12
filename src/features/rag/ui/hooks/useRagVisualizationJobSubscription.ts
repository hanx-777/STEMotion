'use client';

import { useCallback, useMemo } from 'react';
import {
  createGenerationJob,
  subscribeGenerationJob,
  type GenerationJobEvent,
} from '@/features/generation-jobs/client/generationJobClient';
import type { RagV1QualityMode } from '@/features/rag/contracts';

export interface RagVisualizationJobInput {
  question: string;
  answerText: string;
  answerSections?: unknown;
  formulaBlocks?: unknown;
  finalResults?: unknown;
  citations?: unknown;
  subject: string;
  taskType: string;
  source: 'student' | 'teacher';
  visualizationSpec?: unknown;
  quality?: {
    mode?: RagV1QualityMode;
  };
}

export interface ActiveRagVisualizationJob {
  jobId: string;
  input: RagVisualizationJobInput;
  sessionId: string;
  question: string;
  subject: string;
  taskType: string;
  useWebSearch: boolean;
  source: 'student' | 'teacher';
  qualityMode: RagV1QualityMode;
  ragResult: unknown;
  createdAt: string;
}

export interface RagVisualizationJobContext {
  sessionId: string;
  question: string;
  subject: string;
  taskType: string;
  useWebSearch: boolean;
  source: 'student' | 'teacher';
  qualityMode: RagV1QualityMode;
  ragResult: unknown;
}

export function useRagVisualizationJobSubscription() {
  const start = useCallback(async (
    input: RagVisualizationJobInput,
    context: RagVisualizationJobContext,
    onEvent: (event: GenerationJobEvent) => void,
  ) => {
    const job = await createGenerationJob('rag_visualization', input as unknown as Record<string, unknown>);
    rememberVisualizationJob({
      jobId: job.jobId,
      input,
      sessionId: context.sessionId,
      question: context.question,
      subject: context.subject,
      taskType: context.taskType,
      useWebSearch: context.useWebSearch,
      source: context.source,
      qualityMode: context.qualityMode,
      ragResult: context.ragResult,
      createdAt: new Date().toISOString(),
    });

    await subscribeGenerationJob(job.jobId, onEvent);
  }, []);

  const resume = useCallback(async (
    activeJob: ActiveRagVisualizationJob,
    onEvent: (event: GenerationJobEvent) => void,
  ) => {
    await subscribeGenerationJob(activeJob.jobId, onEvent);
  }, []);

  const readActiveJob = useCallback(() => readActiveVisualizationJob(), []);

  const clearActiveJob = useCallback((jobId?: string) => {
    forgetVisualizationJob(jobId);
  }, []);

  return useMemo(() => ({
    start,
    resume,
    readActiveVisualizationJob: readActiveJob,
    clearActiveVisualizationJob: clearActiveJob,
  }), [clearActiveJob, readActiveJob, resume, start]);
}

const ACTIVE_RAG_VISUALIZATION_JOB_KEY = 'stemotion-active-rag-visualization-job';

function rememberVisualizationJob(job: ActiveRagVisualizationJob): void {
  try {
    const serialized = JSON.stringify(job);
    window.sessionStorage.setItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY, serialized);
    window.localStorage.setItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY, serialized);
  } catch {
    // Best-effort resume marker.
  }
}

export function readActiveVisualizationJob(): ActiveRagVisualizationJob | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY)
      ?? window.localStorage.getItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveRagVisualizationJob>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.jobId !== 'string') return null;
    if (!parsed.input || typeof parsed.input !== 'object') return null;
    if (typeof parsed.sessionId !== 'string') return null;
    if (typeof parsed.question !== 'string') return null;
    if (typeof parsed.subject !== 'string') return null;
    if (typeof parsed.taskType !== 'string') return null;
    if (typeof parsed.useWebSearch !== 'boolean') return null;
    if (parsed.source !== 'student' && parsed.source !== 'teacher') return null;
    if (!isRagV1QualityMode(parsed.qualityMode)) return null;
    return {
      jobId: parsed.jobId,
      input: parsed.input as RagVisualizationJobInput,
      sessionId: parsed.sessionId,
      question: parsed.question,
      subject: parsed.subject,
      taskType: parsed.taskType,
      useWebSearch: parsed.useWebSearch,
      source: parsed.source,
      qualityMode: parsed.qualityMode,
      ragResult: parsed.ragResult,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function forgetVisualizationJob(jobId?: string): void {
  try {
    if (!jobId) {
      window.sessionStorage.removeItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY);
      window.localStorage.removeItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY);
      return;
    }
    const activeJob = readActiveVisualizationJob();
    if (activeJob?.jobId === jobId) {
      window.sessionStorage.removeItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY);
      window.localStorage.removeItem(ACTIVE_RAG_VISUALIZATION_JOB_KEY);
    }
  } catch {
    // Best-effort resume marker.
  }
}

function isRagV1QualityMode(value: unknown): value is RagV1QualityMode {
  return value === 'fast' || value === 'highQuality' || value === 'review';
}
