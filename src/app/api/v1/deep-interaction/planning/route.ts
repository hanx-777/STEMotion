import { runDeepInteractionPlanning } from '@/features/deep-interaction/application/deepInteractionService';
import { jsonError, jsonOk, parseJsonBody } from '@/platform/api/http';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    return jsonOk(await runDeepInteractionPlanning(await parseJsonBody(request)));
  } catch (error) {
    return jsonError(error, 'Planning failed');
  }
}
