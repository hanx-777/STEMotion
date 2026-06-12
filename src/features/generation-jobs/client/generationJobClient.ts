import type {
  GenerationJobCancelResponse,
  GenerationJobCreateResponse,
  GenerationJobEvent,
  GenerationJobListFilters,
  GenerationJobListResponse,
  GenerationJobSnapshot,
  GenerationJobType,
} from '@/shared/api/generationJobs';

export type {
  GenerationJobCancelResponse,
  GenerationJobCreateResponse,
  GenerationJobArtifactReadyEvent,
  GenerationJobArtifactQualityReviewCompletedEvent,
  GenerationJobArtifactQualityReviewFailedEvent,
  GenerationJobArtifactQualityReviewStartedEvent,
  GenerationJobArtifactQualityUpdatedEvent,
  GenerationJobCancelledEvent,
  GenerationJobCompletedEvent,
  GenerationJobEvent,
  GenerationJobListFilters,
  GenerationJobListResponse,
  GenerationJobFailedEvent,
  GenerationJobSnapshot,
  GenerationJobType,
  RagSessionGenerationResult,
} from '@/shared/api/generationJobs';
export {
  isArtifactReadyEvent,
  isArtifactQualityUpdatedEvent,
  isJobCancelledEvent,
  isJobCompletedEvent,
  isJobFailedEvent,
  isRagSessionGenerationResult,
} from '@/shared/api/generationJobs';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GenerationJobClientOptions {
  fetchImpl?: FetchLike;
}

export interface SubscribeGenerationJobOptions extends GenerationJobClientOptions {
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

export class GenerationJobStillRunningError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly status: GenerationJobSnapshot['status'],
  ) {
    super(`Generation job "${jobId}" is still ${status} after reconnect attempts.`);
    this.name = 'GenerationJobStillRunningError';
  }
}

export function isGenerationJobStillRunningError(error: unknown): error is GenerationJobStillRunningError {
  return error instanceof GenerationJobStillRunningError
    || (Boolean(error) && typeof error === 'object' && (error as { name?: unknown }).name === 'GenerationJobStillRunningError');
}

export async function createGenerationJob(
  type: GenerationJobType,
  input: Record<string, unknown>,
  options: GenerationJobClientOptions = {},
): Promise<GenerationJobCreateResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl('/api/v1/generation-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, input }),
  });
  const data = await response.json().catch(() => ({ error: '生成任务创建失败。' }));
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error ?? '生成任务创建失败。'));
  return data as GenerationJobCreateResponse;
}

export async function getGenerationJob(
  jobId: string,
  options: GenerationJobClientOptions = {},
): Promise<GenerationJobSnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`/api/v1/generation-jobs/${encodeURIComponent(jobId)}`);
  const data = await response.json().catch(() => ({ error: '生成任务状态读取失败。' }));
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error ?? '生成任务状态读取失败。'));
  return data as GenerationJobSnapshot;
}

export async function listGenerationJobs(
  filters: GenerationJobListFilters = {},
  options: GenerationJobClientOptions = {},
): Promise<GenerationJobListResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.clientSessionId) params.set('clientSessionId', filters.clientSessionId);
  if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(filters.limit))));
  }
  const query = params.toString();
  const response = await fetchImpl(`/api/v1/generation-jobs${query ? `?${query}` : ''}`);
  const data = await response.json().catch(() => ({ error: '生成任务列表读取失败。' }));
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error ?? '生成任务列表读取失败。'));
  return data as GenerationJobListResponse;
}

