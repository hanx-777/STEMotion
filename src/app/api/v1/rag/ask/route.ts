import { askRagV1 } from '@/features/rag/application/ragAskService';
import type { RagV1AskRequest } from '@/features/rag/contracts';
import { jsonError, jsonOk, parseJsonBody } from '@/platform/api/http';
import { AppError } from '@/platform/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<RagV1AskRequest>(request);
    if (!body.question?.trim()) {
      return jsonError(new AppError('question is required', { status: 400, code: 'VALIDATION_ERROR' }));
    }
    return jsonOk(await askRagV1(body));
  } catch (error) {
    return jsonError(error, 'RAG ask failed');
  }
}
