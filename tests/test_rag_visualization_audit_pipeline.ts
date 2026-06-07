import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { AgentEvaluation } from '../src/lib/deep-interaction/types';
import {
  RAG_WIDGET_HTML_SYSTEM_PROMPT,
  buildRagWidgetHtmlPrompt,
  runRagVisualizationAuditPipeline,
} from '../src/lib/rag/visualization/auditPipeline';
import {
  diagnoseRagWidgetContract,
  ensureRagWidgetContractHtml,
} from '../src/lib/rag/visualization/widgetContract';
import { validateInteractiveHtml } from '../src/lib/generation/htmlSafety';
import { evaluateRuntime } from '../src/lib/deep-interaction/agents/runtimeEvaluator';
import { ARTIFACT_DESIGN_CONTRACT_MARKER } from '../src/lib/generation/artifactDesignContract';
import { DESIGN_REVIEW_RUBRIC_MARKER } from '../src/lib/deep-interaction/agents/designReviewRubric';

const ROOT = process.cwd();

const safeHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>单调栈互动演示</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
    main { display: grid; gap: 16px; padding: 16px; }
    #visualization { min-height: 280px; border: 1px solid #cbd5e1; border-radius: 10px; background: white; }
    #controls, #metrics { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    button, input { min-height: 44px; }
  </style>
