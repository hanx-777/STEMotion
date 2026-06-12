import { toLegacyRagResult, type RagV1AskRequest, type RagV1AskResponse } from '@/features/rag/contracts';
import type { RagAskResult } from '@/features/rag/lib/types';
import {
  isRagSessionGenerationResult,
  subscribeGenerationJob,
  type GenerationJobEvent,
} from '@/features/generation-jobs/client/generationJobClient';
import type {
  RagRunCreateResponse,
  RagRunListFilters,
  RagRunListResponse,
  RagRunSnapshotResponse,
} from '@/shared/api/ragRuns';

export async function askRagFromBrowser(input: RagV1AskRequest): Promise<RagAskResult> {
  const response = await fetch('/api/v1/rag/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '问答请求失败');
  return toLegacyRagResult(data);
}

export interface RagAskStreamHandlers {
  onProgress?: (event: { stage: string; message: string; progress: number; elapsedMs?: number }) => void;
  onAnswerDelta?: (delta: string) => void;
  onAnswerReady?: (result: RagAskResult) => void;
  onQualityReady?: (qualityReport: NonNullable<RagAskResult['quality_report']>) => void;
  onJobEvent?: (event: GenerationJobEvent) => void;
  onRunCreated?: (run: RagRunCreateResponse) => void;
}

export interface ActiveRagSessionGenerationJob {
  jobId: string;
  runId?: string;
  input: RagV1AskRequest;
  createdAt: string;
}

export interface ActiveRagRun {
  runId: string;
  rootJobId: string;
  input?: RagV1AskRequest;
  createdAt: string;
}

export async function createRagRun(input: RagV1AskRequest): Promise<RagRunCreateResponse> {
  const response = await fetch('/api/v1/rag/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({ error: 'RAG run 创建失败。' }));
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error ?? 'RAG run 创建失败。'));
  return data as RagRunCreateResponse;
}

export async function getRagRun(runId: string): Promise<RagRunSnapshotResponse> {
  const response = await fetch(`/api/v1/rag/runs/${encodeURIComponent(runId)}`);
  const data = await response.json().catch(() => ({ error: 'RAG run 读取失败。' }));
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error ?? 'RAG run 读取失败。'));
  return data as RagRunSnapshotResponse;
}

export async function listRagRuns(filters: RagRunListFilters = {}): Promise<RagRunListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.clientSessionId) params.set('clientSessionId', filters.clientSessionId);
  if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(filters.limit))));
  }
  const query = params.toString();
  const response = await fetch(`/api/v1/rag/runs${query ? `?${query}` : ''}`);
  const data = await response.json().catch(() => ({ error: 'RAG run 列表读取失败。' }));
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error ?? 'RAG run 列表读取失败。'));
  return data as RagRunListResponse;
}

export async function askRagFromBrowserStream(
  input: RagV1AskRequest,
  handlers: RagAskStreamHandlers = {},
): Promise<RagAskResult> {
  let finalResult: RagAskResult | null = null;
  const run = await createRagRun(input);
  handlers.onRunCreated?.(run);
  rememberActiveRagRun({ runId: run.runId, rootJobId: run.rootJobId, input, createdAt: new Date().toISOString() });

  try {
    await subscribeGenerationJob(run.rootJobId, (event) => {
      handleRagAskJobEvent(event, handlers, (result) => {
        finalResult = result;
      });
    }, { maxReconnectAttempts: Number.POSITIVE_INFINITY });
  } finally {
    forgetActiveRagRun(run.runId);
  }

  if (!finalResult) throw new Error('问答请求未返回最终结果。');
  return finalResult;
}