export async function cancelGenerationJob(
  jobId: string,
  options: GenerationJobClientOptions = {},
): Promise<GenerationJobCancelResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`/api/v1/generation-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
  const data = await response.json().catch(() => ({ error: '生成任务取消失败。' }));
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error ?? '生成任务取消失败。'));
  return data as GenerationJobCancelResponse;
}

export async function subscribeGenerationJob(
  jobId: string,
  onEvent: (event: GenerationJobEvent) => void,
  options: SubscribeGenerationJobOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const reconnectDelayMs = Math.max(0, options.reconnectDelayMs ?? 500);
  const maxReconnectAttempts = Math.max(0, options.maxReconnectAttempts ?? 3);
  const deliveredSequences = new Set<number>();
  let latestSequence = 0;
  let terminalDelivered = false;
  let reconnectAttempts = 0;

  const emit = (event: GenerationJobEvent) => {
    if (typeof event.sequence === 'number' && Number.isFinite(event.sequence)) {
      if (deliveredSequences.has(event.sequence)) return;
      deliveredSequences.add(event.sequence);
      latestSequence = Math.max(latestSequence, event.sequence);
    }
    if (isTerminalJobEvent(event)) terminalDelivered = true;
    onEvent(event);
  };

  while (!terminalDelivered) {
    await subscribeGenerationJobOnce(jobId, emit, fetchImpl);
    if (terminalDelivered) return;

    const snapshot = await getGenerationJob(jobId, { fetchImpl });
    const terminalEvent = terminalEventFromSnapshot(snapshot, latestSequence + 1);
    if (terminalEvent) {
      emit(terminalEvent);
      if (terminalEvent.type === 'job_failed') {
        throw new Error(String(terminalEvent.message ?? '生成任务失败。'));
      }
      if (terminalEvent.type === 'job_cancelled') {
        throw new Error('生成任务已取消。');
      }
      return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      throw new GenerationJobStillRunningError(jobId, snapshot.status);
    }
    reconnectAttempts += 1;
    if (reconnectDelayMs > 0) await delay(reconnectDelayMs);
  }
}

async function subscribeGenerationJobOnce(
  jobId: string,
  onEvent: (event: GenerationJobEvent) => void,
  fetchImpl: FetchLike,
): Promise<void> {
  const response = await fetchImpl(`/api/v1/generation-jobs/${encodeURIComponent(jobId)}/events`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({ error: '生成任务订阅失败。' }));
    throw new Error(String((data as { error?: unknown }).error ?? '生成任务订阅失败。'));
  }

  await readSse(response.body, onEvent);
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: GenerationJobEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const line = block.split('\n').find((item) => item.startsWith('data: '));
        if (!line) continue;
        onEvent(JSON.parse(line.slice('data: '.length)) as GenerationJobEvent);
      }
    }
    if (done) {
      emitSseBlock(buffer, onEvent);
      break;
    }
  }
}

function emitSseBlock(block: string, onEvent: (event: GenerationJobEvent) => void): void {
  const line = block.split('\n').find((item) => item.startsWith('data: '));
  if (!line) return;
  onEvent(JSON.parse(line.slice('data: '.length)) as GenerationJobEvent);
}

function terminalEventFromSnapshot(
  snapshot: GenerationJobSnapshot,
  sequence: number,
): GenerationJobEvent | null {
  const base = {
    jobId: snapshot.id,
    sequence,
    createdAt: snapshot.completedAt ?? snapshot.updatedAt,
  };
  if (snapshot.status === 'completed') {
    return {
      ...base,
      type: 'job_completed',
      status: 'completed',
      result: snapshot.result,
      synthetic: true,
    };
  }
  if (snapshot.status === 'failed') {
    return {
      ...base,
      type: 'job_failed',
      status: 'failed',
      message: snapshot.error ?? '生成任务失败。',
      ...(snapshot.errorDiagnostics !== undefined ? { diagnostics: snapshot.errorDiagnostics } : {}),
      synthetic: true,
    };
  }
  if (snapshot.status === 'cancelled') {
    return {
      ...base,
      type: 'job_cancelled',
      status: 'cancelled',
      synthetic: true,
    };
  }
  return null;
}

function isTerminalJobEvent(event: GenerationJobEvent): boolean {
  return event.type === 'job_completed' || event.type === 'job_failed' || event.type === 'job_cancelled';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