</head>
<body>
  <main>
    <section id="visualization" data-role="simulation-main">
      <svg id="stage" viewBox="0 0 420 220" width="100%" height="260" aria-label="单调栈状态">
        <rect id="bar-0" x="50" y="120" width="42" height="50" fill="#14b8a6"></rect>
        <rect id="bar-1" x="105" y="145" width="42" height="25" fill="#0ea5e9"></rect>
      </svg>
    </section>
    <section id="controls" data-role="control-panel">
      <button id="start-btn" type="button">开始</button>
      <button id="reset-btn" type="button">重置</button>
      <label>速度 <input id="speed" data-var="speed" type="range" min="1" max="5" step="1" value="2"></label>
    </section>
    <section id="metrics" data-role="observation-panel">当前步骤：<span id="step-value">0</span></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"单调栈","variables":[{"name":"speed","label":"速度","default":2}],"defaultState":{"speed":2,"running":false},"messageTargets":[{"id":"#visualization","purpose":"主舞台"},{"id":"#controls","purpose":"控制区"},{"id":"#metrics","purpose":"指标区"}]}</script>
  <script>
    const state = { speed: 2, running: false, step: 0 };
    const stepValue = document.getElementById('step-value');
    function draw() {
      stepValue.textContent = String(state.step);
      document.getElementById('bar-0').setAttribute('opacity', state.running ? '1' : '0.65');
    }
    function update() { draw(); }
    document.getElementById('speed').addEventListener('input', function (event) {
      state.speed = Number(event.target.value);
      update();
    });
    document.getElementById('start-btn').addEventListener('click', function () {
      state.running = !state.running;
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'start' }, '*');
      update();
    });
    document.getElementById('reset-btn').addEventListener('click', function () {
      state.running = false;
      state.step = 0;
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'reset' }, '*');
      update();
    });
    window.addEventListener('error', function (event) {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_ERROR', message: String(event.message) }, '*');
    });
    window.addEventListener('message', function (event) {
      const data = event.data || {};
      if (data.type === 'PING') window.parent.postMessage({ type: 'WIDGET_PONG' }, '*');
      if (data.type === 'SET_WIDGET_STATE' && data.state) Object.assign(state, data.state);
      if (data.type === 'HIGHLIGHT_ELEMENT') document.querySelector(data.target || '#visualization')?.setAttribute('data-highlighted', 'true');
      if (data.type === 'ANNOTATE_ELEMENT') document.querySelector(data.target || '#metrics')?.setAttribute('data-note', data.content || '');
      if (data.type === 'REVEAL_ELEMENT') document.querySelector(data.target || '#visualization')?.removeAttribute('hidden');
      update();
    });
    function animate() {
      if (state.running) state.step = (state.step + 1) % 5;
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_REPORT', state }, '*');
      update();
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
    window.parent.postMessage({ type: 'WIDGET_READY', state }, '*');
  </script>
</body>
</html>`;

const unsafeHtml = `<!DOCTYPE html><html><body><div id="visualization">泛化说明</div></body></html>`;

const weakButSafeHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>弱互动页</title></head>
<body>
  <main>
    <section id="visualization"><svg id="stage" viewBox="0 0 100 80"><circle cx="30" cy="40" r="12"></circle></svg></section>
    <section id="controls">
      <button id="start-btn" type="button">开始</button>
      <button id="reset-btn" type="button">重置</button>
      <label>速度 <input id="speed" type="range" min="1" max="5" value="2"></label>
    </section>
    <section id="metrics">速度：<span id="speed-value">2</span></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"单调栈","variables":[{"name":"speed","label":"速度","default":2}],"defaultState":{"speed":2},"messageTargets":[{"id":"#visualization","purpose":"主舞台"}]}</script>
  <script>
    const state = { speed: 2, running: false };
    function draw() { document.getElementById('speed-value').textContent = String(state.speed); }
    function update() { draw(); }
    function animate() { update(); requestAnimationFrame(animate); }
    requestAnimationFrame(animate);
  </script>
</body>
</html>`;

function passedEval(agentName: string): AgentEvaluation {
  return {
    agentName,
    score: 92,
    passed: true,
    summary: `${agentName} passed`,
    issues: [],
  };
}

test('RAG widget HTML prompt requires deep-interaction widget contract', () => {
  const prompt = buildRagWidgetHtmlPrompt({
    question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '用栈保存待解决下标。',
    plan: {
      shouldGenerate: true,
      problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      knowledgePoint: '单调栈',
      variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
      visualObjects: ['数组条形图', '栈容器', '输出数组'],
      controls: ['start', 'reset'],
      metrics: ['当前下标', '输出数组'],
      animationRequirements: ['逐步读取元素', '弹出时高亮'],
      successCriteria: ['展示弹出条件'],
      rightPanelNarration: [],
      recommendedType: 'interactive_html',
      confidence: 0.9,
    },
  });

  assert.match(prompt, /widget-config/);
  assert.match(prompt, /id="visualization"/);
  assert.match(prompt, /id="controls"/);
  assert.match(prompt, /id="metrics"/);
  assert.match(prompt, /id="start-btn"/);
  assert.match(prompt, /id="reset-btn"/);
  assert.match(prompt, /requestAnimationFrame/);
  assert.match(prompt, /animationRequirements/);
  assert.match(prompt, /WIDGET_RUNTIME_REPORT/);
  assert.match(prompt, /WIDGET_RUNTIME_ERROR/);
  assert.match(prompt, /WIDGET_PONG/);
  assert.match(prompt, /WIDGET_ACTION_ACK/);
  assert.match(prompt, /function update/);
  assert.match(prompt, /function draw/);
  assert.match(prompt, /function animate/);
  assert.match(prompt, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER));
  assert.match(prompt, /STEMOTION_RAG_VISUALIZATION_DESIGN_CONTEXT/);
  assert.match(prompt, /design context/i);
  assert.match(prompt, /STEMotion visual vocabulary/i);
  assert.match(prompt, /anti-filler/i);
  assert.match(prompt, /first-screen stage-first/i);
  assert.match(prompt, /problem-specific interaction/i);
  assert.match(RAG_WIDGET_HTML_SYSTEM_PROMPT, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER));
  assert.match(RAG_WIDGET_HTML_SYSTEM_PROMPT, /STEMOTION_RAG_VISUALIZATION_DESIGN_CONTEXT/);
});

test('RAG visualization audit reuses the shared design-quality reviewer chain', () => {
  const auditSource = readFileSync(join(ROOT, 'src/lib/rag/visualization/auditPipeline.ts'), 'utf8');
  const uxEvaluatorSource = readFileSync(join(ROOT, 'src/lib/deep-interaction/agents/uxEvaluatorAgent.ts'), 'utf8');
  const judgeSource = readFileSync(join(ROOT, 'src/lib/deep-interaction/agents/judgeAgent.ts'), 'utf8');
  const repairSource = readFileSync(join(ROOT, 'src/lib/deep-interaction/agents/repairAgent.ts'), 'utf8');

  assert.match(auditSource, /evaluateUX/);
  assert.match(auditSource, /judgeEvaluations/);
  assert.match(auditSource, /repairArtifact/);
  assert.match(uxEvaluatorSource, /designReviewRubricPrompt/);
  assert.match(DESIGN_REVIEW_RUBRIC_MARKER, /STEMOTION_DESIGN_REVIEW_RUBRIC/);
  assert.match(judgeSource, /collectDesignQualityBlockers/);
  assert.match(repairSource, /designRepairPrompt/);
});

