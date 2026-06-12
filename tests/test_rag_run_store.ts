import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileRagRunStore } from '../src/backend/ragRuns/fileRagRunStore';
import type { GenerationJobSnapshot } from '../src/shared/api/generationJobs';

test('rag run store creates a stable root run record from a root generation job', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-runs-'));
  try {
    const store = new FileRagRunStore(dir);
    const job = makeJobSnapshot({
      id: 'job_root_123456789abc',
      type: 'rag_session_generation',
      status: 'queued',
      runId: 'run_root_123456789abc',
      inputSummary: {
        runId: 'run_root_123456789abc',
        clientSessionId: 'rag_session_1',
        question: { questionPreview: '解释动量守恒', questionLength: 6 },
      },
    });

    await store.recordJobCreated(job);

    const run = await store.readRun('run_root_123456789abc');
    const raw = await readFile(join(dir, 'run_root_123456789abc', 'run.json'), 'utf8');
    assert.equal(run?.runId, 'run_root_123456789abc');
    assert.equal(run?.rootJobId, job.id);
    assert.equal(run?.clientSessionId, 'rag_session_1');
    assert.equal(run?.status, 'queued');
    assert.deepEqual(run?.childJobIds, []);
    assert.match(raw, /解释动量守恒/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rag run store links child jobs and syncs root terminal result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-runs-'));
  try {
    const store = new FileRagRunStore(dir);
    const root = makeJobSnapshot({
      id: 'job_root_123456789abc',
      type: 'rag_session_generation',
      status: 'queued',
      runId: 'run_root_123456789abc',
      inputSummary: { runId: 'run_root_123456789abc' },
    });
    const child = makeJobSnapshot({
      id: 'job_child_123456789abc',
      type: 'artifact_quality_review',
      status: 'queued',
      runId: 'run_root_123456789abc',
      inputSummary: { runId: 'run_root_123456789abc' },
    });

    await store.recordJobCreated(root);
    await store.recordJobCreated(child);
    await store.recordJobCompleted({
      ...root,
      status: 'completed',
      result: { type: 'rag_session_generation_result', answer: { text: 'done' } },
      completedAt: new Date().toISOString(),
    });

    const run = await store.readRun('run_root_123456789abc');
    assert.deepEqual(run?.childJobIds, [child.id]);
    assert.equal(run?.status, 'completed');
    assert.deepEqual(run?.lastResult, { type: 'rag_session_generation_result', answer: { text: 'done' } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rag run store rejects unsafe run ids and lists by most recent update', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-runs-'));
  try {
    const store = new FileRagRunStore(dir);
    await assert.rejects(() => store.readRun('../outside'), /Invalid rag run id/);

    await store.recordJobCreated(makeJobSnapshot({
      id: 'job_old_123456789abc',
      type: 'rag_session_generation',
      status: 'queued',
      runId: 'run_old_123456789abc',
      inputSummary: { runId: 'run_old_123456789abc' },
    }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.recordJobCreated(makeJobSnapshot({
      id: 'job_new_123456789abc',
      type: 'rag_session_generation',
      status: 'queued',
      runId: 'run_new_123456789abc',
      inputSummary: { runId: 'run_new_123456789abc' },
    }));

    const runs = await store.listRuns({ limit: 2 });
    assert.deepEqual(runs.map((run) => run.runId), ['run_new_123456789abc', 'run_old_123456789abc']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function makeJobSnapshot(
  patch: Partial<GenerationJobSnapshot> & {
    id: string;
    type: GenerationJobSnapshot['type'];
    status: GenerationJobSnapshot['status'];
    runId: string;
  },
): GenerationJobSnapshot {
  const now = new Date().toISOString();
  return {
    id: patch.id,
    type: patch.type,
    status: patch.status,
    runId: patch.runId,
    inputSummary: patch.inputSummary ?? { runId: patch.runId },
    createdAt: patch.createdAt ?? now,
    updatedAt: patch.updatedAt ?? now,
    startedAt: patch.startedAt,
    completedAt: patch.completedAt,
    result: patch.result,
  };
}
