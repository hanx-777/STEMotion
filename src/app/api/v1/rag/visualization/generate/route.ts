import {
  createRagVisualizationGenerateResponse,
  toRagVisualizationAuditInput,
  type RagVisualizationGenerateRequest,
} from '@/features/rag/application/ragVisualizationService';
import { jsonError, parseJsonBody } from '@/platform/api/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<RagVisualizationGenerateRequest>(request);
    return createRagVisualizationGenerateResponse(
      toRagVisualizationAuditInput(body),
      request.signal,
    );
  } catch (error) {
    return jsonError(error, 'RAG visualization generation failed');
  }
}
