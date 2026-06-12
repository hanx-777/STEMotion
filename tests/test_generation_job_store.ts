import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileGenerationJobStore, pathExists } from '../src/backend/jobs/fileJobStore';

test('file job store persists snapshots, redacts sensitive input, and orders events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-jobs-'));
  try {
    const store = new FileGenerationJobStore(dir);
    const fullPrompt = 'Explain monotonic stacks with a detailed visual plan. '.repeat(20);

    const created = await store.createJob('deep_interaction', {
      prompt: fullPrompt,
      apiKey: 'sk-secret-value',
      nested: { token: 'private-token', model: 'mimo-v2.5' },
    });
    await store.updateJob(created.id, { status: 'running', result: { ok: true } });
    await store.appendEvent(created.id, { type: 'progress', stage: 'planning', progress: 10 });
    await store.appendEvent(created.id, { type: 'artifact_ready', progress: 100 });

    const snapshot = await store.readJob(created.id);
    const listed = await store.listJobs();
    const events = await store.readEvents(created.id);
    const rawSnapshot = await readFile(join(dir, created.id, 'snapshot.json'), 'utf8');

    assert.equal(snapshot?.status, 'running');
    assert.deepEqual(snapshot?.result, { ok: true });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);
    assert.deepEqual(events.map((event) => event.type), ['progress', 'artifact_ready']);
    assert.deepEqual(events.map((event) => event.sequence), [1, 2]);
    assert.equal(rawSnapshot.includes(fullPrompt), false);
    assert.equal(rawSnapshot.includes('sk-secret-value'), false);
    assert.equal(rawSnapshot.includes('private-token'), false);
    assert.match(rawSnapshot, /promptLength/);
    assert.match(rawSnapshot, /promptPreview/);
    assert.match(rawSnapshot, /mimo-v2\.5/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file job store serializes concurrent snapshot updates for the same job', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-jobs-'));
  const originalNow = Date.now;
  try {
    const store = new FileGenerationJobStore(dir);
    const created = await store.createJob('deep_interaction', { prompt: '并发写入测试' });

    Date.now = () => 1780929495401;
    await Promise.all(
      Array.from({ length: 16 }, (_, index) => store.updateJob(created.id, {
        status: 'running',
        result: { index },
      })),
    );

    const snapshot = await store.readJob(created.id);
    const rawSnapshot = await readFile(join(dir, created.id, 'snapshot.json'), 'utf8');
    assert.equal(snapshot?.status, 'running');
    assert.match(rawSnapshot, /"index":/);
  } finally {
    Date.now = originalNow;
    await rm(dir, { recursive: true, force: true });
  }
});

test('file job store rejects unsafe job ids before resolving paths', async () => {
  const parentDir = await mkdtemp(join(tmpdir(), 'stemotion-jobs-parent-'));
  const jobsDir = join(parentDir, 'jobs');
  const outsideDir = join(parentDir, 'outside');

  try {
    const store = new FileGenerationJobStore(jobsDir);

    await assert.rejects(
      () => store.appendEvent('../outside', { type: 'progress', progress: 10 }),
      /Invalid generation job id/,
    );
    await assert.rejects(
      () => store.updateJob('../outside', { status: 'running' }),
      /Invalid generation job id/,
    );
    await assert.rejects(
      () => store.readEvents('../outside'),
      /Invalid generation job id/,
    );
    await assert.rejects(
      () => store.readJob('../outside'),
      /Invalid generation job id/,
    );
    assert.equal(await pathExists(outsideDir), false);
  } finally {
    await rm(parentDir, { recursive: true, force: true });
  }
});