export async function resumeRagRunFromBrowser(
  runId: string,
  handlers: RagAskStreamHandlers = {},
): Promise<RagAskResult> {
  const snapshot = await getRagRun(runId);
  const activeRun: ActiveRagRun = {
    runId,
    rootJobId: snapshot.rootJob.id,
    createdAt: snapshot.run.createdAt,
  };
  rememberActiveRagRun(activeRun);
  let finalResult: RagAskResult | null = null;
  const deliveredSequences = new Set<number>();
  let latestSequence = 0;
  let terminalEventSeen = false;
  const applyEvent = (event: GenerationJobEvent) => {
    if (typeof event.sequence === 'number' && Number.isFinite(event.sequence)) {
      if (deliveredSequences.has(event.sequence)) return;
      deliveredSequences.add(event.sequence);
      latestSequence = Math.max(latestSequence, event.sequence);
    }
    if (isTerminalRagAskJobEvent(event)) terminalEventSeen = true;
    handleRagAskJobEvent(event, handlers, (result) => {
      finalResult = result;
    });
  };
  try {
    for (const event of snapshot.events) {
      applyEvent(event);
    }

    if (isTerminalRagRootJobStatus(snapshot.rootJob.status)) {
      const terminalEvent = terminalEventSeen ? null : terminalRagRunEventFromSnapshot(snapshot, latestSequence + 1);
      if (terminalEvent) {
        applyEvent(terminalEvent);
      }
      if (snapshot.rootJob.status === 'failed') {
        throw new Error(String(snapshot.rootJob.error ?? snapshot.run.error ?? '问答请求失败。'));
      }
      if (snapshot.rootJob.status === 'cancelled') {
        throw new Error('问答请求已取消。');
      }
      if (!finalResult) {
        const terminalResult = snapshot.rootJob.result ?? snapshot.run.lastResult;
        if (terminalResult !== undefined) {
          finalResult = toLegacyRagJobResult(terminalResult);
        }
      }
      if (!finalResult) throw new Error('问答请求未返回最终结果。');
      return finalResult;
    }

    await subscribeGenerationJob(activeRun.rootJobId, (event) => {
      applyEvent(event);
    }, { maxReconnectAttempts: Number.POSITIVE_INFINITY });
  } finally {
    forgetActiveRagRun(runId);
  }
  if (!finalResult) throw new Error('问答请求未返回最终结果。');
  return finalResult;
}

export async function resumeRagSessionGenerationFromBrowser(
  activeJob: ActiveRagSessionGenerationJob,
  handlers: RagAskStreamHandlers = {},
): Promise<RagAskResult> {
  let finalResult: RagAskResult | null = null;
  try {
    await subscribeGenerationJob(activeJob.jobId, (event) => {
      handleRagAskJobEvent(event, handlers, (result) => {
        finalResult = result;
      });
    }, { maxReconnectAttempts: Number.POSITIVE_INFINITY });
  } finally {
    forgetActiveRagSessionJob(activeJob.jobId);
  }
  if (!finalResult) throw new Error('问答请求未返回最终结果。');
  return finalResult;
}

export async function subscribeRagArtifactQualityReviewFromBrowser(
  reviewJobId: string,
  handlers: Pick<RagAskStreamHandlers, 'onJobEvent'> = {},
): Promise<void> {
  await subscribeGenerationJob(reviewJobId, (event) => {
    handlers.onJobEvent?.(event);
  }, { maxReconnectAttempts: Number.POSITIVE_INFINITY });
}

function handleRagAskJobEvent(
  event: GenerationJobEvent,
  handlers: RagAskStreamHandlers,
  setFinalResult: (result: RagAskResult) => void,
): void {
  handlers.onJobEvent?.(event);
  if (event.type === 'progress') {
    handlers.onProgress?.(event as unknown as { stage: string; message: string; progress: number; elapsedMs?: number });
    return;
  }
  if (event.type === 'answer_delta') {
    handlers.onAnswerDelta?.(String((event as { delta?: unknown }).delta ?? ''));
    return;
  }
  if (event.type === 'answer_ready') {
    const result = toLegacyRagResult((event as unknown as { result: Parameters<typeof toLegacyRagResult>[0] }).result);
    handlers.onAnswerReady?.(result);
    return;
  }
  if (event.type === 'quality_ready') {
    handlers.onQualityReady?.((event as unknown as { qualityReport: NonNullable<RagAskResult['quality_report']> }).qualityReport);
    return;
  }
  if (event.type === 'final_result') {
    setFinalResult(toLegacyRagJobResult((event as { result?: unknown }).result));
    return;
  }
  if (event.type === 'job_completed' && 'result' in event && event.result !== undefined) {
    setFinalResult(toLegacyRagJobResult(event.result));
    return;
  }
  if (event.type === 'job_failed' || event.type === 'error') {
    throw new Error(String((event as { message?: unknown }).message ?? '问答请求失败'));
  }
}

