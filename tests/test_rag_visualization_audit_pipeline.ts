import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { AgentEvaluation } from '../src/features/deep-interaction/lib/types';
import {
  RAG_WIDGET_HTML_SYSTEM_PROMPT,
  buildRagWidgetHtmlPrompt,
  generateRagWidgetHtml,
  resolveRagWidgetHtmlTimeoutMs,
  runRagVisualizationAuditPipeline,
} from '../src/features/rag/lib/visualization/auditPipeline';
import { formatCompactVisualizationSpecContext } from '../src/features/rag/lib/visualization/specContext';
import type { VisualizationSpec } from '../src/features/rag/lib/visualization/types';
import {
  diagnoseRagWidgetContract,
  ensureRagWidgetContractHtml,
} from '../src/features/rag/lib/visualization/widgetContract';
import { validateInteractiveHtml } from '../src/lib/generation/htmlSafety';
import { evaluateRuntime } from '../src/features/deep-interaction/lib/agents/runtimeEvaluator';
import { ARTIFACT_DESIGN_CONTRACT_MARKER } from '../src/lib/generation/artifactDesignContract';
import { DESIGN_REVIEW_RUBRIC_MARKER } from '../src/features/deep-interaction/lib/agents/designReviewRubric';
import {
  diagnoseActiveRagWidgetInteraction,
  type ActiveInteractionDiagnostics,
} from '../src/features/rag/lib/visualization/activeInteractionDiagnostics';

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
    <section id="metrics" data-role="observation-panel">当前步骤：<span id="step-value">0</span> 速度：<span id="speed-value">2</span></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"单调栈","variables":[{"name":"speed","label":"速度","default":2}],"defaultState":{"speed":2,"running":false},"messageTargets":[{"id":"#visualization","purpose":"主舞台"},{"id":"#controls","purpose":"控制区"},{"id":"#metrics","purpose":"指标区"}]}</script>
  <script>
    const state = { speed: 2, running: false, step: 0 };
    const stepValue = document.getElementById('step-value');
    const speedValue = document.getElementById('speed-value');
    function draw() {
      stepValue.textContent = String(state.step);
      if (speedValue) speedValue.textContent = String(state.speed);
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
const dangerousHtml = safeHtml.replace(
  'function draw() {',
  'fetch("/should-not-block-release");\n    function draw() {',
);

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

test('interactive HTML safety rejects passive remote resource loading', () => {
  const cases = [
    ['script src', safeHtml.replace('</body>', '<script src="https://example.test/widget.js"></script></body>')],
    ['link href', safeHtml.replace('</head>', '<link rel="stylesheet" href="https://example.test/widget.css"></head>')],
    ['image src', safeHtml.replace('</section>', '<img src="https://example.test/chart.png" alt=""></section>')],
    ['image srcset', safeHtml.replace('</section>', '<img srcset="https://example.test/chart.png 1x" alt=""></section>')],
    ['audio tag', safeHtml.replace('</main>', '<audio src="https://example.test/tone.mp3"></audio></main>')],
    ['video tag', safeHtml.replace('</main>', '<video src="https://example.test/demo.mp4"></video></main>')],
    ['source tag', safeHtml.replace('</main>', '<picture><source srcset="https://example.test/chart.webp"></picture></main>')],
    ['object tag', safeHtml.replace('</main>', '<object data="https://example.test/widget.html"></object></main>')],
    ['embed tag', safeHtml.replace('</main>', '<embed src="https://example.test/widget.html"></main>')],
    ['css import', safeHtml.replace('</style>', '@import url("https://example.test/widget.css");</style>')],
    ['css remote url', safeHtml.replace('</style>', '#visualization { background-image: url(https://example.test/chart.png); }</style>')],
    ['css protocol-relative url', safeHtml.replace('</style>', '#visualization { background-image: url(//example.test/chart.png); }</style>')],
    ['css data url', safeHtml.replace('</style>', '#visualization { background-image: url(data:image/png;base64,AAAA); }</style>')],
    ['css blob url', safeHtml.replace('</style>', '#visualization { background-image: url(blob:https://example.test/id); }</style>')],
  ] as const;

  for (const [label, html] of cases) {
    const result = validateInteractiveHtml(html);
    assert.equal(result.ok, false, `${label} should be rejected`);
  }
});

test('interactive HTML safety allows SVG-internal url fragment references', () => {
  const html = safeHtml
    .replace(
      '<svg id="stage" viewBox="0 0 420 220" width="100%" height="260" aria-label="单调栈状态">',
      '<svg id="stage" viewBox="0 0 420 220" width="100%" height="260" aria-label="单调栈状态"><defs><linearGradient id="mainGradient"><stop offset="0%" stop-color="#14b8a6"></stop><stop offset="100%" stop-color="#0ea5e9"></stop></linearGradient></defs>',
    )
    .replace('fill="#14b8a6"', 'fill="url(#mainGradient)"');

  assert.deepEqual(validateInteractiveHtml(html), { ok: true, errors: [] });
});

function passedEval(agentName: string): AgentEvaluation {
  return {
    agentName,
    score: 92,
    passed: true,
    summary: `${agentName} passed`,
    issues: [],
  };
}

function failedUxEval(): AgentEvaluation {
  return {
    agentName: 'UX Evaluator',
    score: 62,
    passed: false,
    summary: 'UX needs review',
    issues: [{
      id: 'ux_issue_1',
      severity: 'high',
      category: 'ux',
      message: '主舞台比例不足。',
      suggestion: '扩大主舞台并压缩说明栏。',
      target: 'html',
    }],
  };
}

function passedActiveDiagnostics(): ActiveInteractionDiagnostics {
  return {
    passed: true,
    actionsTested: ['start', 'reset', 'range:speed'],
    visibleMutations: ['start: metrics changed', 'reset: metrics changed', 'range:speed: metrics changed'],
    warnings: [],
  };
}

function failedActiveDiagnostics(): ActiveInteractionDiagnostics {
  return {
    passed: false,
    actionsTested: ['start', 'reset', 'range:speed'],
    visibleMutations: [],
    warnings: [],
    failureReason: 'start, reset, and range:speed produced no visible mutation in #visualization or #metrics',
  };
}

test('RAG widget HTML prompt requires deep-interaction widget contract', () => {
  const longTraceSpec: VisualizationSpec = {
    type: 'algorithm_trace',
    title: '单调栈过程',
    description: '展示单调栈弹出和写入输出数组。',
    algorithmName: 'next greater element',
    dataStructure: 'stack',
    inputExample: '[2,1,2,4,3]',
    steps: Array.from({ length: 12 }, (_, index) => ({
      stepIndex: index,
      operation: index === 0 ? '初始化' : `长步骤_${index}`,
      explanation: `第 ${index} 步 SHOULD_NOT_DUMP_FULL_TRACE_${index}`,
      state: {
        stack: [`stack-${index}`],
        output: [-1, -1, -1, -1, -1],
        verbose: `VERBOSE_TRACE_STATE_${index}`,
      },
      highlight: ['stack'],
    })),
  };
  const prompt = buildRagWidgetHtmlPrompt({
    question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '用栈保存待解决下标。',
    visualizationSpec: longTraceSpec,
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
  assert.match(prompt, /working interactive prototype/i);
  assert.match(prompt, /single-pass|一次性/);
  assert.match(prompt, /high-resource|最大.*资源|高资源/i);
  assert.match(prompt, /内部 Agent 规划|Internal agent plan/i);
  assert.match(prompt, /Core Analysis Agent/);
  assert.match(prompt, /Architecture Agent/);
  assert.match(prompt, /Logic Agent/);
  assert.match(prompt, /Visualization \/ Interaction Agent/);
  assert.match(prompt, /UI Design Agent/);
  assert.match(prompt, /Content \/ Localization Agent/);
  assert.match(prompt, /Implementation Agent/);
  assert.match(prompt, /Reviewer \/ Critic Agent/);
  assert.match(prompt, /不要输出.*规划|do not output.*planning/i);
  assert.match(prompt, /internal self-check|内部自检/i);
  assert.match(prompt, /完整 HTML|complete HTML/i);
  assert.match(prompt, /visible state change/i);
  assert.match(prompt, /fake interaction/i);
  assert.match(prompt, /not a generic explanation page|不是通用解释页/i);
  assert.match(prompt, /alert\(\)|console\.log/);
  assert.match(prompt, /结构化 spec context/);
  assert.match(prompt, /"type": "algorithm_trace"/);
  assert.match(prompt, /"stepCount": 12/);
  assert.match(prompt, /"omittedStepCount":/);
  assert.doesNotMatch(prompt, /SHOULD_NOT_DUMP_FULL_TRACE_10/);
  assert.doesNotMatch(prompt, /VERBOSE_TRACE_STATE_10/);
  assert.match(prompt, /不能作为最终模板直接渲染|不允许直接套 deterministic renderer|不能直接套 deterministic renderer/);
  assert.match(prompt, /static spec previews/i);
  assert.match(prompt, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER));
  assert.match(prompt, /STEMOTION_RAG_VISUALIZATION_DESIGN_CONTEXT/);
  assert.match(prompt, /design context/i);
  assert.match(prompt, /STEMotion visual vocabulary/i);
  assert.match(prompt, /anti-filler/i);
  assert.match(prompt, /first-screen stage-first/i);
  assert.match(prompt, /problem-specific interaction/i);
  assert.match(prompt, /## 目标|## Goal/);
  assert.match(prompt, /## 题目事实|## Problem facts/);
  assert.match(prompt, /## 布局骨架|## Layout skeleton/);
  assert.match(prompt, /## 状态机|## State machine/);
  assert.match(prompt, /## 运行时协议|## Runtime protocol/);
  assert.match(prompt, /## 禁止项|## Forbidden/);
  assert.match(prompt, /## 输出格式|## Output format/);
  assert.doesNotMatch(prompt, /多 Agent 质量评审|第 \d+\/\d+ 轮|repair loop|局部 patch/i);
  assert.match(RAG_WIDGET_HTML_SYSTEM_PROMPT, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER));
  assert.match(RAG_WIDGET_HTML_SYSTEM_PROMPT, /STEMOTION_RAG_VISUALIZATION_DESIGN_CONTEXT/);
  assert.match(RAG_WIDGET_HTML_SYSTEM_PROMPT, /working interactive prototype/i);
  assert.match(RAG_WIDGET_HTML_SYSTEM_PROMPT, /visible state changes/i);
});

test('compact spec formatter is used before prompt injection', () => {
  const formatted = formatCompactVisualizationSpecContext({
    type: 'algorithm_trace',
    title: '单调栈过程',
    description: '展示单调栈弹出和写入输出数组。',
    algorithmName: 'next greater element',
    dataStructure: 'stack',
    inputExample: '[2,1,2,4,3]',
    stepCount: 8,
    sampleSteps: [
      {
        stepIndex: 0,
        operation: '初始化',
        explanation: '准备空栈和输出数组。',
        stateKeys: ['stack', 'output'],
        highlight: ['stack'],
      },
    ],
    omittedStepCount: 7,
  });

  assert.match(formatted, /"sampleSteps"/);
  assert.match(formatted, /"stateKeys"/);
  assert.match(formatted, /"omittedStepCount": 7/);
});

test('RAG widget prompts remain problem-specific for different algorithm questions', () => {
  const monotonicStackPrompt = buildRagWidgetHtmlPrompt({
    question: '用单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '维护递减下标栈。',
    plan: {
      shouldGenerate: true,
      problemRestatement: '用单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      knowledgePoint: '单调栈',
      variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
      visualObjects: ['输入数组条形图', '单调栈容器', '输出数组槽位'],
      controls: ['开始', '重置', '逐步弹栈'],
      metrics: ['当前下标', '栈顶元素', '输出数组'],
      animationRequirements: ['当前元素扫描', '栈顶弹出写入输出'],
      successCriteria: ['看清为什么元素 1 的下一个更大元素是 2'],
      rightPanelNarration: [],
      recommendedType: 'interactive_html',
      confidence: 0.92,
    },
  });
  const recursionPrompt = buildRagWidgetHtmlPrompt({
    question: '解释 fib(4) 递归调用栈如何展开和回溯',
    answerText: '先展开调用，到达边界条件后逐层返回。',
    plan: {
      shouldGenerate: true,
      problemRestatement: '解释 fib(4) 递归调用栈如何展开和回溯',
      knowledgePoint: '递归调用栈',
      variables: [{ name: 'n', label: '递归输入', value: '4', role: 'given' }],
      visualObjects: ['调用帧堆叠', '返回值箭头', '递归树分支'],
      controls: ['开始', '重置', '逐层回溯'],
      metrics: ['当前深度', '活跃调用帧', '返回值'],
      animationRequirements: ['调用帧入栈', '边界条件返回', '父调用汇总返回值'],
      successCriteria: ['看清 fib(4) 如何由 fib(3) 和 fib(2) 汇总'],
      rightPanelNarration: [],
      recommendedType: 'interactive_html',
      confidence: 0.92,
    },
  });

  assert.match(monotonicStackPrompt, /单调栈容器/);
  assert.match(monotonicStackPrompt, /输出数组槽位/);
  assert.doesNotMatch(monotonicStackPrompt, /递归树分支/);
  assert.match(recursionPrompt, /调用帧堆叠/);
  assert.match(recursionPrompt, /返回值箭头/);
  assert.doesNotMatch(recursionPrompt, /输出数组槽位/);
});

test('RAG visualization audit keeps design reviewers as post-publish reporting without repair loop', () => {
  const auditSource = readFileSync(join(ROOT, 'src/lib/rag/visualization/auditPipeline.ts'), 'utf8');
  const uxEvaluatorSource = readFileSync(join(ROOT, 'src/lib/deep-interaction/agents/uxEvaluatorAgent.ts'), 'utf8');
  const judgeSource = readFileSync(join(ROOT, 'src/lib/deep-interaction/agents/judgeAgent.ts'), 'utf8');
  const repairSource = readFileSync(join(ROOT, 'src/lib/deep-interaction/agents/repairAgent.ts'), 'utf8');

  assert.match(auditSource, /evaluateUX/);
  assert.match(auditSource, /judgeEvaluations/);
  assert.doesNotMatch(auditSource, /repairArtifact/);
  assert.match(auditSource, /artifact_quality_updated/);
  assert.doesNotMatch(auditSource, /visualizationQuality\?:/);
  assert.match(uxEvaluatorSource, /designReviewRubricPrompt/);
  assert.match(DESIGN_REVIEW_RUBRIC_MARKER, /STEMOTION_DESIGN_REVIEW_RUBRIC/);
  assert.match(judgeSource, /collectDesignQualityBlockers/);
  assert.match(repairSource, /designRepairPrompt/);
});

test('RAG widget HTML generation timeout is bounded and env configurable', () => {
  const previous = process.env.STEMOTION_RAG_WIDGET_HTML_TIMEOUT_MS;
  try {
    delete process.env.STEMOTION_RAG_WIDGET_HTML_TIMEOUT_MS;
    assert.equal(resolveRagWidgetHtmlTimeoutMs(), 900000);

    process.env.STEMOTION_RAG_WIDGET_HTML_TIMEOUT_MS = '45000';
    assert.equal(resolveRagWidgetHtmlTimeoutMs(), 45000);

    process.env.STEMOTION_RAG_WIDGET_HTML_TIMEOUT_MS = 'not-a-number';
    assert.equal(resolveRagWidgetHtmlTimeoutMs(), 900000);
  } finally {
    if (previous === undefined) delete process.env.STEMOTION_RAG_WIDGET_HTML_TIMEOUT_MS;
    else process.env.STEMOTION_RAG_WIDGET_HTML_TIMEOUT_MS = previous;
  }
});

test('RAG widget HTML generation recovers streamed partial HTML when timeout aborts the request', async () => {
  const html = await generateRagWidgetHtml(
    {
      question: '单调栈如何维护候选下标？',
      answerText: '使用栈保存还没有找到下一个更大元素的下标。',
      subject: 'computer_science',
      taskType: 'step_solution',
      source: 'student',
      plan: {
        shouldGenerate: true,
        problemRestatement: '单调栈维护候选下标并写入下一个更大元素。',
        knowledgePoint: '单调栈',
        variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
        visualObjects: ['输入数组', '栈容器', '输出数组'],
        controls: ['开始', '重置', '步骤滑块'],
        metrics: ['当前下标', '栈内容', '输出数组'],
        animationRequirements: ['入栈时高亮', '弹栈时写入输出'],
        successCriteria: ['按钮和滑块必须改变可视化'],
        rightPanelNarration: [],
        recommendedType: 'interactive_html',
        confidence: 0.95,
      },
    },
    undefined,
    10,
    {
      generate: async ({ onTextDelta, signal }) => {
        onTextDelta?.('<!DOCTYPE html><html><head><title>单调栈</title></head><body><main id="app"><section id="visualization">');
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
        throw new Error('unreachable');
      },
    },
  );

  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /id="visualization"/);
  assert.match(html, /<\/html>/i);
});

test('audit pipeline publishes deterministic fallback HTML when artifact generation times out', async () => {
  const emitted: Array<{ type?: string }> = [];

  const artifact = await runRagVisualizationAuditPipeline(
    {
      question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      answerText: '用栈保存还没有找到右侧更大元素的下标。',
      subject: 'computer_science',
      taskType: 'step_solution',
      source: 'student',
      now: '2026-05-31T00:00:00.000Z',
      visualizationSpec: {
        type: 'algorithm_trace',
        title: '单调栈过程',
        description: '展示单调栈弹出和写入输出数组。',
        algorithmName: 'next_greater_element',
        dataStructure: 'stack',
        inputExample: '[2,1,2,4,3]',
        steps: [
          {
            stepIndex: 1,
            operation: '初始化',
            state: { stack: [], output: [-1, -1, -1, -1, -1] },
            explanation: '初始化栈和输出数组。',
          },
          {
            stepIndex: 2,
            operation: '读取 2',
            state: { stack: ['0:2'], output: [-1, -1, -1, -1, -1] },
            explanation: '当前元素入栈。',
          },
        ],
      },
    },
    {
      plannerModel: async () => JSON.stringify({
        shouldGenerate: true,
        problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
        knowledgePoint: '单调栈',
        variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
        visualObjects: ['输入数组条形图', '栈容器', '输出数组'],
        controls: ['开始', '重置', '逐步播放'],
        metrics: ['当前下标', '栈内容', '输出数组'],
        animationRequirements: ['读取元素时移动指针', '弹出时高亮'],
        successCriteria: ['完整展示弹出和写入 output 的步骤'],
        rightPanelNarration: [{ title: '观察弹出条件', narration: '当当前元素更大时弹出栈顶下标。' }],
        recommendedType: 'interactive_html',
        confidence: 0.93,
      }),
      htmlGenerator: async () => {
        const error = new Error('RAG visualization HTML generation timed out.');
        error.name = 'AbortError';
        throw error;
      },
      activeInteractionEvaluator: async () => passedActiveDiagnostics(),
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => passedEval('UX Evaluator'),
      emit: (event) => emitted.push(event),
      maxIterations: 1,
      allowRepair: false,
      reviewerProfile: 'lightweight',
    },
  );

  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.ok(artifact.schema.htmlWidget?.html.includes('data-rag-fallback-html="true"'));
  assert.equal(diagnoseRagWidgetContract(artifact.schema.htmlWidget?.html ?? '').passed, true);
  assert.ok(artifact.changeLog?.some((item) => /HTML LLM 生成失败|本地 fallback|降级/.test(item)));
  assert.equal(artifact.qualityReport?.passed, false);
  assert.ok(artifact.qualityReport?.weaknesses.some((item) => /HTML LLM 生成失败|fallback|降级/.test(item)));
  assert.ok(emitted.some((event) => event.type === 'artifact_ready'));
});

test('deterministic fallback HTML passes real active interaction diagnostics after generation timeout', async () => {
  const artifact = await runRagVisualizationAuditPipeline(
    {
      question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      answerText: '用栈保存还没有找到右侧更大元素的下标。',
      subject: 'computer_science',
      taskType: 'step_solution',
      source: 'student',
      now: '2026-05-31T00:00:00.000Z',
      visualizationSpec: {
        type: 'algorithm_trace',
        title: '单调栈过程',
        description: '展示单调栈弹出和写入输出数组。',
        algorithmName: 'next_greater_element',
        dataStructure: 'stack',
        inputExample: '[2,1,2,4,3]',
        steps: [
          {
            stepIndex: 1,
            operation: '初始化',
            state: { stack: [], output: [-1, -1, -1, -1, -1] },
            explanation: '初始化栈和输出数组。',
          },
          {
            stepIndex: 2,
            operation: '读取 2',
            state: { stack: ['0:2'], output: [-1, -1, -1, -1, -1] },
            explanation: '当前元素入栈。',
          },
        ],
      },
    },
    {
      plannerModel: async () => JSON.stringify({
        shouldGenerate: true,
        problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
        knowledgePoint: '单调栈',
        variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
        visualObjects: ['输入数组条形图', '栈容器', '输出数组'],
        controls: ['开始', '重置', '逐步播放'],
        metrics: ['当前下标', '栈内容', '输出数组'],
        animationRequirements: ['读取元素时移动指针', '弹出时高亮'],
        successCriteria: ['完整展示弹出和写入 output 的步骤'],
        rightPanelNarration: [{ title: '观察弹出条件', narration: '当当前元素更大时弹出栈顶下标。' }],
        recommendedType: 'interactive_html',
        confidence: 0.93,
      }),
      htmlGenerator: async () => {
        const error = new Error('RAG visualization HTML generation timed out.');
        error.name = 'AbortError';
        throw error;
      },
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => passedEval('UX Evaluator'),
      reviewerProfile: 'lightweight',
    },
  );

  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.ok(artifact.schema.htmlWidget?.html.includes('data-rag-fallback-html="true"'));
  assert.ok(
    artifact.feedbackLoop?.iterations[0]?.evaluations.some((evaluation) => (
      evaluation.agentName === 'Active Interaction Evaluator' && evaluation.passed
    )),
    'fallback HTML should not be published with active interaction failures',
  );
  assert.equal(
    artifact.feedbackLoop?.finalIssues.some((issue) => /主动交互|visible mutation|可见变化/.test(`${issue.message} ${issue.evidence ?? ''}`)),
    false,
    JSON.stringify(artifact.feedbackLoop?.finalIssues ?? [], null, 2),
  );
});

test('audit pipeline uses a passed deterministic visualization spec as HTML generation context', async () => {
  const spec: VisualizationSpec = {
    type: 'projectile_motion',
    title: '斜抛运动可视化',
    description: '观察初速度、角度和重力对轨迹的影响。',
    contextTitle: '斜抛运动',
    parameters: {
      v0: 20,
      angle_deg: 30,
      g: 9.8,
    },
  };
  let htmlGeneratorCalled = 0;
  let pedagogyCalls = 0;
  let uxCalls = 0;
  let capturedHtmlInput: { visualizationSpec?: VisualizationSpec } | undefined;
  const emittedTypes: string[] = [];

  const artifact = await runRagVisualizationAuditPipeline(
    {
      question: '初速度 20m/s、角度 30 度的斜抛运动如何变化？',
      answerText: '通过轨迹观察初速度、角度和重力对射程与最大高度的影响。',
      subject: 'physics_mechanics',
      taskType: 'step_solution',
      source: 'student',
      visualizationSpec: spec,
    },
    {
      plannerModel: async () => JSON.stringify({
        shouldGenerate: true,
        problemRestatement: '初速度 20m/s、角度 30 度的斜抛运动如何变化？',
        knowledgePoint: '斜抛运动',
        variables: [
          { name: 'v0', label: '初速度', value: '20', unit: 'm/s', role: 'given' },
          { name: 'theta', label: '抛射角', value: '30', unit: '°', role: 'controlled' },
          { name: 'g', label: '重力加速度', value: '9.8', unit: 'm/s²', role: 'given' },
        ],
        visualObjects: ['轨迹曲线', '速度分量箭头', '落点标记'],
        controls: ['开始', '重置', '角度滑块'],
        metrics: ['飞行时间', '水平射程', '最大高度'],
        animationRequirements: ['轨迹点沿抛物线运动', '角度滑块改变射程和高度指标'],
        successCriteria: ['展示角度变化如何影响射程与最大高度'],
        rightPanelNarration: [{ title: '观察角度', narration: '拖动角度滑块，观察轨迹和指标同步变化。' }],
        recommendedType: 'interactive_html',
        confidence: 0.96,
      }),
      htmlGenerator: async (input) => {
        htmlGeneratorCalled += 1;
        capturedHtmlInput = input;
        return safeHtml;
      },
      activeInteractionEvaluator: async () => passedActiveDiagnostics(),
      pedagogyEvaluator: async () => {
        pedagogyCalls += 1;
        return passedEval('Pedagogy Evaluator');
      },
      uxEvaluator: async () => {
        uxCalls += 1;
        return passedEval('UX Evaluator');
      },
      emit: (event) => emittedTypes.push(event.type),
      maxIterations: 1,
    },
  );

  assert.equal(htmlGeneratorCalled, 1);
  assert.equal(pedagogyCalls, 1);
  assert.equal(uxCalls, 1);
  assert.deepEqual(capturedHtmlInput?.visualizationSpec, spec);
  assert.ok(emittedTypes.includes('artifact_ready'), 'passed specs should publish artifact before deep audit');
  assert.ok(emittedTypes.includes('artifact_quality_updated'), 'high-quality specs should update quality after artifact publish');
  assert.ok(
    emittedTypes.indexOf('artifact_ready') < emittedTypes.indexOf('artifact_quality_updated'),
    'quality update should happen after artifact_ready',
  );
  assert.equal(artifact.type, 'rag_visualization');
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.equal(artifact.schema.visualizationSpec.type, 'interactive_html');
  assert.notDeepEqual(artifact.schema.visualizationSpec, spec);
  assert.ok(artifact.schema.htmlWidget?.html.includes('WIDGET_READY'));
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

test('widget contract runtime patch makes generic controls visibly interactive', async () => {
  const patched = ensureRagWidgetContractHtml(weakButSafeHtml);
  const diagnostic = await diagnoseActiveRagWidgetInteraction(patched);

  assert.equal(diagnostic.passed, true, diagnostic.failureReason);
  assert.ok(diagnostic.visibleMutations.some((item) => item.startsWith('range:speed:')));
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

test('audit pipeline publishes weak safe HTML without LLM repair and reports active interaction issues', async () => {
  let repairCalled = false;
  let activeCalls = 0;
  const emitted: Array<{ type?: string }> = [];

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
      activeInteractionEvaluator: async () => {
        activeCalls += 1;
        return failedActiveDiagnostics();
      },
      repairer: async () => {
        repairCalled = true;
        return safeHtml;
      },
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => passedEval('UX Evaluator'),
      emit: (event) => emitted.push(event),
      maxIterations: 2,
      allowRepair: true,
      reviewerProfile: 'full',
    },
  );

  assert.equal(repairCalled, false);
  assert.equal(activeCalls, 1);
  assert.equal(emitted.some((event) => event.type === 'repair_started'), false);
  assert.equal(emitted.some((event) => event.type === 'repair_completed'), false);
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.equal(artifact.schema.htmlWidget?.html.includes('弱互动页'), true);
  assert.equal(artifact.feedbackLoop?.passed, false);
  assert.ok(artifact.feedbackLoop?.finalIssues.some((issue) => /主动交互|visible mutation|可见/.test(`${issue.message} ${issue.suggestion}`)));
});

test('high-quality audit emits artifact_ready before async quality update without mutating HTML', async () => {
  const emitted: Array<{ type?: string; artifact?: { id?: string; schema?: { htmlWidget?: { html?: string } } }; artifactId?: string; qualityReport?: { passed?: boolean; finalScore?: number } }> = [];
  let repairCalled = false;

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
      htmlGenerator: async () => safeHtml,
      repairer: async () => {
        repairCalled = true;
        return unsafeHtml;
      },
      activeInteractionEvaluator: async () => passedActiveDiagnostics(),
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => failedUxEval(),
      emit: (event) => emitted.push(event as typeof emitted[number]),
      maxIterations: 1,
      allowRepair: false,
      reviewerProfile: 'full',
    },
  );

  const artifactReadyIndex = emitted.findIndex((event) => event.type === 'artifact_ready');
  const qualityUpdatedIndex = emitted.findIndex((event) => event.type === 'artifact_quality_updated');
  const artifactReady = emitted[artifactReadyIndex];
  const qualityUpdated = emitted[qualityUpdatedIndex];

  assert.equal(repairCalled, false);
  assert.ok(artifactReadyIndex >= 0, 'artifact_ready should be emitted');
  assert.ok(qualityUpdatedIndex > artifactReadyIndex, 'quality update should happen after artifact_ready');
  assert.equal(artifactReady?.artifact?.schema?.htmlWidget?.html?.includes('WIDGET_READY'), true);
  assert.equal(qualityUpdated?.artifactId, artifactReady?.artifact?.id);
  assert.equal(qualityUpdated?.qualityReport?.passed, false);
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.type, 'rag_visualization');
  assert.equal(artifact.schema.type, 'rag_visualization');
  assert.ok(artifact.schema.htmlWidget?.html.includes('WIDGET_READY'));
  assert.equal(artifact.schema.visualizationPlan?.knowledgePoint, '单调栈');
  assert.equal(artifact.schema.htmlWidget?.html, artifactReady?.artifact?.schema?.htmlWidget?.html);
  assert.equal(artifact.qualityReport?.passed, false);
  assert.ok(artifact.qualityReport?.weaknesses.some((item) => /UX/.test(item)));
});

test('postPublishReviewMode skip returns after deterministic artifact without LLM reviewers', async () => {
  const emitted: Array<{ type?: string }> = [];
  let pedagogyCalls = 0;
  let uxCalls = 0;

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
      htmlGenerator: async () => safeHtml,
      activeInteractionEvaluator: async () => passedActiveDiagnostics(),
      pedagogyEvaluator: async () => {
        pedagogyCalls += 1;
        return passedEval('Pedagogy Evaluator');
      },
      uxEvaluator: async () => {
        uxCalls += 1;
        return passedEval('UX Evaluator');
      },
      emit: (event) => emitted.push(event),
      reviewerProfile: 'full',
      postPublishReviewMode: 'skip',
    },
  );

  assert.equal(pedagogyCalls, 0);
  assert.equal(uxCalls, 0);
  assert.equal(emitted.some((event) => event.type === 'artifact_ready'), true);
  assert.equal(emitted.some((event) => event.type === 'artifact_quality_updated'), false);
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.qualityReport?.status, 'reviewing');
});

test('fast audit runs lightweight diagnostics and skips repair before publishing', async () => {
  let pedagogyCalls = 0;
  let uxCalls = 0;
  let activeCalls = 0;
  let repairCalled = false;

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
      htmlGenerator: async () => dangerousHtml,
      repairer: async (ctx) => {
        repairCalled = true;
        assert.ok(ctx.issues.some((issue) => issue.category === 'safety' || issue.category === 'runtime'));
        return safeHtml;
      },
      activeInteractionEvaluator: async () => {
        activeCalls += 1;
        return passedActiveDiagnostics();
      },
      pedagogyEvaluator: async () => {
        pedagogyCalls += 1;
        return passedEval('Pedagogy Evaluator');
      },
      uxEvaluator: async () => {
        uxCalls += 1;
        return passedEval('UX Evaluator');
      },
      maxIterations: 1,
      allowRepair: false,
      reviewerProfile: 'lightweight',
    },
  );

  assert.equal(repairCalled, false);
  assert.equal(pedagogyCalls, 0);
  assert.equal(uxCalls, 0);
  assert.equal(activeCalls, 1);
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.feedbackLoop?.iterations.length, 1);
  assert.equal(artifact.feedbackLoop?.passed, false);
  assert.equal(artifact.qualityReport?.passed, false);
  assert.ok(artifact.feedbackLoop?.finalIssues.some((issue) => issue.category === 'safety'));
});

