import { proxyBackendSse } from '@/platform/api/backendProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: RouteParams) {
  const { jobId } = await context.params;
  return proxyBackendSse(`/api/v1/generation-jobs/${encodeURIComponent(jobId)}/events`);
}
