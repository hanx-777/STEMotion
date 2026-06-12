import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeRagVisualizationFailure,
  completeRagVisualizationSuccess,
  createRagVisualizationDraftResult,
  restoreRagVisualizationGenerationState,
  shouldStartRagVisualization,
} from '../src/features/rag/state/ragVisualizationFlow';
import type { InteractionArtifact } from '../src/features/deep-interaction/lib/types';
import type { RagAskResult } from '../src/features/rag/lib/types';

const baseResult: RagAskResult = {
  subject: 'physics_mechanics',
  subject_display_name: '大学物理力学',
  task_type: 'step_solution',
  answer: '先给出文字回答。',
  citations: [],
  retrieved_chunks: [],
  source_summary: { local_count: 0, web_count: 0 },
};

const artifact = {
  id: 'artifact_1',
  sessionId: 'session_1',
  type: 'rag_visualization',
  title: '平抛运动互动可视化',
  description: '围绕原题生成。',
  status: 'ready',
  version: 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  schema: {
    type: 'rag_visualization',
    title: '平抛运动互动可视化',
    description: '围绕原题生成。',
    learningGoals: ['理解平抛运动'],
    explanationSteps: [{ id: 'step_1', title: '观察', narration: '观察轨迹。' }],
    visualizationSpec: {
      type: 'interactive_html',
      title: '平抛运动互动可视化',
      description: '围绕原题生成。',
      html: '<!DOCTYPE html><html><body></body></html>',
      interactionType: 'physics_simulation',
      parameters: {},
    },
    ragMetadata: {
      source: 'student',
      subject: 'physics_mechanics',
      originalQuestion: '平抛运动怎么算？',
      taskType: 'step_solution',
    },
  },
} satisfies InteractionArtifact;

test('auto mode starts RAG visualization even when the legacy visualization spec is absent', () => {
  assert.equal(shouldStartRagVisualization({
    visualizationMode: 'auto',
    demoFallback: false,
  }), true);
});

test('off mode does not start visualization and stores a disabled terminal state', () => {
  assert.equal(shouldStartRagVisualization({
    visualizationMode: 'off',
    demoFallback: false,
  }), false);

  const draft = createRagVisualizationDraftResult(baseResult, {
    visualizationMode: 'off',
    now: '2026-06-01T00:00:00.000Z',
  });

  assert.equal(draft.visualization_status, 'disabled');
  assert.equal(draft.auto_saved_at, '2026-06-01T00:00:00.000Z');
});

test('artifact_ready marks result as ready and records final autosave metadata', () => {
  const draft = createRagVisualizationDraftResult(baseResult, {
    visualizationMode: 'auto',
    now: '2026-06-01T00:00:00.000Z',
  });
  const ready = completeRagVisualizationSuccess(draft, {
    artifact,
    now: '2026-06-01T00:01:00.000Z',
  });

  assert.equal(ready.visualization_status, 'ready');
  assert.equal(ready.visualization_artifact?.id, 'artifact_1');
  assert.equal(ready.auto_saved_at, '2026-06-01T00:01:00.000Z');
});

test('visualization errors are terminal autosaved session states', () => {
  const draft = createRagVisualizationDraftResult(baseResult, {
    visualizationMode: 'auto',
    now: '2026-06-01T00:00:00.000Z',
  });
  const failed = completeRagVisualizationFailure(draft, {
    error: 'planner confidence too low',
    now: '2026-06-01T00:02:00.000Z',
  });

  assert.equal(failed.visualization_status, 'failed');
  assert.equal(failed.visualization_error, 'planner confidence too low');
  assert.equal(failed.auto_saved_at, '2026-06-01T00:02:00.000Z');
});

test('restoring a session reconstructs ready or failed visualization UI state', () => {
  const ready = completeRagVisualizationSuccess(baseResult, {
    artifact,
    now: '2026-06-01T00:01:00.000Z',
  });
  const failed = completeRagVisualizationFailure(baseResult, {
    error: '审计未通过',
    now: '2026-06-01T00:02:00.000Z',
  });

  assert.deepEqual(restoreRagVisualizationGenerationState(ready), {
    status: 'ready',
    progress: 100,
    message: '已恢复互动可视化',
    logs: ['已恢复互动可视化'],
  });
  assert.deepEqual(restoreRagVisualizationGenerationState(failed), {
    status: 'error',
    progress: 100,
    message: '审计未通过',
    logs: ['审计未通过'],
  });
});

test('restoring an unfinished visualization does not leave an endless generating state', () => {
  const pending = createRagVisualizationDraftResult(baseResult, {
    visualizationMode: 'auto',
    now: '2026-06-01T00:00:00.000Z',
  });

  assert.deepEqual(restoreRagVisualizationGenerationState(pending), {
    status: 'error',
    progress: 100,
    message: '上次互动可视化生成被刷新或关闭中断，可重新生成。',
    logs: ['上次互动可视化生成被刷新或关闭中断，可重新生成。'],
  });
});
