import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileGenerationJobStore } from '../src/backend/jobs/fileJobStore';
import { GenerationJobManager } from '../src/backend/jobs/jobManager';
import { FileRagRunStore } from '../src/backend/ragRuns/fileRagRunStore';
import { exportRagRunFlow } from '../src/backend/ragRuns/ragRunFlowExport';
import type { GenerationJobRunner } from '../src/backend/jobs/types';
import { createBackendServer } from '../src/backend/http/server';
import { recordGenerationTrace } from '../src/lib/generation/trace';
import type { RagV1AskResponse } from '../src/features/rag/contracts';

const QUESTION = [
  '一质量为 m 的小球从高度 h 处由静止释放，沿光滑轨道下滑后，在水平光滑面上与另一质量为 2m、静止的小球发生完全弹性正碰。',
  '',
  '已知重力加速度为 g，忽略空气阻力。',
  '',
  '求：',
  '',
  '质量为 m 的小球到达水平面时的速度大小；',
  '碰撞后两个小球的速度大小和方向；',
  '若 h=0.8m，g=10m/s',
  '2',
  '，求碰撞后两球的速度数值。',
].join('\n');

test('exports completed RAG run flow with described snapshots, events, traces, child jobs, and final outputs', async () => {
  const fixture = await createCompletedRunFixture();
  try {
    const payload = await exportRagRunFlow(fixture.runId, {
      runStore: fixture.runStore,
      jobReader: fixture.manager,
      exportedAt: '2026-06-11T12:00:00.000Z',
    });

    assert.equal(payload.metadata.runId, fixture.runId);
    assert.equal(payload.metadata.rootJobId, fixture.rootJobId);
    assert.equal(payload.metadata.status, 'completed');
    assert.deepEqual(payload.metadata.childJobIds, [fixture.childJobId]);
    assert.equal(payload.input.originalQuestion, QUESTION);
    assert.equal(payload.input.normalizedRequest.question, QUESTION);
    assert.equal(payload.snapshots.run.runId, fixture.runId);
    assert.equal(payload.snapshots.rootJob.id, fixture.rootJobId);
    assert.equal(payload.snapshots.childJobs.length, 1);
    assert.equal(payload.snapshots.childJobs[0]?.snapshot.id, fixture.childJobId);
    assert.ok(payload.snapshots.rootTrace.some((entry) => entry.event === 'llm_request'));
    assert.ok(payload.snapshots.childJobs[0]?.trace.some((entry) => entry.event === 'llm_response'));

    const ragAnswer = payload.finalOutputs.ragAnswer as { answer?: { text?: string } } | undefined;
    const visualizationArtifact = payload.finalOutputs.visualizationArtifact as { id?: string } | undefined;
    const qualityReport = payload.finalOutputs.qualityReport as { score?: number } | undefined;
    assert.equal(payload.finalOutputs.ragSessionGenerationResult?.request.question, QUESTION);
    assert.match(String(ragAnswer?.answer?.text), /完整回答/);
    assert.equal(visualizationArtifact?.id, 'artifact_export_1');
    assert.equal(qualityReport?.score, 96);

    assert.ok(payload.timeline.length >= 10, 'expected a full flow timeline');
    assert.equal(payload.timeline.every((entry) => entry.description.trim().length > 0), true);
    assert.equal(payload.timeline.every((entry, index) => entry.sequence === index + 1), true);

    const eventTypes = payload.timeline
      .map((entry) => entry.data)
      .filter((data): data is { type: string } => Boolean(data) && typeof (data as { type?: unknown }).type === 'string')
      .map((data) => data.type);
    assert.ok(eventTypes.includes('answer_delta'));
    assert.ok(eventTypes.includes('answer_ready'));
    assert.ok(eventTypes.includes('quality_ready'));
    assert.ok(eventTypes.includes('artifact_ready'));
    assert.ok(eventTypes.includes('final_result'));
    assert.ok(eventTypes.includes('job_completed'));
    assert.ok(
      payload.timeline.some((entry) => entry.description.includes('历史 trace 中原文已被清洗，无法反推')),
      'expected trace summary limitation to be explicit',
    );

    const raw = JSON.stringify(payload);
    assert.match(raw, /完整回答/);
    assert.match(raw, /一质量为 m 的小球/);
    assert.equal(raw.includes('sk-test-secret'), false);
    assert.equal(raw.includes('Bearer private-token'), false);
    assert.match(raw, /\[redacted\]/);
    assert.equal(payload.redaction.policy, 'Secrets are redacted; non-secret RAG business payloads are preserved as fully as stored data allows.');
  } finally {
    await fixture.cleanup();
  }
});

