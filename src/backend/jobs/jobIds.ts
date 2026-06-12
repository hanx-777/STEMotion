import { AppError } from '../../platform/errors';

const GENERATION_JOB_ID_PATTERN = /^job_[a-z0-9]+_[a-z0-9]+$/;

export function isGenerationJobId(value: unknown): value is string {
  return typeof value === 'string' && GENERATION_JOB_ID_PATTERN.test(value);
}

export function assertGenerationJobId(value: unknown): string {
  if (isGenerationJobId(value)) return value;
  throw new AppError('Invalid generation job id', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}
