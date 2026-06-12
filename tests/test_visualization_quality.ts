import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInteractionArtifact } from '../src/features/deep-interaction/lib/validators';
import { createRagVisualizationArtifact } from '../src/features/rag/lib/visualization/artifactAdapter';
import { checkVisualizationSpec } from '../src/features/rag/lib/visualization/quality_checker';
import type { VisualizationSpec } from '../src/features/rag/lib/visualization/types';

test('valid function_graph passes', () => {
  const spec: VisualizationSpec = {
    type: 'function_graph',
    title: 'f(x) = xe^{-x^2}',
    description: '函数图像',
    expressions: [{ id: 'f1', label: 'f(x)', latex: 'xe^{-x^2}', evaluator: 'x * Math.exp(-x*x)' }],
    domain: { xMin: -3, xMax: 3 },
    pointsOfInterest: [{ x: 0, y: 0, label: '零点', type: 'intercept' }],
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, true);
});

test('function_graph with eval() in evaluator fails', () => {
  const spec: VisualizationSpec = {
    type: 'function_graph',
    title: 'test',
    description: 'test',
    expressions: [{ id: 'f1', label: 'f', latex: 'x', evaluator: 'eval("alert(1)")' }],
    domain: { xMin: -1, xMax: 1 },
    pointsOfInterest: [],
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((i) => i.includes('不安全')));
});

test('function_graph with xMin > xMax fails', () => {
  const spec: VisualizationSpec = {
    type: 'function_graph',
    title: 'test',
    description: 'test',
    expressions: [{ id: 'f1', label: 'f', latex: 'x', evaluator: 'x' }],
    domain: { xMin: 5, xMax: 2 },
    pointsOfInterest: [],
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, false);
});

test('valid force_diagram passes', () => {
  const spec: VisualizationSpec = {
    type: 'force_diagram',
    title: '斜面受力',
    description: '物体在斜面上的受力分析',
    scene: 'incline',
    objectLabel: '物体',
    angleDeg: 30,
    forces: [
      { id: 'f1', label: '重力', symbol: 'mg', magnitude: '98', angleDeg: 270, explanation: '重力' },
      { id: 'f2', label: '支持力', symbol: 'N', magnitude: '84.87', angleDeg: 60, explanation: '法向支持力' },
    ],
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, true);
});

test('force_diagram with no forces fails', () => {
  const spec: VisualizationSpec = {
    type: 'force_diagram',
    title: 'test',
    description: 'test',
    scene: 'free_body',
    objectLabel: 'obj',
    forces: [],
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, false);
});

test('valid algorithm_trace passes', () => {
  const spec: VisualizationSpec = {
    type: 'algorithm_trace',
    title: '单调栈',
    description: '单调栈过程',
    algorithmName: 'monotonic_stack',
    dataStructure: 'stack',
    inputExample: '[2,1,2,4,3]',
    steps: [
      { stepIndex: 1, operation: 'push', state: { stack: [2] }, explanation: '入栈 2' },
      { stepIndex: 2, operation: 'push', state: { stack: [2, 1] }, explanation: '入栈 1' },
    ],
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, true);
});

test('algorithm_trace with non-sequential steps warns', () => {
  const spec: VisualizationSpec = {
    type: 'algorithm_trace',
    title: 'test',
    description: 'test',
    algorithmName: 'test',
    dataStructure: 'stack',
    inputExample: '[]',
    steps: [
      { stepIndex: 1, operation: 'push', state: {}, explanation: 'step 1' },
      { stepIndex: 3, operation: 'pop', state: {}, explanation: 'step 3' },
    ],
  };
  const result = checkVisualizationSpec(spec);
  assert.ok(result.issues.some((i) => i.includes('不连续')));
});

test('algorithm_trace with placeholder input and only initialization fails', () => {
  const spec: VisualizationSpec = {
    type: 'algorithm_trace',
    title: '单调栈过程演示',
    description: 'stack 数据结构的操作过程',
    algorithmName: 'monotonic_stack',
    dataStructure: 'stack',
    inputExample: '[示例输入]',
    steps: [
      { stepIndex: 1, operation: '初始化', state: { stack: [], output: [] }, explanation: '初始化数据结构' },
    ],
  };

  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((i) => i.includes('具体输入示例')));
  assert.ok(result.issues.some((i) => i.includes('状态转移')));
});

test('artifact adapter output passes deep-interaction validator', () => {
  const spec: VisualizationSpec = {
    type: 'algorithm_trace',
    title: '单调栈',
    description: '用具体输入展示单调栈状态转移',
    algorithmName: 'monotonic_stack',
    dataStructure: 'stack',
    inputExample: '[2,1,2,4,3]',
    steps: [
      { stepIndex: 1, operation: '初始化', state: { stack: [], output: [-1, -1, -1, -1, -1] }, explanation: '初始化结果数组。' },
      { stepIndex: 2, operation: '读取 2', state: { stack: ['0:2'], output: [-1, -1, -1, -1, -1] }, explanation: '下标 0 入栈。' },
    ],
  };

  const artifact = createRagVisualizationArtifact({
    spec,
    source: 'student',
    subject: 'computer_science',
    originalQuestion: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    taskType: 'step_solution',
    now: '2026-05-31T00:00:00.000Z',
  });

  assert.doesNotThrow(() => validateInteractionArtifact(artifact));
});

test('valid projectile_motion passes', () => {
  const spec: VisualizationSpec = {
    type: 'projectile_motion',
    title: '斜抛',
    description: 'test',
    parameters: { v0: 20, angle_deg: 30, g: 9.8 },
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, true);
});

test('projectile_motion with negative v0 fails', () => {
  const spec: VisualizationSpec = {
    type: 'projectile_motion',
    title: 'test',
    description: 'test',
    parameters: { v0: -5, angle_deg: 30, g: 9.8 },
  };
  const result = checkVisualizationSpec(spec);
  assert.equal(result.passed, false);
});
