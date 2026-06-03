import { fetchRemoteModelsV1 } from '@/features/settings/application/modelProfileService';
import { jsonError, jsonOk, parseJsonBody } from '@/platform/api/http';

export async function POST(request: Request) {
  try {
    return jsonOk(await fetchRemoteModelsV1(await parseJsonBody<unknown>(request)));
  } catch (error) {
    return jsonError(error, 'Failed to fetch remote models');
  }
}
