import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileGenerationJobStore, pathExists } from '../src/backend/jobs/fileJobStore';
import { GenerationJobManager } from '../src/backend/jobs/jobManager';
import type { GenerationJobRunner } from '../src/backend/jobs/types';
import { createBackendServer } from '../src/backend/http/server';

test('local backend exposes health, job create/status/events, and explicit cancel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-http-'));
  const server = createBackendServer({
    manager: new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: {
        deep_interaction: async (_input, context) => {
          context.emit({ type: 'progress', stage: 'planning', message: 'ok', progress: 10 });
          context.emit({ type: 'artifact_ready', artifact: { id: 'artifact_1' }, progress: 100 });
          return { artifactId: 'artifact_1' };
        },
        rag_visualization: createAbortOnlyRunner(),
      },
    }),
  });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { ok: boolean }).ok, true);

    const createResponse = await fetch(`${baseUrl}/api/v1/generation-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'deep_interaction', input: { prompt: '斜抛运动', preferredType: 'simulation' } }),
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { jobId: string; status: string };
    assert.equal(created.status, 'queued');

    await waitForStatus(baseUrl, created.jobId, 'completed');

    const statusResponse = await fetch(`${baseUrl}/api/v1/generation-jobs/${created.jobId}`);
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json() as { status: string }).status, 'completed');

    const listResponse = await fetch(`${baseUrl}/api/v1/generation-jobs?type=deep_interaction&status=completed&limit=5`);
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json() as { jobs: Array<{ id: string; type: string; status: string }> };
    assert.equal(listed.jobs.some((job) => job.id === created.jobId), true);
    assert.equal(listed.jobs.every((job) => job.type === 'deep_interaction' && job.status === 'completed'), true);

    const eventsResponse = await fetch(`${baseUrl}/api/v1/generation-jobs/${created.jobId}/events`);
    assert.equal(eventsResponse.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
    const events = parseSse(await eventsResponse.text());
    assert.deepEqual(events.slice(0, 4).map((event) => event.type), [
      'job_created',
      'job_started',
      'progress',
      'artifact_ready',
    ]);

    const cancelCreate = await fetch(`${baseUrl}/api/v1/generation-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rag_visualization', input: { question: '单调栈' } }),
    });
    const cancelJob = await cancelCreate.json() as { jobId: string };
    const cancelResponse = await fetch(`${baseUrl}/api/v1/generation-jobs/${cancelJob.jobId}/cancel`, { method: 'POST' });
    const cancelText = await cancelResponse.text();
    assert.equal(cancelResponse.status, 200, cancelText);
    assert.equal((JSON.parse(cancelText) as { status: string }).status, 'cancelled');
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('local backend rejects unsupported generation job types with 400', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-http-'));
  const server = createBackendServer({
    manager: new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: {},
    }),
  });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const response = await fetch(`${baseUrl}/api/v1/generation-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'not_a_real_job', input: {} }),
    });
    const payload = await response.json() as { error?: string };

    assert.equal(response.status, 400);
    assert.equal(payload.error, 'Generation job type "not_a_real_job" is not supported');
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('local backend rejects decoded unsafe generation job ids with 400', async () => {
  const parentDir = await mkdtemp(join(tmpdir(), 'stemotion-http-parent-'));
  const jobsDir = join(parentDir, 'jobs');
  const outsideDir = join(parentDir, 'outside');
  const server = createBackendServer({
    manager: new GenerationJobManager({
      store: new FileGenerationJobStore(jobsDir),
      runners: {},
    }),
  });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const unsafeId = '%2e%2e%2foutside';

    const statusResponse = await fetch(`${baseUrl}/api/v1/generation-jobs/${unsafeId}`);
    const eventsResponse = await fetch(`${baseUrl}/api/v1/generation-jobs/${unsafeId}/events`);
    const cancelResponse = await fetch(`${baseUrl}/api/v1/generation-jobs/${unsafeId}/cancel`, { method: 'POST' });

    assert.equal(statusResponse.status, 400);
    assert.equal((await statusResponse.json() as { error?: string }).error, 'Invalid generation job id');
    assert.equal(eventsResponse.status, 400);
    assert.equal((await eventsResponse.json() as { error?: string }).error, 'Invalid generation job id');
    assert.equal(cancelResponse.status, 400);
    assert.equal((await cancelResponse.json() as { error?: string }).error, 'Invalid generation job id');
    assert.equal(await pathExists(outsideDir), false);
  } finally {
    server.close();
    await rm(parentDir, { recursive: true, force: true });
  }
});

function createAbortOnlyRunner(): GenerationJobRunner {
  return async (_input, context) => {
    await new Promise<void>((resolve) => {
      context.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    return { cancelled: true };
  };
}

async function listen(server: ReturnType<typeof createBackendServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function waitForStatus(baseUrl: string, jobId: string, status: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v1/generation-jobs/${jobId}`);
    const snapshot = await response.json() as { status: string };
    if (snapshot.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${status}`);
}

function parseSse(text: string): Array<{ type: string }> {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)) as { type: string });
}
