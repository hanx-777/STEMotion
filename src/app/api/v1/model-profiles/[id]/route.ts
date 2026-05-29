import { deleteModelProfileV1 } from '@/features/settings/application/modelProfileService';
import { jsonError, jsonOk } from '@/platform/api/http';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteParams) {
  try {
    const { id } = await context.params;
    return jsonOk(await deleteModelProfileV1(decodeURIComponent(id)));
  } catch (error) {
    return jsonError(error, 'Failed to delete model profile');
  }
}
