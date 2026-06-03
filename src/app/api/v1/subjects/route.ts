import { listSubjectsV1 } from '@/features/subjects/application/subjectService';
import { jsonError, jsonOk } from '@/platform/api/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonOk(await listSubjectsV1());
  } catch (error) {
    return jsonError(error, 'Failed to load subjects');
  }
}
