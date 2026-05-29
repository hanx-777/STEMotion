import { runDeepInteractionPlanning } from '@/features/deep-interaction/application/deepInteractionService';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    return Response.json(await runDeepInteractionPlanning(await request.json()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Planning failed' }, { status: 400 });
  }
}
