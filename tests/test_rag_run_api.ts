import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileGenerationJobStore } from '../src/backend/jobs/fileJobStore';
import { GenerationJobManager } from '../src/backend/jobs/jobManager';
import { FileRagRunStore } from '../src/backend/ragRuns/fileRagRunStore';
import type { GenerationJobRunner } from '../src/backend/jobs/types';
import { createBackendServer } from '../src/backend/http/server';

test('rag run API creates a public run id, root job, recoverable snapshot, and traced events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-run-api-'));
  const jobsDir = join(dir, 'jobs');
  const runsDir = join(dir, 'runs');
  const runStore = new FileRagRunStore(runsDir);
  const runner: GenerationJobRunner = async (input, context) => {
    context.emit({ type: 'answer_ready', result: { answer: { text: 'draft' } } });
    const child = await context.enqueueJob?.('artifact_quality_review', {
      artifact: { id: 'artifact_1', type: 'rag_visualization' },
    });
    context.emit({
      type: 'artifact_quality_review_started',
      reviewJobId: child?.id,
      artifactId: 'artifact_1',
      status: 'queued',
    });
    return {
      type: 'rag_session_generation_result',
      request: { question: input.question },
      answer: { text: 'done' },
      visualizationStatus: 'ready',
    };
  };
  const childRunner: GenerationJobRunner = async () => ({ reviewed: true });
  const manager = new GenerationJobManager({
    store: new FileGenerationJobStore(jobsDir),
    runStore,
    runners: {
      rag_session_generation: runner,
      artifact_quality_review: childRunner,
    },
  });
  const server = createBackendServer({ manager, runStore });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const createResponse = await fetch(`${baseUrl}/api/v1/rag/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: '解释动量守恒',
        clientSessionId: 'rag_session_1',
        quality: { mode: 'highQuality' },
      }),
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { runId: string; rootJobId: string; status: string };
    assert.match(created.runId, /^run_[a-z0-9]+_[a-z0-9]+$/);
    assert.match(created.rootJobId, /^job_[a-z0-9]+_[a-z0-9]+$/);
    assert.equal(created.status, 'queued');

    await waitForRunStatus(baseUrl, created.runId, 'completed');

    const runResponse = await fetch(`${baseUrl}/api/v1/rag/runs/${created.runId}`);
    assert.equal(runResponse.status, 200);
    const payload = await runResponse.json() as {
      run: { runId: string; rootJobId: string; status: string; childJobIds: string[]; lastResult?: unknown };
      rootJob: { id: string; runId?: string; status: string };
      events: Array<{ type: string; runId?: string }>;
    };
    assert.equal(payload.run.runId, created.runId);
    assert.equal(payload.run.rootJobId, created.rootJobId);
    assert.equal(payload.run.status, 'completed');
    assert.equal(payload.rootJob.runId, created.runId);
    assert.equal(payload.rootJob.status, 'completed');
    assert.ok(payload.run.childJobIds.length >= 1, 'expected child quality review job to be linked to run');
    assert.ok(payload.events.some((event) => event.type === 'answer_ready' && event.runId === created.runId));
    assert.ok(payload.events.some((event) => event.type === 'job_completed' && event.runId === created.runId));
    assert.ok(payload.run.lastResult, 'expected completed run to persist last result');

    const rawSnapshot = await readFile(join(jobsDir, created.rootJobId, 'snapshot.json'), 'utf8');
    const rawEvents = await readFile(join(jobsDir, created.rootJobId, 'events.jsonl'), 'utf8');
    const rawTrace = await readFile(join(jobsDir, created.rootJobId, 'trace.jsonl'), 'utf8');
    assert.match(rawSnapshot, new RegExp(created.runId));
    assert.match(rawEvents, new RegExp(created.runId));
    assert.match(rawTrace, new RegExp(created.runId));

    const listResponse = await fetch(`${baseUrl}/api/v1/rag/runs?limit=5`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json() as { runs: Array<{ runId: string }> };
    assert.equal(listPayload.runs.some((run) => run.runId === created.runId), true);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('rag run API rejects unsafe public run ids', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-run-api-'));
  const runStore = new FileRagRunStore(join(dir, 'runs'));
  const server = createBackendServer({
    manager: new GenerationJobManager({
      store: new FileGenerationJobStore(join(dir, 'jobs')),
      runStore,
      runners: {},
    }),
    runStore,
  });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const response = await fetch(`${baseUrl}/api/v1/rag/runs/%2e%2e%2foutside`);
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error?: string }).error, 'Invalid rag run id');
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function listen(server: ReturnType<typeof createBackendServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function waitForRunStatus(baseUrl: string, runId: string, status: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v1/rag/runs/${encodeURIComponent(runId)}`);
    if (response.ok) {
      const payload = await response.json() as { run: { status: string } };
      if (payload.run.status === status) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for run ${runId} to become ${status}`);
}
