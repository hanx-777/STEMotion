import {
  activateModelProfileV1,
  getModelProfilesV1,
  saveModelProfileV1,
} from '@/features/settings/application/modelProfileService';
import { jsonError, jsonOk, parseJsonBody } from '@/platform/api/http';

export async function GET() {
  try {
    return jsonOk(await getModelProfilesV1());
  } catch (error) {
    return jsonError(error, 'Failed to load model profiles');
  }
}

export async function POST(request: Request) {
  try {
    return jsonOk(await saveModelProfileV1(await parseJsonBody<unknown>(request)));
  } catch (error) {
    return jsonError(error, 'Failed to save model profile');
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await parseJsonBody<{ activeProfile?: unknown }>(request);
    return jsonOk(await activateModelProfileV1(body.activeProfile));
  } catch (error) {
    return jsonError(error, 'Failed to switch model profile');
  }
}
