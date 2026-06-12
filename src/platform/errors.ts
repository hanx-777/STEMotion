export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'APP_ERROR';
    this.details = options.details;
  }
}

export function toAppError(error: unknown, fallbackMessage = 'Request failed'): AppError {
  if (error instanceof AppError) return error;
  return new AppError(fallbackMessage, { status: 400, code: 'REQUEST_FAILED' });
}
