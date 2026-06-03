import { createDeepInteractionGenerateResponse } from '@/features/deep-interaction/application/deepInteractionService';
import { jsonError, parseJsonBody } from '@/platform/api/http';

export const maxDuration = 900;

export async function POST(request: Request) {
  try {
    return createDeepInteractionGenerateResponse(await parseJsonBody(request), request.signal);
  } catch (error) {
    return jsonError(error, 'Deep interaction generation failed');
  }
}
