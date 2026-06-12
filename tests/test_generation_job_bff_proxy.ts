import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyBackendJson, proxyBackendSse } from '../src/platform/api/backendProxy';

test('backend JSON proxy returns clear 503 when local backend is unavailable', async () => {
  const response = await proxyBackendJson('/api/v1/generation-jobs', {
    method: 'POST',
    body: JSON.stringify({ type: 'deep_interaction', input: { prompt: '斜抛运动' } }),
  }, async () => {
    throw new TypeError('fetch failed');
  });

  assert.equal(response.status, 503);
  assert.match(await response.text(), /STEMotion backend is not running/);
});

test('backend SSE proxy preserves event-stream responses from local backend', async () => {
  const response = await proxyBackendSse('/api/v1/generation-jobs/job_1/events', async () => new Response('data: {"type":"job_created"}\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
  assert.equal(await response.text(), 'data: {"type":"job_created"}\n\n');
});

test('backend SSE proxy closes cleanly when upstream SSE socket is terminated', async () => {
  const encoder = new TextEncoder();
  let reads = 0;
  const upstreamBody = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads += 1;
      if (reads === 1) {
        controller.enqueue(encoder.encode('data: {"type":"progress"}\n\n'));
        return;
      }

      controller.error(new TypeError('terminated', {
        cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
      }));
    },
  });

  const response = await proxyBackendSse('/api/v1/generation-jobs/job_1/events', async () => new Response(upstreamBody, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  }));

  assert.equal(await response.text(), 'data: {"type":"progress"}\n\n');
});
