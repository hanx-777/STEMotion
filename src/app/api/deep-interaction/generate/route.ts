import { createDeepInteractionGenerateResponse } from '@/features/deep-interaction/application/deepInteractionService';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    return createDeepInteractionGenerateResponse(await request.json(), request.signal);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Deep interaction generation failed' }, { status: 400 });
  }
}
