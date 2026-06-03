import { runDeepInteractionFollowUp } from '@/features/deep-interaction/application/deepInteractionService';
import { jsonError, jsonOk, parseJsonBody } from '@/platform/api/http';

export const maxDuration = 900;

export async function POST(request: Request) {
  try {
    return jsonOk(await runDeepInteractionFollowUp(await parseJsonBody(request)));
  } catch (error) {
    return jsonError(error, 'Follow-up failed');
  }
}