test('widget contract diagnostics detect and patch missing runtime protocol', () => {
  const diagnostic = diagnoseRagWidgetContract(weakButSafeHtml);
  assert.equal(diagnostic.passed, false);
  assert.ok(diagnostic.missing.includes('WIDGET_READY'));
  assert.ok(diagnostic.missing.includes('WIDGET_RUNTIME_REPORT'));
  assert.ok(diagnostic.missing.includes('WIDGET_PONG'));
  assert.ok(diagnostic.missing.includes('WIDGET_ACTION_ACK'));
  assert.ok(diagnostic.missing.includes('range input listener'));

  const patched = ensureRagWidgetContractHtml(weakButSafeHtml);
  assert.equal(validateInteractiveHtml(patched).ok, true);
  assert.equal(evaluateRuntime(patched).passed, true);
  assert.equal(diagnoseRagWidgetContract(patched).passed, true);
});

test('widget contract patch inserts missing reset button inside the controls section', () => {
  const controlsMissingReset = `<!DOCTYPE html>
<html lang="zh-CN">
<body>
  <main>
    <section id="visualization"><svg viewBox="0 0 100 80"><circle cx="30" cy="40" r="12"></circle></svg></section>
    <section id="controls"><button id="start-btn" type="button">开始</button></section>
    <section id="metrics">状态</section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"测试","variables":[],"defaultState":{"running":false},"messageTargets":[]}</script>
</body>
</html>`;

  const patched = ensureRagWidgetContractHtml(controlsMissingReset);
  const controlsMatch = patched.match(/<section[^>]*id=["']controls["'][^>]*>([\s\S]*?)<\/section>/i);
  const visualizationMatch = patched.match(/<section[^>]*id=["']visualization["'][^>]*>([\s\S]*?)<\/section>/i);
  const metricsMatch = patched.match(/<section[^>]*id=["']metrics["'][^>]*>([\s\S]*?)<\/section>/i);

  assert.ok(controlsMatch?.[1].includes('id="reset-btn"'), 'reset button should be inserted into #controls');
  assert.equal(visualizationMatch?.[1].includes('id="reset-btn"'), false);
  assert.equal(metricsMatch?.[1].includes('id="reset-btn"'), false);
});

test('widget contract patch injects fallback canvas drawing operations', () => {
  const canvasWithoutDrawing = `<!DOCTYPE html>
<html lang="zh-CN">
<body>
  <main>
    <section id="visualization"><canvas id="stage" width="320" height="180"></canvas></section>
    <section id="controls"><button id="start-btn" type="button">开始</button><button id="reset-btn" type="button">重置</button></section>
    <section id="metrics">状态</section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"测试","variables":[],"defaultState":{"running":false},"messageTargets":[]}</script>
  <script>
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    function update() {}
    window.addEventListener('message', function () {});
    window.addEventListener('error', function () {});
    requestAnimationFrame(function tick(){ requestAnimationFrame(tick); });
  </script>
</body>
</html>`;

  const diagnostic = diagnoseRagWidgetContract(canvasWithoutDrawing);
  assert.equal(diagnostic.passed, false);
  assert.ok(diagnostic.missing.includes('canvas drawing operations'));

  const patched = ensureRagWidgetContractHtml(canvasWithoutDrawing);
  assert.equal(validateInteractiveHtml(patched).ok, true);
  assert.equal(diagnoseRagWidgetContract(patched).passed, true);
  assert.match(patched, /data-rag-canvas-fallback/);
});

test('audit pipeline patches weak safe HTML into a ready artifact without relying on LLM repair', async () => {
  const artifact = await runRagVisualizationAuditPipeline(
    {
      question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      answerText: '用栈保存还没有找到右侧更大元素的下标。',
      subject: 'computer_science',
      taskType: 'step_solution',
      source: 'student',
      now: '2026-05-31T00:00:00.000Z',
    },
    {
      plannerModel: async () => JSON.stringify({
        shouldGenerate: true,
        problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
        knowledgePoint: '单调栈',
        variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
        visualObjects: ['数组条形图', '栈容器', '输出数组'],
        controls: ['开始', '重置', '逐步播放'],
        metrics: ['当前下标', '栈内容', '输出数组'],
        animationRequirements: ['读取元素时移动指针', '弹出栈顶时高亮'],
        successCriteria: ['完整展示弹出和写入 output 的步骤'],
        rightPanelNarration: [{ title: '观察弹出条件', narration: '当当前元素更大时弹出栈顶下标。' }],
        recommendedType: 'interactive_html',
        confidence: 0.93,
      }),
      htmlGenerator: async () => weakButSafeHtml,
      repairer: async () => {
        throw new Error('repair should not be needed for runtime protocol patch');
      },
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => passedEval('UX Evaluator'),
      maxIterations: 1,
    },
  );

  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.ok(artifact.schema.htmlWidget?.html.includes('WIDGET_RUNTIME_REPORT'));
  assert.ok(artifact.schema.htmlWidget?.html.includes('WIDGET_PONG'));
  assert.ok(artifact.schema.htmlWidget?.html.includes('WIDGET_ACTION_ACK'));
});

test('audit pipeline repairs failed HTML and returns ready rag visualization artifact', async () => {
  const artifact = await runRagVisualizationAuditPipeline(
    {
      question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      answerText: '用栈保存还没有找到右侧更大元素的下标。',
      subject: 'computer_science',
      taskType: 'step_solution',
      source: 'student',
      now: '2026-05-31T00:00:00.000Z',
    },
    {
      plannerModel: async () => JSON.stringify({
        shouldGenerate: true,
        problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
        knowledgePoint: '单调栈',
        variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
        visualObjects: ['数组条形图', '栈容器', '输出数组'],
        controls: ['开始', '重置', '逐步播放'],
        metrics: ['当前下标', '栈内容', '输出数组'],
        animationRequirements: ['读取元素时移动指针', '弹出栈顶时高亮'],
        successCriteria: ['完整展示弹出和写入 output 的步骤'],
        rightPanelNarration: [{ title: '观察弹出条件', narration: '当当前元素更大时弹出栈顶下标。' }],
        recommendedType: 'interactive_html',
        confidence: 0.93,
      }),
      htmlGenerator: async () => unsafeHtml,
      repairer: async () => safeHtml,
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => passedEval('UX Evaluator'),
      maxIterations: 2,
    },
  );

  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.type, 'rag_visualization');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.ok(artifact.schema.htmlWidget?.html.includes('WIDGET_READY'));
  assert.equal(artifact.schema.visualizationPlan?.knowledgePoint, '单调栈');
  assert.equal(artifact.feedbackLoop?.iterations.length, 2);
  assert.equal(artifact.qualityReport?.passed, true);
  assert.ok(artifact.changeLog?.some((item) => item.includes('修复')));
});

test('audit pipeline rejects artifact when safety or runtime still fail after repair', async () => {
  await assert.rejects(
    runRagVisualizationAuditPipeline(
      {
        question: '用递归解释 fib(4) 的调用栈。',
        answerText: '展示调用展开和回溯。',
        subject: 'computer_science',
        taskType: 'step_solution',
        source: 'student',
      },
      {
        plannerModel: async () => JSON.stringify({
          shouldGenerate: true,
          problemRestatement: '用递归解释 fib(4) 的调用栈。',
          knowledgePoint: '递归调用栈',
          variables: [{ name: 'n', label: 'n', value: '4', role: 'given' }],
          visualObjects: ['调用帧'],
          controls: ['开始', '重置'],
          metrics: ['当前深度'],
          animationRequirements: ['展开再回溯'],
          successCriteria: ['展示边界条件'],
          rightPanelNarration: [],
          recommendedType: 'interactive_html',
          confidence: 0.9,
        }),
        htmlGenerator: async () => unsafeHtml,
        repairer: async () => unsafeHtml,
        pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
        uxEvaluator: async () => passedEval('UX Evaluator'),
        maxIterations: 1,
      },
    ),
    /RAG 可视化运行时合约未通过：缺少/,
  );
});
