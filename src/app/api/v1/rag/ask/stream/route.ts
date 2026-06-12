import { createRagAskStreamResponse } from '@/features/rag/application/ragAskStreamService';
import type { RagV1AskRequest } from '@/features/rag/contracts';
import { jsonError, parseJsonBody } from '@/platform/api/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<RagV1AskRequest>(request);
    return createRagAskStreamResponse(body, request.signal);
  } catch (error) {
    return jsonError(error, 'RAG ask stream failed');
  }
}
