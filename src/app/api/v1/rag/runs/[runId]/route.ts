import { proxyBackendJson } from '@/platform/api/backendProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RouteParams = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, context: RouteParams) {
  const { runId } = await context.params;
  return proxyBackendJson(`/api/v1/rag/runs/${encodeURIComponent(runId)}`, { method: 'GET' });
}
