import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVisualizationSpec } from '../src/lib/rag/visualization/quality_checker';
import type { VisualizationSpec } from '../src/lib/rag/visualization/types';

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
