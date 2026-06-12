import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGenerationJobRunners,
  resolveRagVisualizationMaxIterations,
  resolveRagVisualizationModePolicy,
} from '../src/backend/generation/runners';
import {
  isRagSessionGenerationResult,
  type GenerationJobSnapshot,
} from '../src/shared/api/generationJobs';
import type { InteractionArtifact } from '../src/features/deep-interaction/lib/types';
import type { RagAskResult } from '../src/features/rag/lib/types';

test('rag ask stream runner emits existing stream contract events and final_result', async () => {
  const result = createMockRagResult();
  const events: Array<Record<string, unknown>> = [];
  const runners = createGenerationJobRunners({
    ragAsk: async (_input, options) => {
      options.onEvent?.({ type: 'progress', stage: 'retrieve_local', message: 'ok', progress: 20 });
      options.onEvent?.({ type: 'answer_delta', delta: 'partial' });
      options.onEvent?.({ type: 'answer_ready', result });
      options.onEvent?.({ type: 'quality_ready', qualityReport: result.quality_report! });
      return result;
    },
  });

  await runners.rag_ask_stream(
    { question: '斜抛运动最大高度怎么算？', quality: { mode: 'highQuality' } },
    { signal: new AbortController().signal, emit: (event) => events.push(event) },
  );

  assert.deepEqual(events.map((event) => event.type), [
    'progress',
    'answer_delta',
    'answer_ready',
    'quality_ready',
    'final_result',
  ]);
  assert.equal((events.at(-1)?.result as { answer?: { text?: string } }).answer?.text, '最终回答');
});

test('rag session generation runner finishes after artifact_ready and queues background quality review', async () => {
  const ragResult = createMockRagResult();
  const artifact = createMockArtifact();
  const events: Array<Record<string, unknown>> = [];
  const seenVisualizationInputs: Array<Record<string, unknown>> = [];
  const enqueued: Array<{ type: string; input: Record<string, unknown> }> = [];
  const runners = createGenerationJobRunners({
    ragAsk: async (_input, options) => {
      options.onEvent?.({ type: 'answer_delta', delta: 'partial' });
      options.onEvent?.({ type: 'answer_ready', result: ragResult });
      return ragResult;
    },
    ragVisualization: async (input, options) => {
      seenVisualizationInputs.push(input as unknown as Record<string, unknown>);
      assert.equal(options.reviewerProfile, 'full');
      assert.equal(options.postPublishReviewMode, 'skip');
      options.emit?.({ type: 'artifact_ready', artifact, progress: 100 });
      return artifact;
    },
  });

  const result = await runners.rag_session_generation(
    {
      question: '斜抛运动最大高度怎么算？',
      subjectId: 'physics_mechanics',
      taskType: 'step_solution',
      source: 'student',
      retrieval: { useWebSearch: true },
      quality: { mode: 'highQuality' },
      visualization: { mode: 'auto' },
      clientSessionId: 'client_session_1',
    },
    {
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
      enqueueJob: async (type, input) => {
        enqueued.push({ type, input });
        return {
          id: 'job_quality_1',
          type,
          status: 'queued',
          inputSummary: {},
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        } satisfies GenerationJobSnapshot;
      },
    },
  );

  assert.ok(isRagSessionGenerationResult(result));
  assert.deepEqual(events.map((event) => event.type), [
    'answer_delta',
    'answer_ready',
    'artifact_ready',
    'artifact_quality_review_started',
    'final_result',
  ]);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].type, 'artifact_quality_review');
  assert.deepEqual(enqueued[0].input.artifact, artifact);
  assert.equal(seenVisualizationInputs.length, 1);
  assert.equal(seenVisualizationInputs[0].question, '斜抛运动最大高度怎么算？');
  assert.equal(seenVisualizationInputs[0].answerText, '最终回答');
  assert.equal(result.visualizationStatus, 'ready');
  assert.equal(result.qualityReviewStatus, 'queued');
  assert.equal(result.qualityReviewJobId, 'job_quality_1');
  assert.deepEqual(result.artifact, artifact);
});

