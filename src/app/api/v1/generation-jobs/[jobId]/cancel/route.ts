import { proxyBackendJson } from '@/platform/api/backendProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RouteParams = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, context: RouteParams) {
  const { jobId } = await context.params;
  return proxyBackendJson(`/api/v1/generation-jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}