test('audit pipeline publishes artifact when final safety or runtime checks still fail', async () => {
  let repairCalled = false;
  const artifact = await runRagVisualizationAuditPipeline(
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
      htmlGenerator: async () => dangerousHtml,
      repairer: async () => {
        repairCalled = true;
        return dangerousHtml;
      },
      activeInteractionEvaluator: async () => passedActiveDiagnostics(),
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => passedEval('UX Evaluator'),
      maxIterations: 1,
      allowRepair: true,
      reviewerProfile: 'full',
    },
  );

  assert.equal(repairCalled, false);
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.feedbackLoop?.passed, false);
  assert.equal(artifact.qualityReport?.passed, false);
  assert.ok(artifact.feedbackLoop?.finalIssues.some((issue) => issue.category === 'safety'));
  assert.ok(artifact.qualityReport?.weaknesses.some((item) => /fetch/i.test(item)));
  assert.ok(artifact.changeLog?.some((item) => /审计未通过|复核/.test(item)));
});

test('high-quality audit performs one deterministic pass and no repair loop', async () => {
  const emitted: Array<{ type?: string; iteration?: number }> = [];
  let repairCalls = 0;

  const artifact = await runRagVisualizationAuditPipeline(
    {
      question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      answerText: '用栈保存还没有找到右侧更大元素的下标。',
      subject: 'computer_science',
      taskType: 'step_solution',
      source: 'student',
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
      activeInteractionEvaluator: async () => failedActiveDiagnostics(),
      repairer: async () => {
        repairCalls += 1;
        return { revisedHtml: weakButSafeHtml, changeLog: [`repair ${repairCalls}`] };
      },
      pedagogyEvaluator: async () => passedEval('Pedagogy Evaluator'),
      uxEvaluator: async () => passedEval('UX Evaluator'),
      emit: (event) => emitted.push(event),
      maxIterations: 3,
      allowRepair: true,
      reviewerProfile: 'full',
    },
  );

  const started = emitted.filter((event) => event.type === 'feedback_iteration_started');
  assert.equal(started.length, 1);
  assert.deepEqual(started.map((event) => event.iteration), [1]);
  assert.equal(repairCalls, 0);
  assert.equal(emitted.some((event) => event.type === 'repair_started'), false);
  assert.equal(emitted.some((event) => event.type === 'artifact_quality_updated'), true);
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.feedbackLoop?.passed, false);
  assert.ok(artifact.feedbackLoop?.finalIssues.some((issue) => issue.message.includes('主动交互')));
});
