import { proxyBackendJson } from '@/platform/api/backendProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  return proxyBackendJson('/api/v1/generation-jobs', {
    method: 'POST',
    body: await request.text(),
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return proxyBackendJson(`/api/v1/generation-jobs${url.search}`);
}
