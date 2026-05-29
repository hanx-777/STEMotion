import { runDeepInteractionFollowUp } from '@/features/deep-interaction/application/deepInteractionService';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    return Response.json(await runDeepInteractionFollowUp(await request.json()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Follow-up failed' }, { status: 500 });
  }
}