test('rag session generation fast mode does not queue LLM quality review', async () => {
  const ragResult = createMockRagResult();
  const artifact = createMockArtifact();
  let enqueueCalls = 0;
  const runners = createGenerationJobRunners({
    ragAsk: async (_input, options) => {
      options.onEvent?.({ type: 'answer_ready', result: ragResult });
      return ragResult;
    },
    ragVisualization: async (_input, options) => {
      assert.equal(options.reviewerProfile, 'lightweight');
      assert.equal(options.postPublishReviewMode, 'skip');
      options.emit?.({ type: 'artifact_ready', artifact, progress: 100 });
      return artifact;
    },
  });

  const result = await runners.rag_session_generation(
    {
      question: '快速解释单调栈',
      quality: { mode: 'fast' },
      visualization: { mode: 'auto' },
    },
    {
      signal: new AbortController().signal,
      emit: () => undefined,
      enqueueJob: async () => {
        enqueueCalls += 1;
        throw new Error('fast mode should not enqueue review');
      },
    },
  );

  assert.ok(isRagSessionGenerationResult(result));
  assert.equal(enqueueCalls, 0);
  assert.equal(result.qualityReviewStatus, undefined);
});

test('rag session generation returns final quality decision that blocks rejected answer with excellent artifact', async () => {
  const ragResult = createMockRagResult({
    quality_report: {
      passed: false,
      score: 42,
      checks: [{ name: 'answer', passed: false, severity: 'critical', message: 'answer is incorrect' }],
      decision: 'reject',
    },
  });
  const artifact = createMockArtifact({
    qualityReport: {
      passed: true,
      finalScore: 96,
      level: 'excellent',
      summary: 'artifact excellent',
      strengths: ['runs well'],
      weaknesses: [],
      suggestions: [],
      evaluatorScores: {},
      status: 'reviewed',
    },
    finalScore: 96,
  });
  const runners = createGenerationJobRunners({
    ragAsk: async (_input, options) => {
      options.onEvent?.({ type: 'answer_ready', result: ragResult });
      return ragResult;
    },
    ragVisualization: async (_input, options) => {
      options.emit?.({ type: 'artifact_ready', artifact, progress: 100 });
      return artifact;
    },
  });

  const result = await runners.rag_session_generation(
    {
      question: 'answer reject but artifact excellent',
      quality: { mode: 'review' },
      visualization: { mode: 'auto' },
    },
    { signal: new AbortController().signal, emit: () => undefined },
  );

  assert.ok(isRagSessionGenerationResult(result));
  assert.equal(result.finalQualityDecision?.answerPassed, false);
  assert.equal(result.finalQualityDecision?.artifactPassed, true);
  assert.equal(result.finalQualityDecision?.overallPassed, false);
  assert.notEqual(result.finalQualityDecision?.decision, 'publish');
  assert.ok(result.finalQualityDecision?.blockingReasons.includes('answer_quality_failed'));
});

