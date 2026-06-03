import assert from 'node:assert/strict';
import test from 'node:test';
import { generateVisualizationSpec } from '../src/lib/rag/visualization/spec_generator';
import type { VisualizationDecision } from '../src/lib/rag/visualization/types';

test('generates projectile_motion spec from decision', async () => {
  const decision: VisualizationDecision = {
    shouldVisualize: true,
    visualizationType: 'projectile_motion',
    confidence: 0.9,
    reason: 'test',
    extractedParameters: { v0: 20, angle_deg: 30, g: 9.8 },
  };
  const spec = await generateVisualizationSpec({ decision, question: '斜抛问题' });
  assert.ok(spec);
  assert.equal(spec.type, 'projectile_motion');
  if (spec.type === 'projectile_motion') {
    assert.equal(spec.parameters.v0, 20);
    assert.equal(spec.parameters.angle_deg, 30);
  }
});

test('returns undefined when shouldVisualize is false', async () => {
  const decision: VisualizationDecision = {
    shouldVisualize: false,
    confidence: 0.8,
    reason: '不需要',
    extractedParameters: {},
  };
  const spec = await generateVisualizationSpec({ decision, question: '导数定义' });
  assert.equal(spec, undefined);
});

test('generates function_graph spec for f(x) expression', async () => {
  const decision: VisualizationDecision = {
    shouldVisualize: true,
    visualizationType: 'function_graph',
    confidence: 0.7,
    reason: 'test',
    extractedParameters: {},
  };
  const spec = await generateVisualizationSpec({
    decision,
    question: '分析函数 f(x)=xe^{-x^2} 的单调性',
  });
  assert.ok(spec);
  assert.equal(spec.type, 'function_graph');
  if (spec.type === 'function_graph') {
    assert.ok(spec.expressions.length > 0);
    assert.ok(spec.expressions[0].evaluator.includes('Math.exp'));
  }
});

test('generates force_diagram spec for incline question', async () => {
  const decision: VisualizationDecision = {
    shouldVisualize: true,
    visualizationType: 'force_diagram',
    confidence: 0.7,
    reason: 'test',
    extractedParameters: {},
  };
  const spec = await generateVisualizationSpec({
    decision,
    question: '物体放在 30° 斜面上，分析受力',
  });
  assert.ok(spec);
  assert.equal(spec.type, 'force_diagram');
  if (spec.type === 'force_diagram') {
    assert.equal(spec.scene, 'incline');
    assert.ok(spec.forces.length >= 2);
  }
});

test('generates algorithm_trace spec for stack question', async () => {
  const decision: VisualizationDecision = {
    shouldVisualize: true,
    visualizationType: 'algorithm_trace',
    confidence: 0.7,
    reason: 'test',
    extractedParameters: {},
  };
  const spec = await generateVisualizationSpec({
    decision,
    question: '用单调栈求下一个更大元素，输入 [2,1,2,4,3]',
  });
  assert.ok(spec);
  assert.equal(spec.type, 'algorithm_trace');
  if (spec.type === 'algorithm_trace') {
    assert.equal(spec.dataStructure, 'stack');
    assert.equal(spec.inputExample, '[2,1,2,4,3]');
    assert.ok(spec.steps.length > 5);
    assert.ok(spec.steps.some((step) => step.operation.includes('弹出')));
    assert.deepEqual(spec.steps.at(-1)?.state.output, [4, 2, 4, -1, -1]);
  }
});

test('generates concrete monotonic stack trace even when the prompt omits input', async () => {
  const decision: VisualizationDecision = {
    shouldVisualize: true,
    visualizationType: 'algorithm_trace',
    confidence: 0.7,
    reason: 'test',
    extractedParameters: {},
  };
  const spec = await generateVisualizationSpec({
    decision,
    question: '解释单调栈如何求下一个更大元素',
  });

  assert.ok(spec);
  assert.equal(spec.type, 'algorithm_trace');
  if (spec.type === 'algorithm_trace') {
    assert.equal(spec.inputExample, '[2,1,2,4,3]');
    assert.ok(!spec.inputExample.includes('示例输入'));
    assert.ok(spec.steps.length > 5);
  }
});
