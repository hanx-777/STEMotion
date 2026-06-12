import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompactVisualizationSpecContext,
  formatCompactVisualizationSpecContext,
} from '../src/features/rag/lib/visualization/specContext';
import type { VisualizationSpec } from '../src/features/rag/lib/visualization/types';

test('compact spec context keeps fidelity anchors without dumping long algorithm traces', () => {
  const spec: VisualizationSpec = {
    type: 'algorithm_trace',
    title: '单调栈下一个更大元素',
    description: '展示原题输入的栈状态变化。',
    knowledgePoint: '单调栈',
    algorithmName: 'next_greater_element',
    dataStructure: 'stack',
    inputExample: '[2,1,2,4,3]',
    variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
    steps: Array.from({ length: 18 }, (_, index) => ({
      stepIndex: index,
      operation: index === 0 ? '初始化输出数组' : `TRACE_STEP_${index}`,
      explanation: `第 ${index} 步说明 SHOULD_NOT_DUMP_FULL_STEP_${index}`,
      state: {
        stack: [`stack-${index}`],
        output: [-1, -1, -1, -1, -1],
        hiddenVerboseState: `VERBOSE_STATE_${index}`,
      },
      highlight: ['stack', 'output'],
    })),
  };

  const context = buildCompactVisualizationSpecContext(spec);
  assert.ok(context);
  const formatted = formatCompactVisualizationSpecContext(context);

  assert.equal(context.type, 'algorithm_trace');
  assert.equal(context.title, '单调栈下一个更大元素');
  assert.equal(context.algorithmName, 'next_greater_element');
  assert.equal(context.inputExample, '[2,1,2,4,3]');
  assert.equal(context.stepCount, 18);
  assert.ok((context.sampleSteps?.length ?? 0) <= 4);
  assert.ok((context.omittedStepCount ?? 0) > 0);
  assert.match(formatted, /next_greater_element/);
  assert.match(formatted, /\[2,1,2,4,3\]/);
  assert.doesNotMatch(formatted, /SHOULD_NOT_DUMP_FULL_STEP_10/);
  assert.doesNotMatch(formatted, /VERBOSE_STATE_10/);
});

test('compact spec context preserves problem-specific physics parameters', () => {
  const spec: VisualizationSpec = {
    type: 'projectile_motion',
    title: '斜抛运动',
    description: '观察角度变化对轨迹的影响。',
    contextTitle: '斜抛运动',
    knowledgePoint: '抛体运动',
    variables: [
      { name: 'v0', label: '初速度', value: '20', unit: 'm/s', role: 'given' },
      { name: 'theta', label: '角度', value: '30', unit: '°', role: 'controlled' },
    ],
    parameters: { v0: 20, angle_deg: 30, g: 9.8 },
  };

  const formatted = formatCompactVisualizationSpecContext(buildCompactVisualizationSpecContext(spec));

  assert.match(formatted, /projectile_motion/);
  assert.match(formatted, /初速度/);
  assert.match(formatted, /angle_deg/);
  assert.match(formatted, /9.8/);
});
