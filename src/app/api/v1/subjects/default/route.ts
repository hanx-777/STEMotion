import { getDefaultSubjectV1, setDefaultSubjectV1 } from '@/features/subjects/application/subjectService';
import { jsonError, jsonOk, parseJsonBody } from '@/platform/api/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonOk(await getDefaultSubjectV1());
  } catch (error) {
    return jsonError(error, 'Failed to load default subject');
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await parseJsonBody<{ subject?: string; subjectId?: string }>(request);
    return jsonOk(await setDefaultSubjectV1(body.subjectId ?? body.subject ?? ''));
  } catch (error) {
    return jsonError(error, 'Failed to set default subject');
  }
}

export const POST = PATCH;
