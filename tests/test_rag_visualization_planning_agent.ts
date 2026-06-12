import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRagVisualizationPlanningPrompt,
  createRagVisualizationGenerationPlan,
} from '../src/features/rag/lib/visualization/planningAgent';

test('planning agent preserves original projectile variables and knowledge point', async () => {
  const plan = await createRagVisualizationGenerationPlan(
    {
      question: '一小球以 20m/s 水平抛出，2s 后水平位移和竖直位移分别是多少？',
      answerText: '平抛运动：x=v0 t=40m，y=1/2gt^2=19.6m。',
      subject: 'physics_mechanics',
      taskType: 'step_solution',
      formulaBlocks: [{ latex: 'x=v_0t', explanation: '水平匀速' }],
      finalResults: [
        { label: '水平位移', value: '40', unit: 'm' },
        { label: '竖直位移', value: '19.6', unit: 'm' },
      ],
    },
    {
      plannerModel: async () => JSON.stringify({
        shouldGenerate: true,
        problemRestatement: '一小球以 20m/s 水平抛出，观察 2s 后的水平位移和竖直位移。',
        knowledgePoint: '平抛运动',
        variables: [
          { name: 'v0', label: '水平初速度', value: '20', unit: 'm/s', role: 'given' },
          { name: 't', label: '时间', value: '2', unit: 's', role: 'given' },
        ],
        visualObjects: ['小球轨迹', '水平分运动', '竖直分运动'],
        controls: ['播放/暂停', '重置', '时间进度'],
        metrics: ['水平位移 x', '竖直位移 y'],
        animationRequirements: ['从 t=0 播放到 t=2s', '同步显示 x 和 y 的变化'],
        successCriteria: ['不出现角度 ?°', '显示 v0=20m/s 与 t=2s'],
        rightPanelNarration: [
          { title: '还原原题', narration: '先确认水平抛出，没有初始竖直速度。' },
          { title: '观察分解', narration: '水平匀速、竖直自由落体同步发生。' },
        ],
        recommendedType: 'interactive_html',
        confidence: 0.92,
      }),
    },
  );

  assert.equal(plan.shouldGenerate, true);
  assert.equal(plan.knowledgePoint, '平抛运动');
  assert.equal(plan.variables.some((item) => item.name === 'v0' && item.value === '20'), true);
  assert.equal(plan.variables.some((item) => item.name === 't' && item.value === '2'), true);
  assert.equal(plan.successCriteria.some((item) => item.includes('?°')), true);
});

test('planning prompt forbids changing the problem or inventing parameters', () => {
  const prompt = buildRagVisualizationPlanningPrompt({
    question: '用递归解释 fib(4) 的调用栈。',
    answerText: 'fib(4) 会展开到 fib(1) 和 fib(0)，再逐层回溯。',
    subject: 'computer_science',
    taskType: 'step_solution',
  });

  assert.match(prompt, /禁止改题/);
  assert.match(prompt, /不要编造参数/);
  assert.match(prompt, /unknown/);
  assert.match(prompt, /problemRestatement/);
  assert.match(prompt, /animationRequirements/);
  assert.match(prompt, /design intent|设计意图/i);
  assert.match(prompt, /STEMotion visual vocabulary/i);
  assert.match(prompt, /anti-filler/i);
  assert.match(prompt, /first-screen stage-first/i);
});
