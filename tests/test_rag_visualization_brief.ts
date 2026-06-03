import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInteractionArtifact } from '../src/lib/deep-interaction/validators';
import { createRagVisualizationArtifact } from '../src/lib/rag/visualization/artifactAdapter';
import { createRagVisualizationBrief } from '../src/lib/rag/visualization/briefAgent';
import { buildHtmlGenerationPrompt } from '../src/lib/rag/visualization/htmlGenerator';
import { orchestrateRagVisualization } from '../src/lib/rag/visualization/orchestrator';
import { checkVisualizationSpec } from '../src/lib/rag/visualization/quality_checker';
import { compileSafeFunctionExpression } from '../src/lib/rag/visualization/safe_expression';

test('brief restores horizontal projectile question context without inventing an angle', async () => {
  const result = await orchestrateRagVisualization({
    question: '一辆车以20m/s做平抛运动，求2s后位置并画出轨迹',
    answerText: '水平方向 x=v0t=40m，竖直方向 y=1/2gt^2=19.6m。',
    subject: 'physics_mechanics',
    taskType: 'step_solution',
  });

  assert.equal(result.spec?.type, 'projectile_motion');
  if (result.spec?.type === 'projectile_motion') {
    assert.equal(result.spec.knowledgePoint, '平抛运动');
    assert.equal(result.spec.parameters.v0, 20);
    assert.equal(result.spec.parameters.time_s, 2);
    assert.equal(result.spec.parameters.angle_deg, undefined);
    assert.equal(result.spec.description.includes('?'), false);
    assert.ok(result.spec.variables?.some((variable) => variable.name === 't' && variable.value === '2'));
  }
});

test('function graph spec is grounded in the original function and remains safely renderable', async () => {
  const result = await orchestrateRagVisualization({
    question: '分析函数 f(x)=xe^{-x^2} 的单调性和极值',
    answerText: "通过求导 f'(x)=e^{-x^2}(1-2x^2)，临界点为 x=±1/√2。",
    subject: 'math',
    taskType: 'step_solution',
  });

  assert.equal(result.spec?.type, 'function_graph');
  if (result.spec?.type === 'function_graph') {
    assert.equal(result.spec.knowledgePoint, '函数单调性与极值');
    assert.equal(result.spec.expressions[0].latex, 'xe^{-x^2}');
    assert.equal(compileSafeFunctionExpression(result.spec.expressions[0].evaluator).ok, true);
    assert.ok(result.spec.pointsOfInterest.length >= 2);
    assert.ok(result.spec.intervals?.length);
    assert.equal(checkVisualizationSpec(result.spec).passed, true);
  }
});

test('recursion call stack becomes a recursion trace rather than generic stack pushes', async () => {
  const result = await orchestrateRagVisualization({
    question: '请解释递归调用栈如何展开和回溯',
    answerText: '递归先不断压入调用帧，到达边界条件后逐层返回。',
    subject: 'computer_science',
    taskType: 'knowledge_qa',
  });

  assert.equal(result.spec?.type, 'algorithm_trace');
  if (result.spec?.type === 'algorithm_trace') {
    assert.equal(result.spec.knowledgePoint, '递归调用栈');
    assert.notEqual(result.spec.inputExample, '[2,1,2,4,3]');
    assert.ok(result.spec.steps.some((step) => /调用|展开/.test(step.operation)));
    assert.ok(result.spec.steps.some((step) => /返回|回溯/.test(step.operation)));
    assert.equal(checkVisualizationSpec(result.spec).passed, true);
  }
});

test('artifact adapter preserves brief context for saved RAG visualizations', () => {
  const brief = createRagVisualizationBrief({
    question: '用单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '维护下标栈，遇到更大元素时弹出并填写答案。',
    subject: 'computer_science',
    taskType: 'step_solution',
    recommendedType: 'algorithm_trace',
  });
  const artifact = createRagVisualizationArtifact({
    spec: {
      type: 'algorithm_trace',
      title: '单调栈：下一个更大元素',
      description: '用原题输入逐步演示单调栈状态变化。',
      knowledgePoint: brief.knowledgePoint,
      scenario: brief.scenario,
      visualGoal: brief.visualGoal,
      variables: brief.variables,
      brief,
      algorithmName: 'monotonic_stack_next_greater',
      dataStructure: 'stack',
      inputExample: '[2,1,2,4,3]',
      steps: [
        { stepIndex: 1, operation: '初始化', state: { stack: [], output: [-1, -1, -1, -1, -1] }, explanation: '初始化栈和结果数组。' },
        { stepIndex: 2, operation: '读取 2', state: { stack: ['0:2'], output: [-1, -1, -1, -1, -1] }, explanation: '下标 0 入栈。' },
      ],
    },
    source: 'student',
    subject: 'computer_science',
    originalQuestion: brief.originalQuestion,
    taskType: 'step_solution',
    now: '2026-05-31T00:00:00.000Z',
  });

  assert.equal(artifact.schema.type, 'rag_visualization');
  if (artifact.schema.type === 'rag_visualization') {
    assert.equal(artifact.schema.brief?.knowledgePoint, '单调栈');
    assert.equal(artifact.schema.brief?.originalQuestion.includes('单调栈'), true);
    assert.ok(artifact.schema.learningGoals.some((goal) => goal.includes('单调栈')));
  }
  assert.doesNotThrow(() => validateInteractionArtifact(artifact));
});

test('HTML generation prompt is constrained by original question and brief', () => {
  const brief = createRagVisualizationBrief({
    question: '请解释递归调用栈如何展开和回溯',
    answerText: '递归先不断压栈，到达边界条件后逐层返回。',
    subject: 'computer_science',
    taskType: 'knowledge_qa',
    recommendedType: 'interactive_html',
  });
  const prompt = buildHtmlGenerationPrompt({
    question: brief.originalQuestion,
    answerText: '递归先不断压栈，到达边界条件后逐层返回。',
    visualizationType: 'interactive_html',
    extractedParameters: {},
    brief,
  });

  assert.match(prompt, /原题/);
  assert.match(prompt, /递归调用栈/);
  assert.match(prompt, /mustShow/);
  assert.match(prompt, /avoidGenericDemo/);
  assert.match(prompt, /不要生成脱离原题/);
});