test('artifact quality review runner emits quality update and returns updated artifact', async () => {
  const artifact = createMockArtifact();
  const events: Array<Record<string, unknown>> = [];
  const runners = createGenerationJobRunners({
    ragArtifactQualityReview: async (input, options) => {
      assert.equal(input.artifact.id, artifact.id);
      options.emit?.({
        type: 'artifact_quality_updated',
        artifactId: artifact.id,
        qualityReport: {
          passed: true,
          finalScore: 93,
          level: 'excellent',
          summary: 'reviewed',
          strengths: ['ok'],
          weaknesses: [],
          suggestions: [],
          evaluatorScores: {},
          status: 'reviewed',
        },
        feedbackLoop: { passed: true, finalScore: 93, iterations: [], finalIssues: [] },
        finalScore: 93,
        changeLog: ['后台质量报告完成；HTML 未自动修改。'],
        progress: 95,
      });
      return {
        ...input.artifact,
        finalScore: 93,
        qualityReport: {
          passed: true,
          finalScore: 93,
          level: 'excellent',
          summary: 'reviewed',
          strengths: ['ok'],
          weaknesses: [],
          suggestions: [],
          evaluatorScores: {},
          status: 'reviewed',
        },
      } as InteractionArtifact;
    },
  });

  const result = await runners.artifact_quality_review(
    { artifact },
    { signal: new AbortController().signal, emit: (event) => events.push(event) },
  );

  assert.deepEqual(events.map((event) => event.type), [
    'artifact_quality_review_started',
    'artifact_quality_updated',
    'artifact_quality_review_completed',
  ]);
  assert.equal((result as InteractionArtifact).id, artifact.id);
  assert.equal((result as InteractionArtifact).finalScore, 93);
});

test('rag visualization and deep interaction runners pass the cancel signal to pipelines', async () => {
  const controller = new AbortController();
  const artifact = createMockArtifact();
  const seenSignals: AbortSignal[] = [];
  const events: Array<Record<string, unknown>> = [];
  const runners = createGenerationJobRunners({
    ragVisualization: async (_input, options) => {
      assert.ok(options.signal);
      seenSignals.push(options.signal);
      options.emit?.({ type: 'progress', stage: 'planning', message: 'ok', progress: 10 });
      options.emit?.({ type: 'artifact_ready', artifact, progress: 100 });
      return artifact;
    },
    deepInteraction: async (_input, emit, options) => {
      assert.ok(options.signal);
      seenSignals.push(options.signal);
      emit({ type: 'progress', stage: 'planning', message: 'ok', progress: 10 });
      emit({ type: 'artifact_ready', artifact, progress: 100 });
    },
  });

  await runners.rag_visualization(
    { question: '单调栈', subject: 'computer_science', taskType: 'step_solution', source: 'student' },
    { signal: controller.signal, emit: (event) => events.push(event) },
  );
  await runners.deep_interaction(
    { prompt: '斜抛运动', preferredType: 'simulation' },
    { signal: controller.signal, emit: (event) => events.push(event) },
  );

  assert.equal(seenSignals.length, 2);
  assert.ok(seenSignals.every((signal) => signal === controller.signal));
  assert.ok(events.some((event) => event.type === 'artifact_ready'));
});

test('rag visualization runner derives audit policy from quality mode only', async () => {
  const artifact = createMockArtifact();
  const seen: Array<{
    input: Record<string, unknown>;
    maxIterations?: number;
    allowRepair?: boolean;
    reviewerProfile?: string;
  }> = [];
  const runners = createGenerationJobRunners({
    ragVisualization: async (input, options) => {
      seen.push({
        input: input as unknown as Record<string, unknown>,
        maxIterations: options.maxIterations,
        allowRepair: options.allowRepair,
        reviewerProfile: options.reviewerProfile,
      });
      return artifact;
    },
  });

  await runners.rag_visualization(
    { question: 'fast', subject: 'physics', taskType: 'step_solution', source: 'student', quality: { mode: 'fast' }, auditMaxIterations: 5 },
    { signal: new AbortController().signal, emit: () => undefined },
  );
  await runners.rag_visualization(
    { question: 'review', subject: 'physics', taskType: 'step_solution', source: 'student', quality: { mode: 'review' } },
    { signal: new AbortController().signal, emit: () => undefined },
  );
  await runners.rag_visualization(
    { question: 'full', subject: 'physics', taskType: 'step_solution', source: 'student', quality: { mode: 'highQuality' } },
    { signal: new AbortController().signal, emit: () => undefined },
  );
  await runners.rag_visualization(
    { question: 'default', subject: 'physics', taskType: 'step_solution', source: 'student' },
    { signal: new AbortController().signal, emit: () => undefined },
  );

  assert.deepEqual(
    seen.map(({ maxIterations, allowRepair, reviewerProfile }) => ({ maxIterations, allowRepair, reviewerProfile })),
    [
      { maxIterations: 1, allowRepair: false, reviewerProfile: 'lightweight' },
      { maxIterations: 1, allowRepair: false, reviewerProfile: 'lightweight' },
      { maxIterations: 1, allowRepair: false, reviewerProfile: 'full' },
      { maxIterations: 1, allowRepair: false, reviewerProfile: 'lightweight' },
    ],
  );
  assert.equal('quality' in seen[0].input, false);
  assert.equal('auditMaxIterations' in seen[0].input, false);
});

