import { AppError } from '../../platform/errors';

const RAG_RUN_ID_PATTERN = /^run_[a-z0-9]+_[a-z0-9]+$/;

export function isRagRunId(value: unknown): value is string {
  return typeof value === 'string' && RAG_RUN_ID_PATTERN.test(value);
}

export function assertRagRunId(value: unknown): string {
  if (isRagRunId(value)) return value;
  throw new AppError('Invalid rag run id', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}

export function extractRagRunId(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const runId = (input as { runId?: unknown }).runId;
  return isRagRunId(runId) ? runId : undefined;
}