test('RAG run export API returns full JSON and rejects missing or unsafe run ids', async () => {
  const fixture = await createCompletedRunFixture();
  const server = createBackendServer({
    manager: fixture.manager,
    runStore: fixture.runStore,
  });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const response = await fetch(`${baseUrl}/api/v1/rag/runs/${fixture.runId}/export`);
    assert.equal(response.status, 200);
    const payload = await response.json() as Awaited<ReturnType<typeof exportRagRunFlow>>;
    assert.equal(payload.metadata.runId, fixture.runId);
    assert.equal(payload.finalOutputs.ragSessionGenerationResult?.request.question, QUESTION);

    const missing = await fetch(`${baseUrl}/api/v1/rag/runs/run_missing_123456789abc/export`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json() as { error?: string }).error, 'rag run not found');

    const unsafe = await fetch(`${baseUrl}/api/v1/rag/runs/%2e%2e%2foutside/export`);
    assert.equal(unsafe.status, 400);
    assert.equal((await unsafe.json() as { error?: string }).error, 'Invalid rag run id');
  } finally {
    server.close();
    await fixture.cleanup();
  }
});

async function createCompletedRunFixture(): Promise<{
  dir: string;
  runId: string;
  rootJobId: string;
  childJobId: string;
  manager: GenerationJobManager;
  runStore: FileRagRunStore;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-rag-export-'));
  const jobStore = new FileGenerationJobStore(join(dir, 'jobs'));
  const runStore = new FileRagRunStore(join(dir, 'runs'));
  const runId = 'run_export_123456789abc';
  let childJobId = '';

  const rootRunner: GenerationJobRunner = async (input, context) => {
    recordGenerationTrace({
      event: 'llm_request',
      stage: 'rag_answer',
      summary: {
        model: 'mimo-v2.5-pro',
        requestPreset: 'answer',
        prompt: `请完整解答：${String(input.question)}`,
        apiKey: 'sk-test-secret',
      },
      diagnostics: {
        authorization: 'Bearer private-token',
      },
    });
    context.emit({ type: 'answer_delta', delta: '完整' });
    context.emit({ type: 'answer_delta', delta: '回答' });

    const answer = makeAnswerResponse();
    context.emit({ type: 'answer_ready', result: answer });
    context.emit({ type: 'quality_ready', qualityReport: answer.qualityReport });
    context.emit({ type: 'artifact_ready', artifact: makeArtifact() });
    const child = await context.enqueueJob?.('artifact_quality_review', {
      artifact: makeArtifact(),
      apiKey: 'sk-test-secret',
    });
    childJobId = child?.id ?? '';
    context.emit({
      type: 'artifact_quality_review_started',
      reviewJobId: childJobId,
      artifactId: 'artifact_export_1',
      status: 'queued',
    });

    const result = {
      type: 'rag_session_generation_result',
      request: {
        question: String(input.question),
        subjectId: input.subjectId,
        taskType: input.taskType,
        useWebSearch: true,
        qualityMode: 'highQuality',
        visualizationMode: 'auto',
        source: 'student',
        clientSessionId: 'rag_session_export',
      },
      answer,
      visualizationStatus: 'ready',
      artifact: makeArtifact(),
      qualityReviewJobId: childJobId,
      qualityReviewStatus: 'queued',
      apiKey: 'sk-test-secret',
    };
    context.emit({ type: 'final_result', result });
    return result;
  };

  const childRunner: GenerationJobRunner = async () => {
    recordGenerationTrace({
      event: 'llm_response',
      stage: 'artifact_quality_review',
      summary: {
        status: 200,
        chars: 20,
      },
    });
    return {
      ...makeArtifact(),
      finalScore: 89,
      apiKey: 'sk-test-secret',
    };
  };

  const manager = new GenerationJobManager({
    store: jobStore,
    runStore,
    runners: {
      rag_session_generation: rootRunner,
      artifact_quality_review: childRunner,
    },
  });

  const rootJob = await manager.createJob('rag_session_generation', {
    question: QUESTION,
    subjectId: 'physics_mechanics',
    taskType: 'step_solution',
    source: 'student',
    clientSessionId: 'rag_session_export',
    retrieval: { useWebSearch: true },
    quality: { mode: 'highQuality' },
    visualization: { mode: 'auto' },
    runId,
  });

  await waitForJobStatus(manager, rootJob.id, 'completed');
  await waitForRunStatus(runStore, runId, 'completed');
  const run = await runStore.readRun(runId);
  childJobId = childJobId || run?.childJobIds[0] || '';
  assert.ok(childJobId, 'expected a child quality job');
  await waitForJobStatus(manager, childJobId, 'completed');

  return {
    dir,
    runId,
    rootJobId: rootJob.id,
    childJobId,
    manager,
    runStore,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

function makeAnswerResponse(): RagV1AskResponse {
  return {
    subject: { id: 'physics_mechanics', displayName: '力学' },
    taskType: 'step_solution',
    answer: {
      protocol: 'json',
      text: '完整回答：到达水平面速度为 v=sqrt(2gh)，碰后 m 球反向速度大小为 v/3，2m 球同向速度大小为 2v/3。h=0.8m,g=10m/s^2 时 v=4m/s，所以速度分别为 4/3m/s 和 8/3m/s。',
      sections: [
        { id: 'model', title: '物理模型判断', content: '光滑轨道用机械能守恒，水平正碰用完全弹性碰撞公式。' },
      ],
      formulas: [
        { id: 'speed', latex: 'v=\\sqrt{2gh}' },
        { id: 'collision', latex: "v_1'=-\\frac13v,\\quad v_2'=\\frac23v" },
      ],
      finalResults: [
        { label: '水平面速度', value: 'sqrt(2gh)', unit: 'm/s' },
        { label: '数值速度', value: '4/3, 8/3', unit: 'm/s' },
      ],
    },
    citations: [],
    evidence: {
      chunks: [
        {
          content: '完全弹性碰撞同时满足动量守恒与机械能守恒。',
          score: 0.92,
          metadata: {
            source: 'mechanics.md',
            subject: 'physics_mechanics',
            file_name: 'mechanics.md',
            chunk_id: 'chunk_1',
            created_at: '2026-06-11T00:00:00.000Z',
            source_type: 'local',
          },
        },
      ],
      sourceSummary: { local_count: 1, web_count: 0 },
      pack: {
        subject: 'physics_mechanics',
        question: QUESTION,
        task_type: 'step_solution',
        no_evidence: false,
        local_blocks: [],
        web_blocks: [],
        guidance: '使用守恒定律。',
      },
    },
    retrievalReport: {
      localCandidateCount: 1,
      localReliableCount: 1,
      webCount: 0,
      topLocalScore: 0.92,
      lexicalTopK: 8,
      embeddingTopK: 8,
      rerankTopK: 4,
      evidenceThreshold: 0.4,
      usedEmbedding: true,
      triggeredWebSearch: false,
      lowEvidence: false,
      rewrittenQueries: ['完全弹性碰撞 机械能守恒'],
      keywords: ['完全弹性碰撞', '机械能守恒'],
    },
    qualityReport: {
      passed: true,
      score: 96,
      checks: [
        { name: '数值检查', passed: true, message: '速度计算一致。', severity: 'info' },
      ],
      decision: 'accept',
    },
    shouldGenerateVisualization: true,
    warnings: [],
  };
}

function makeArtifact(): Record<string, unknown> {
  return {
    id: 'artifact_export_1',
    sessionId: 'session_export_1',
    type: 'rag_visualization',
    title: '机械能守恒与完全弹性碰撞互动可视化',
    status: 'ready',
    finalScore: 99,
    schema: {
      type: 'rag_visualization',
      ragMetadata: {
        originalQuestion: QUESTION,
        subject: 'physics_mechanics',
        taskType: 'step_solution',
        source: 'student',
      },
      htmlWidget: {
        html: '<html><body><script>window.answer="完整回答";</script></body></html>',
      },
    },
    qualityReport: {
      finalScore: 99,
      passed: true,
    },
  };
}

async function waitForJobStatus(
  manager: GenerationJobManager,
  jobId: string,
  status: 'completed' | 'failed' | 'cancelled',
): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const job = await manager.getJob(jobId);
    if (job?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for job ${jobId} to become ${status}`);
}

async function waitForRunStatus(
  runStore: FileRagRunStore,
  runId: string,
  status: 'completed' | 'failed' | 'cancelled',
): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const run = await runStore.readRun(runId);
    if (run?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for run ${runId} to become ${status}`);
}

async function listen(server: ReturnType<typeof createBackendServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}
