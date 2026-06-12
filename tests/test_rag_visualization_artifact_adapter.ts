import assert from 'node:assert/strict';
import test from 'node:test';
import { createRagVisualizationArtifact } from '../src/features/rag/lib/visualization/artifactAdapter';
import { validateInteractionArtifact } from '../src/features/deep-interaction/lib/validators';

test('creates a complete rag_visualization artifact from algorithm trace spec', () => {
  const artifact = createRagVisualizationArtifact({
    spec: {
      type: 'algorithm_trace',
      title: '单调栈：下一个更大元素',
      description: '逐步展示单调栈状态变化。',
      algorithmName: 'monotonic_stack_next_greater',
      dataStructure: 'stack',
      inputExample: '[2,1,2,4,3]',
      steps: [
        {
          stepIndex: 1,
          operation: '初始化',
          state: { stack: [], output: [-1, -1, -1, -1, -1] },
          explanation: '初始化栈和结果数组。',
        },
        {
          stepIndex: 2,
          operation: '读取 2',
          state: { stack: ['0:2'], output: [-1, -1, -1, -1, -1] },
          explanation: '下标 0 入栈。',
        },
      ],
    },
    source: 'student',
    subject: 'computer_science',
    originalQuestion: '用单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    taskType: 'step_solution',
    qualityReport: {
      passed: true,
      score: 92,
      checks: [{ name: '可视化质量', passed: true, severity: 'info', message: 'ok' }],
    },
    now: '2026-05-31T00:00:00.000Z',
  });

  assert.equal(artifact.type, 'rag_visualization');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.equal(artifact.schema.learningGoals.length > 0, true);
  assert.equal(artifact.schema.explanationSteps.length >= 2, true);
  assert.equal(artifact.schema.ragMetadata.originalQuestion.includes('单调栈'), true);
  assert.equal(artifact.qualityReport?.passed, true);
  assert.doesNotThrow(() => validateInteractionArtifact(artifact));
});

test('validator accepts projectile rag_visualization artifacts', () => {
  const artifact = createRagVisualizationArtifact({
    spec: {
      type: 'projectile_motion',
      title: '抛体运动轨迹',
      description: 'v0=20m/s, theta=30deg',
      parameters: { v0: 20, angle_deg: 30, g: 9.8 },
    },
    source: 'student',
    subject: 'physics_mechanics',
    originalQuestion: '斜抛运动最大高度怎么算？',
    taskType: 'step_solution',
    now: '2026-05-31T00:00:00.000Z',
  });

  assert.doesNotThrow(() => validateInteractionArtifact(artifact));
});
