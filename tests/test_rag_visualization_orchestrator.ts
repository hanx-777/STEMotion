import assert from 'node:assert/strict';
import test from 'node:test';
import { orchestrateRagVisualization } from '../src/features/rag/lib/visualization/orchestrator';
import { checkVisualizationSpec } from '../src/features/rag/lib/visualization/quality_checker';
import type { VisualizationSpec } from '../src/features/rag/lib/visualization/types';

test('repairs weak algorithm traces into spec context without exposing deterministic renderer as final engine', async () => {
  const weakSpec: VisualizationSpec = {
    type: 'algorithm_trace',
    title: '单调栈过程演示',
    description: 'stack 数据结构的操作过程',
    algorithmName: 'monotonic_stack',
    dataStructure: 'stack',
    inputExample: '[示例输入]',
    steps: [
      {
        stepIndex: 1,
        operation: '初始化',
        state: { stack: [], output: [] },
        explanation: '初始化数据结构',
      },
    ],
  };

  const result = await orchestrateRagVisualization({
    question: '用单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '使用单调栈维护还没有找到右侧更大值的下标。',
    subject: 'computer_science',
    taskType: 'step_solution',
    initialSpec: weakSpec,
    initialDecision: {
      shouldVisualize: true,
      visualizationType: 'algorithm_trace',
      confidence: 0.92,
      reason: '检测到单调栈算法过程',
      extractedParameters: {},
    },
  });

  assert.ok(result.spec);
  assert.equal(result.spec.type, 'algorithm_trace');
  if (result.spec.type === 'algorithm_trace') {
    assert.equal(result.spec.inputExample, '[2,1,2,4,3]');
    assert.ok(result.spec.steps.length > 5);
    assert.ok(result.spec.steps.some((step) => step.operation.includes('弹出')));
  }
  assert.equal(checkVisualizationSpec(result.spec).passed, true);
  assert.equal(result.plan.engine, 'spec_context');
  assert.equal(result.plan.repaired, true);
  assert.match(result.plan.reason, /context|上下文|修复|补全|fallback/i);
});

test('falls back to interactive html when deterministic spec cannot satisfy quality gate', async () => {
  const result = await orchestrateRagVisualization({
    question: '请做一个自定义动态演示，说明生态系统中能量如何沿食物链流动',
    answerText: '能量从生产者开始，沿消费者层级逐级传递并逐步损耗。',
    subject: 'biology',
    taskType: 'knowledge_qa',
    initialDecision: {
      shouldVisualize: true,
      visualizationType: 'interactive_html',
      confidence: 0.81,
      reason: '需要自定义交互演示',
      extractedParameters: { topic: 'energy_flow' },
    },
    htmlGenerator: async () => '<!DOCTYPE html><html><head><title>能量流动</title></head><body><main>生态系统能量流动演示</main><script>window.__ready=true;</script></body></html>',
  });

  assert.ok(result.spec);
  assert.equal(result.spec.type, 'interactive_html');
  assert.equal(result.plan.engine, 'interactive_html_agent');
  assert.equal(result.plan.repaired, false);
  assert.match(result.plan.reason, /交互|自定义|HTML/i);
});