function toLegacyRagJobResult(result: unknown): RagAskResult {
  if (isRagSessionGenerationResult(result)) {
    const legacy = toLegacyRagResult(result.answer as RagV1AskResponse);
    return {
      ...legacy,
      visualization_status: result.visualizationStatus,
      visualization_artifact: result.artifact,
      visualization_error: result.visualizationError,
    } as RagAskResult;
  }
  return toLegacyRagResult(result as RagV1AskResponse);
}

function isTerminalRagRootJobStatus(status: RagRunSnapshotResponse['rootJob']['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function isTerminalRagAskJobEvent(event: GenerationJobEvent): boolean {
  return event.type === 'job_completed' || event.type === 'job_failed' || event.type === 'job_cancelled';
}

function terminalRagRunEventFromSnapshot(
  snapshot: RagRunSnapshotResponse,
  sequence: number,
): GenerationJobEvent | null {
  const base = {
    jobId: snapshot.rootJob.id,
    runId: snapshot.run.runId,
    sequence,
    createdAt: snapshot.rootJob.completedAt ?? snapshot.rootJob.cancelledAt ?? snapshot.rootJob.updatedAt,
    synthetic: true,
  };
  if (snapshot.rootJob.status === 'completed') {
    return {
      ...base,
      type: 'job_completed',
      status: 'completed',
      result: snapshot.rootJob.result ?? snapshot.run.lastResult,
    };
  }
  if (snapshot.rootJob.status === 'failed') {
    return {
      ...base,
      type: 'job_failed',
      status: 'failed',
      message: snapshot.rootJob.error ?? snapshot.run.error ?? '问答请求失败。',
      diagnostics: snapshot.rootJob.errorDiagnostics ?? snapshot.run.errorDiagnostics,
    };
  }
  if (snapshot.rootJob.status === 'cancelled') {
    return {
      ...base,
      type: 'job_cancelled',
      status: 'cancelled',
    };
  }
  return null;
}

const ACTIVE_RAG_SESSION_JOB_KEY = 'stemotion-active-rag-session-job';
const ACTIVE_RAG_RUN_KEY = 'stemotion-active-rag-run';

function rememberActiveRagRun(run: ActiveRagRun): void {
  try {
    const serialized = JSON.stringify(run);
    window.sessionStorage.setItem(ACTIVE_RAG_RUN_KEY, serialized);
    window.localStorage.setItem(ACTIVE_RAG_RUN_KEY, serialized);
  } catch {
    // Session restore is best-effort.
  }
}

export function readActiveRagRun(): ActiveRagRun | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_RAG_RUN_KEY)
      ?? window.localStorage.getItem(ACTIVE_RAG_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveRagRun>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.runId !== 'string' || typeof parsed.rootJobId !== 'string') return null;
    return {
      runId: parsed.runId,
      rootJobId: parsed.rootJobId,
      input: parsed.input as RagV1AskRequest | undefined,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function forgetActiveRagRun(runId?: string): void {
  try {
    if (runId) {
      const activeRun = readActiveRagRun();
      if (activeRun?.runId !== runId) return;
    }
    window.sessionStorage.removeItem(ACTIVE_RAG_RUN_KEY);
    window.localStorage.removeItem(ACTIVE_RAG_RUN_KEY);
  } catch {
    // Session restore is best-effort.
  }
}

export function readActiveRagSessionGenerationJob(): ActiveRagSessionGenerationJob | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_RAG_SESSION_JOB_KEY)
      ?? window.localStorage.getItem(ACTIVE_RAG_SESSION_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveRagSessionGenerationJob>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.jobId !== 'string') return null;
    if (!parsed.input || typeof parsed.input !== 'object') return null;
    return {
      jobId: parsed.jobId,
      input: parsed.input as RagV1AskRequest,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function forgetActiveRagSessionJob(jobId?: string): void {
  try {
    if (jobId) {
      const activeJob = readActiveRagSessionGenerationJob();
      if (activeJob?.jobId !== jobId) return;
    }
    window.sessionStorage.removeItem(ACTIVE_RAG_SESSION_JOB_KEY);
    window.localStorage.removeItem(ACTIVE_RAG_SESSION_JOB_KEY);
  } catch {
    // Session restore is best-effort.
  }
}
