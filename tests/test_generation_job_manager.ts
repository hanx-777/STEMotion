import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileGenerationJobStore } from '../src/backend/jobs/fileJobStore';
import { GenerationJobManager } from '../src/backend/jobs/jobManager';
import type { GenerationJobRunner } from '../src/backend/jobs/types';

test('unsubscribing from a job stream does not abort the running job', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-manager-'));
  try {
    let releaseRunner!: () => void;
    let observedSignal: AbortSignal | undefined;
    const runner: GenerationJobRunner = async (_input, context) => {
      observedSignal = context.signal;
      context.emit({ type: 'progress', stage: 'planning', progress: 10 });
      await new Promise<void>((resolve) => { releaseRunner = resolve; });
      context.emit({ type: 'artifact_ready', progress: 100 });
      return { artifactId: 'artifact_1' };
    };

    const manager = new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: { deep_interaction: runner },
    });

    const job = await manager.createJob('deep_interaction', { prompt: '斜抛运动' });
    await waitFor(() => observedSignal !== undefined);
    const unsubscribe = manager.subscribe(job.id, () => undefined);
    unsubscribe();

    assert.equal(observedSignal?.aborted, false);
    releaseRunner();
    await waitForJobStatus(manager, job.id, 'completed');

    const completed = await manager.getJob(job.id);
    assert.equal(completed?.status, 'completed');
    assert.equal(observedSignal?.aborted, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('explicit cancel aborts the active job and records cancelled status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-manager-'));
  try {
    let observedSignal: AbortSignal | undefined;
    const runner: GenerationJobRunner = async (_input, context) => {
      observedSignal = context.signal;
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return { cancelled: true };
    };

    const manager = new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: { rag_visualization: runner },
    });

    const job = await manager.createJob('rag_visualization', { question: '单调栈' });
    await waitFor(() => observedSignal !== undefined);
    await manager.cancelJob(job.id);
    await waitForJobStatus(manager, job.id, 'cancelled');

    const cancelled = await manager.getJob(job.id);
    const events = await manager.readEvents(job.id);
    assert.equal(observedSignal?.aborted, true);
    assert.equal(cancelled?.status, 'cancelled');
    assert.ok(events.some((event) => event.type === 'job_cancelled'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cancelled jobs ignore late runner events and never become failed or completed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-manager-'));
  try {
    let observedSignal: AbortSignal | undefined;
    const runner: GenerationJobRunner = async (_input, context) => {
      observedSignal = context.signal;
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      context.emit({ type: 'progress', stage: 'after_cancel', progress: 99 });
      throw new Error('runner noticed abort after cleanup');
    };

    const manager = new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: { deep_interaction: runner },
    });

    const job = await manager.createJob('deep_interaction', { prompt: '取消竞态测试' });
    await waitFor(() => observedSignal !== undefined);
    await manager.cancelJob(job.id);
    await waitForJobStatus(manager, job.id, 'cancelled');
    await new Promise((resolve) => setTimeout(resolve, 30));

    const cancelled = await manager.getJob(job.id);
    const events = await manager.readEvents(job.id);
    assert.equal(cancelled?.status, 'cancelled');
    assert.equal(cancelled?.error, undefined);
    assert.equal(events.some((event) => event.type === 'job_failed'), false);
    assert.equal(events.some((event) => event.type === 'job_completed'), false);
    assert.equal(events.some((event) => event.stage === 'after_cancel'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('failed jobs persist sanitized diagnostics and trace entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-manager-'));
  try {
    const runner: GenerationJobRunner = async () => {
      const error = new Error('[anthropic] 模型返回为空，请稍后重试。');
      Object.assign(error, {
        diagnostics: {
          requestStage: 'empty_text_fallback',
          stream: false,
          apiKey: 'sk-secret-should-not-leak',
          prompt: 'SECRET_PROMPT_SHOULD_NOT_LEAK',
          payloadShape: ['content:array(1)'],
        },
      });
      throw error;
    };

    const manager = new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: { rag_visualization: runner },
    });

    const job = await manager.createJob('rag_visualization', {
      question: '斜抛运动',
      apiKey: 'input-secret-should-not-leak',
    });
    await waitForJobStatus(manager, job.id, 'failed');

    const failed = await manager.getJob(job.id);
    const events = await manager.readEvents(job.id);
    const failedEvent = events.find((event) => event.type === 'job_failed') as Record<string, unknown> | undefined;
    const rawSnapshot = await readFile(join(dir, job.id, 'snapshot.json'), 'utf8');
    const rawEvents = await readFile(join(dir, job.id, 'events.jsonl'), 'utf8');
    const rawTrace = await readFile(join(dir, job.id, 'trace.jsonl'), 'utf8');

    assert.equal(failed?.status, 'failed');
    assert.ok(failed?.errorDiagnostics, 'expected snapshot error diagnostics');
    assert.ok(failedEvent?.diagnostics, 'expected job_failed diagnostics');
    assert.match(rawTrace, /"event":"job_started"/);
    assert.match(rawTrace, /"event":"job_failed"/);
    assert.match(rawTrace, /"requestStage":"empty_text_fallback"/);
    assert.match(rawSnapshot, /errorDiagnostics/);
    assert.match(rawEvents, /diagnostics/);
    assert.equal(rawSnapshot.includes('sk-secret-should-not-leak'), false);
    assert.equal(rawEvents.includes('SECRET_PROMPT_SHOULD_NOT_LEAK'), false);
    assert.equal(rawTrace.includes('input-secret-should-not-leak'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('completed visualization jobs persist replayable artifact_ready and job_completed result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-manager-'));
  try {
    const artifact = {
      id: 'artifact_1',
      type: 'rag_visualization',
      title: '单调栈互动可视化',
    };
    const runner: GenerationJobRunner = async (_input, context) => {
      context.emit({ type: 'progress', stage: 'building_interaction', progress: 42 });
      context.emit({ type: 'artifact_ready', artifact, progress: 100 });
      return artifact;
    };

    const manager = new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: { rag_visualization: runner },
    });

    const job = await manager.createJob('rag_visualization', { question: '单调栈' });
    await waitForJobStatus(manager, job.id, 'completed');

    const completed = await manager.getJob(job.id);
    const replayedEvents = await manager.readEvents(job.id);
    const artifactReady = replayedEvents.find((event) => event.type === 'artifact_ready') as Record<string, unknown> | undefined;
    const jobCompleted = replayedEvents.find((event) => event.type === 'job_completed') as Record<string, unknown> | undefined;

    assert.equal(completed?.status, 'completed');
    assert.deepEqual(completed?.result, artifact);
    assert.deepEqual(artifactReady?.artifact, artifact);
    assert.deepEqual(jobCompleted?.result, artifact);
    assert.ok((artifactReady?.sequence as number) < (jobCompleted?.sequence as number));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runner context can enqueue a background child generation job', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-manager-'));
  try {
    const parentRunner: GenerationJobRunner = async (_input, context) => {
      const child = await context.enqueueJob?.('artifact_quality_review', {
        artifact: { id: 'artifact_1', type: 'rag_visualization' },
      });
      context.emit({
        type: 'artifact_quality_review_started',
        reviewJobId: child?.id,
        artifactId: 'artifact_1',
        status: 'queued',
      });
      return { childJobId: child?.id };
    };
    const childRunner: GenerationJobRunner = async (_input, context) => {
      context.emit({
        type: 'artifact_quality_updated',
        artifactId: 'artifact_1',
        qualityReport: { status: 'reviewed', finalScore: 90 },
      });
      return { reviewed: true };
    };

    const manager = new GenerationJobManager({
      store: new FileGenerationJobStore(dir),
      runners: {
        rag_session_generation: parentRunner,
        artifact_quality_review: childRunner,
      },
    });

    const parent = await manager.createJob('rag_session_generation', { question: '单调栈' });
    await waitForJobStatus(manager, parent.id, 'completed');

    const parentSnapshot = await manager.getJob(parent.id);
    const childJobId = (parentSnapshot?.result as { childJobId?: string } | undefined)?.childJobId;
    assert.ok(childJobId, 'expected parent result to include child job id');
    await waitForJobStatus(manager, childJobId, 'completed');

    const parentEvents = await manager.readEvents(parent.id);
    const childEvents = await manager.readEvents(childJobId);
    assert.ok(parentEvents.some((event) => event.type === 'artifact_quality_review_started'));
    assert.ok(childEvents.some((event) => event.type === 'artifact_quality_updated'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function waitForJobStatus(manager: GenerationJobManager, jobId: string, status: string): Promise<void> {
  await waitFor(async () => (await manager.getJob(jobId))?.status === status);
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
}