test('rag visualization max iteration policy is not user-configurable', () => {
  assert.equal(resolveRagVisualizationMaxIterations('fast'), 1);
  assert.equal(resolveRagVisualizationMaxIterations('review'), 1);
  assert.equal(resolveRagVisualizationMaxIterations('highQuality'), 1);
  assert.equal(resolveRagVisualizationMaxIterations(undefined), 1);
  assert.deepEqual(resolveRagVisualizationModePolicy('fast'), {
    maxIterations: 1,
    allowRepair: false,
    reviewerProfile: 'lightweight',
  });
  assert.deepEqual(resolveRagVisualizationModePolicy('review'), {
    maxIterations: 1,
    allowRepair: false,
    reviewerProfile: 'lightweight',
  });
  assert.deepEqual(resolveRagVisualizationModePolicy('highQuality'), {
    maxIterations: 1,
    allowRepair: false,
    reviewerProfile: 'full',
  });
  assert.deepEqual(resolveRagVisualizationModePolicy(undefined), {
    maxIterations: 1,
    allowRepair: false,
    reviewerProfile: 'lightweight',
  });
});

function createMockRagResult(overrides: Partial<RagAskResult> = {}): RagAskResult {
  return {
    subject: 'physics_mechanics',
    subject_display_name: '大学物理力学',
    task_type: 'step_solution',
    answer_protocol: 'json',
    answer: '最终回答',
    answer_sections: [{ id: 'model', title: '模型', content: '最终回答 [L1]' }],
    formula_blocks: [],
    final_results: [],
    citations: [{
      source_type: 'local',
      source: 'projectile.md',
      chunk_id: 'chunk-1',
      subject: 'physics_mechanics',
      file_name: 'projectile.md',
    }],
    retrieved_chunks: [],
    source_summary: { local_count: 1, web_count: 0 },
    quality_report: { passed: true, score: 92, checks: [], decision: 'accept' },
    ...overrides,
  };
}

function createMockArtifact(overrides: Partial<InteractionArtifact> = {}): InteractionArtifact {
  return {
    id: 'artifact_1',
    sessionId: 'session_1',
    type: 'rag_visualization',
    title: 'Mock artifact',
    description: 'Mock artifact',
    status: 'ready',
    version: 1,
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    schema: {
      type: 'rag_visualization',
      title: 'Mock artifact',
      description: 'Mock artifact',
      learningGoals: [],
      explanationSteps: [],
      visualizationSpec: {
        type: 'interactive_html',
        title: 'Mock artifact',
        description: 'Mock artifact',
        html: '<!doctype html><html><body></body></html>',
        interactionType: 'custom',
        parameters: {},
      },
      htmlWidget: {
        html: '<!doctype html><html><body></body></html>',
        widgetType: 'rag_visualization',
        widgetConfig: { concept: 'mock', variables: [], defaultState: {}, messageTargets: [] },
        allowedMessageTypes: [],
      },
      ragMetadata: {
        source: 'student',
        subject: 'computer_science',
        originalQuestion: '单调栈',
        taskType: 'step_solution',
      },
    },
    ...overrides,
  };
}
