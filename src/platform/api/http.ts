import { NextResponse } from 'next/server';
import { toAppError } from '@/platform/errors';
import type { ApiErrorPayload } from '@/shared/api/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('http');

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function jsonError(error: unknown, fallbackMessage = 'Request failed'): NextResponse {
  const appError = toAppError(error, fallbackMessage);
  const payload: ApiErrorPayload = {
      error: appError.message,
      code: appError.code,
      ...(appError.details === undefined ? {} : { details: appError.details }),
  };
  return NextResponse.json(payload, { status: appError.status });
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch (error) {
    log.debug('Failed to parse JSON body', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error('Invalid JSON request body');
  }
}
