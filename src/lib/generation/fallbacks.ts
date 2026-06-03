import type { ExperimentAction } from '../schema/actions';
import type { ExplanationStep, SubjectType } from '../schema/experiment';
import type { ExperimentPlan } from './agentPipeline';

export interface FallbackTeacherResult {
  actions: ExperimentAction[];
  explanationSteps: ExplanationStep[];
}

export function createFallbackExperimentPlan(prompt: string): ExperimentPlan {
  const subject = inferSubject(prompt);
  const concept = inferConcept(prompt);
  const id = `agent-${Date.now().toString(36)}`;

  return {
    id,
    title: `${concept}互动实验`,
    subject,
    gradeLevel: 'K-12',
    concept,
    description: `围绕“${concept}”生成的可操作互动动画，用于观察变量变化和结果关系。`,
    learningGoals: [
      `理解${concept}的核心变量`,
      '通过拖动控件观察动态变化',
      '把实验现象与公式或规律联系起来',
    ],
    variables: createVariablesForPrompt(prompt),
    animationIntent: '用明显的运动、颜色和指标变化展示变量对实验结果的影响。',
    formulae: createFormulaeForPrompt(prompt),
    quiz: {
      question: `在“${concept}”实验中，改变变量后最应该观察什么？`,
      options: ['结果指标的变化', '按钮颜色的变化', '页面标题的位置'],
      correctAnswer: '结果指标的变化',
      explanation: '互动实验的重点是观察变量、现象和数据之间的关系。',
    },
    safetyNotes: ['本实验为课堂演示模型，真实实验需要遵守教师指导和实验室安全规范。'],
    messageTargets: [
      { id: '#controls', purpose: '变量控制区' },
      { id: '#visualization', purpose: '动画观察区' },
      { id: '#metricPanel', purpose: '指标结果区' },
    ],
  };
}

export function createFallbackWidgetHtml(plan: ExperimentPlan): string {
  const widgetConfig = {
    type: 'simulation',
    concept: plan.concept,
    variables: plan.variables,
    defaultState: Object.fromEntries(plan.variables.map((variable) => [variable.name, variable.default])),
    messageTargets: plan.messageTargets.length
      ? plan.messageTargets
      : [
          { id: '#controls', purpose: '变量控制区' },
          { id: '#visualization', purpose: '动画观察区' },
          { id: '#metricPanel', purpose: '指标结果区' },
        ],
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(plan.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; background: #f7fbff; }
    .app { min-height: 100vh; display: grid; grid-template-columns: minmax(230px, 320px) 1fr; gap: 0; }
    .panel { padding: 22px; background: #ffffff; border-right: 1px solid #dbe7f3; }
    .title { margin: 0 0 6px; font-size: 22px; line-height: 1.2; font-weight: 800; color: #162033; }
    .desc { margin: 0 0 20px; color: #64748b; font-size: 13px; line-height: 1.6; }
    .control { margin: 16px 0; padding: 12px; border-radius: 8px; background: #f1f5f9; }
    .control label { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; font-weight: 700; color: #334155; }
    input[type="range"] { width: 100%; margin-top: 12px; accent-color: #2563eb; }
    .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
    button { min-height: 44px; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; }
    #startPauseBtn { background: #2563eb; color: #fff; }
    #resetBtn { background: #e2e8f0; color: #334155; }
    .stage { position: relative; min-height: 100vh; padding: 22px; display: grid; grid-template-rows: minmax(320px, 1fr) auto; gap: 14px; }
    .canvasBox { position: relative; border: 1px solid #dbe7f3; border-radius: 8px; background: linear-gradient(180deg, #ffffff 0%, #eef6ff 100%); overflow: hidden; }
    svg { width: 100%; height: 100%; min-height: 320px; display: block; }
    .metricPanel { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric { padding: 12px; border: 1px solid #dbe7f3; border-radius: 8px; background: #fff; }
    .metric span { display: block; color: #64748b; font-size: 12px; }
    .metric strong { display: block; margin-top: 4px; font-size: 20px; color: #0f172a; }
    .annotation { position: absolute; left: 24px; top: 24px; max-width: 320px; padding: 10px 12px; border-radius: 8px; background: #1e293b; color: white; font-size: 13px; opacity: 0; transform: translateY(-6px); transition: .2s; pointer-events: none; }
    .annotation.show { opacity: 1; transform: translateY(0); }
    .highlight { outline: 3px solid #f59e0b; outline-offset: 3px; }
    @media (max-width: 720px) {
      .app { grid-template-columns: 1fr; }
      .panel { border-right: 0; border-bottom: 1px solid #dbe7f3; }
      .stage { min-height: auto; }
      .metricPanel { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <script type="application/json" id="widget-config">${JSON.stringify(widgetConfig)}</script>
  <div class="app">
    <aside class="panel" id="controls">
      <h1 class="title">${escapeHtml(plan.title)}</h1>
      <p class="desc">${escapeHtml(plan.description)}</p>
      <div id="dynamicControls"></div>
      <div class="buttons">
        <button id="startPauseBtn" type="button">运行</button>
        <button id="resetBtn" type="button">重置</button>
      </div>
    </aside>
    <main class="stage">
      <section class="canvasBox" id="visualization">
        <svg viewBox="0 0 900 520" role="img" aria-label="互动实验动画">
          <defs>
            <linearGradient id="flowGradient" x1="0%" x2="100%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="100%" stop-color="#22c55e" />
            </linearGradient>
          </defs>
          <text id="titleLabel" x="48" y="62" font-size="26" font-weight="800" fill="#0f172a">${escapeHtml(plan.concept)}</text>
          <line x1="120" y1="370" x2="760" y2="370" stroke="#334155" stroke-width="10" stroke-linecap="round" />
          <path id="curve" d="M120 300 C260 180, 420 460, 760 250" fill="none" stroke="url(#flowGradient)" stroke-width="9" stroke-linecap="round" />
          <circle id="movingDot" cx="120" cy="300" r="22" fill="#2563eb" opacity=".9" />
          <circle id="pulseDot" cx="440" cy="310" r="58" fill="#f59e0b" opacity=".18" />
          <g id="bars"></g>
          <text x="48" y="470" font-size="16" fill="#475569">拖动左侧变量，观察动画速度、幅度和指标如何变化。</text>
        </svg>
        <div class="annotation" id="annotation"></div>
      </section>
      <section class="metricPanel" id="metricPanel"></section>
    </main>
  </div>
  <script>
    (function () {
      var config = JSON.parse(document.getElementById('widget-config').textContent);
      var state = Object.assign({ running: false, time: 0 }, config.defaultState || {});
      var controls = document.getElementById('dynamicControls');
      var metricPanel = document.getElementById('metricPanel');
      var movingDot = document.getElementById('movingDot');
      var pulseDot = document.getElementById('pulseDot');
      var bars = document.getElementById('bars');
      var annotation = document.getElementById('annotation');
      var startPauseBtn = document.getElementById('startPauseBtn');
      var resetBtn = document.getElementById('resetBtn');

      function numberValue(name) {
        var value = Number(state[name]);
        return Number.isFinite(value) ? value : 0;
      }

      function renderControls() {
        controls.innerHTML = '';
        config.variables.forEach(function (variable) {
          var item = document.createElement('div');
          item.className = 'control';
          item.innerHTML =
            '<label><span>' + variable.label + '</span><span id="value-' + variable.name + '">' +
            numberValue(variable.name).toFixed(1) + (variable.unit || '') + '</span></label>' +
            '<input aria-label="' + variable.label + '" id="input-' + variable.name + '" type="range" min="' +
            variable.min + '" max="' + variable.max + '" step="' + variable.step + '" value="' + numberValue(variable.name) + '" />';
          controls.appendChild(item);
          item.querySelector('input').addEventListener('input', function (event) {
            state[variable.name] = Number(event.target.value);
            render();
          });
        });
      }

      function render() {
        var values = config.variables.map(function (variable) { return numberValue(variable.name); });
        var total = values.reduce(function (sum, value) { return sum + value; }, 0);
        var average = values.length ? total / values.length : 0;
        var speed = 0.7 + average * 0.08;
        var x = 120 + ((state.time * speed) % 1) * 640;
        var y = 300 + Math.sin(state.time * 6) * (20 + average);
        movingDot.setAttribute('cx', x.toFixed(1));
        movingDot.setAttribute('cy', y.toFixed(1));
        pulseDot.setAttribute('r', String(42 + Math.abs(Math.sin(state.time * 3)) * (16 + average)));
        startPauseBtn.textContent = state.running ? '暂停' : '运行';
        metricPanel.innerHTML =
          '<div class="metric"><span>变量总量</span><strong>' + total.toFixed(2) + '</strong></div>' +
          '<div class="metric"><span>平均水平</span><strong>' + average.toFixed(2) + '</strong></div>' +
          '<div class="metric"><span>动画状态</span><strong>' + (state.running ? '运行中' : '已暂停') + '</strong></div>';
        bars.innerHTML = '';
        config.variables.forEach(function (variable, index) {
          var height = 30 + (numberValue(variable.name) - Number(variable.min || 0)) /
            Math.max(1, Number(variable.max || 10) - Number(variable.min || 0)) * 120;
          var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', String(120 + index * 92));
          rect.setAttribute('y', String(220 - height));
          rect.setAttribute('width', '46');
          rect.setAttribute('height', String(height));
          rect.setAttribute('rx', '8');
          rect.setAttribute('fill', ['#2563eb', '#10b981', '#f97316', '#8b5cf6'][index % 4]);
          bars.appendChild(rect);
        });
        config.variables.forEach(function (variable) {
          var label = document.getElementById('value-' + variable.name);
          var input = document.getElementById('input-' + variable.name);
          if (label) label.textContent = numberValue(variable.name).toFixed(1) + (variable.unit || '');
          if (input) input.value = numberValue(variable.name);
        });
      }

      function tick() {
        if (state.running) state.time += 0.016;
        render();
        requestAnimationFrame(tick);
      }

      function highlight(target, content) {
        document.querySelectorAll('.highlight').forEach(function (node) { node.classList.remove('highlight'); });
        var element = document.querySelector(target);
        if (element) element.classList.add('highlight');
        if (content) {
          annotation.textContent = content;
          annotation.classList.add('show');
          setTimeout(function () { annotation.classList.remove('show'); }, 2400);
        }
      }

      startPauseBtn.addEventListener('click', function () {
        state.running = !state.running;
        render();
      });
      resetBtn.addEventListener('click', function () {
        state = Object.assign({ running: false, time: 0 }, config.defaultState || {});
        render();
      });

      window.addEventListener('message', function (event) {
        var message = event.data || {};
        if (message.type === 'SET_WIDGET_STATE') {
          state = Object.assign(state, message.state || {});
          render();
        }
        if (message.type === 'HIGHLIGHT_ELEMENT') highlight(message.target, message.content);
        if (message.type === 'ANNOTATE_ELEMENT') highlight(message.target, message.content);
        if (message.type === 'REVEAL_ELEMENT') {
          var element = document.querySelector(message.target);
          if (element) element.hidden = false;
        }
      });

      renderControls();
      render();
      requestAnimationFrame(tick);
    })();
  </script>
</body>
</html>`;
}

export function createFallbackTeacherActions(plan: ExperimentPlan): FallbackTeacherResult {
  const firstVariable = plan.variables[0];
  const secondVariable = plan.variables[1];
  const actions: ExperimentAction[] = [
    {
      id: 'intro',
      type: 'speech',
      text: `我们先观察“${plan.concept}”的整体变化，再调节变量比较结果。`,
      duration: 1200,
    },
    {
      id: 'highlight_controls',
      type: 'highlight_widget_element',
      target: '#controls',
      content: '这里可以调节实验变量。',
      duration: 1200,
    },
    {
      id: 'start_widget',
      type: 'set_widget_state',
      state: { running: true },
      duration: 1200,
    },
    {
      id: 'highlight_result',
      type: 'annotate_widget_element',
      target: '#metricPanel',
      content: '观察指标如何随变量变化。',
      duration: 1400,
    },
    {
      id: 'show_main_quiz',
      type: 'show_quiz',
      quizId: 'main_quiz',
      duration: 900,
    },
  ];

  if (firstVariable && secondVariable) {
    actions.splice(3, 0, {
      id: 'compare_variables',
      type: 'set_widget_state',
      state: {
        [firstVariable.name]: firstVariable.max,
        [secondVariable.name]: secondVariable.default,
        running: true,
      },
      duration: 1200,
    });
  }

  return {
    actions,
    explanationSteps: [
      {
        id: 'step_1',
        title: '认识实验',
        narration: `这个互动实验帮助你观察${plan.concept}中的变量关系。`,
        actionIds: ['intro', 'highlight_controls'],
      },
      {
        id: 'step_2',
        title: '运行与观察',
        narration: '启动动画后，关注运动、颜色和指标的同步变化。',
        actionIds: ['start_widget', 'highlight_result'],
      },
      {
        id: 'step_3',
        title: '检查理解',
        narration: '用一个小问题确认你是否理解变量和结果之间的关系。',
        actionIds: ['show_main_quiz'],
      },
    ],
  };
}

function inferSubject(prompt: string): SubjectType {
  if (/酸|碱|中和|滴定|分子|化学|反应/.test(prompt)) return 'chemistry';
  if (/函数|几何|代数|方程|图像|数学/.test(prompt)) return 'math';
  if (/细胞|生态|遗传|生物/.test(prompt)) return 'biology';
  return 'physics';
}

function inferConcept(prompt: string): string {
  if (/酸|碱|中和|滴定/.test(prompt)) return '酸碱中和滴定';
  if (/电|欧姆|电阻|电压|电流/.test(prompt)) return '欧姆定律与电路关系';
  if (/斜面|小车|摩擦|加速度/.test(prompt)) return '斜面小车运动';
  if (/二次函数|抛物线/.test(prompt)) return '二次函数图像变化';
  return prompt.trim().slice(0, 24) || 'STEM 概念';
}

function createVariablesForPrompt(prompt: string): ExperimentPlan['variables'] {
  if (/酸|碱|中和|滴定/.test(prompt)) {
    return [
      { name: 'acidVolume', label: '酸液体积', min: 0, max: 50, default: 20, step: 1, unit: 'mL' },
      { name: 'baseVolume', label: '碱液体积', min: 0, max: 50, default: 20, step: 1, unit: 'mL' },
      { name: 'indicator', label: '指示剂强度', min: 0, max: 10, default: 5, step: 1 },
    ];
  }
  if (/电|欧姆|电阻|电压|电流/.test(prompt)) {
    return [
      { name: 'voltage', label: '电压', min: 1, max: 24, default: 12, step: 1, unit: 'V' },
      { name: 'resistance', label: '电阻', min: 1, max: 100, default: 20, step: 1, unit: 'Ω' },
    ];
  }
  return [
    { name: 'inputValue', label: '输入变量', min: 0, max: 10, default: 5, step: 0.5 },
    { name: 'rate', label: '变化速率', min: 1, max: 10, default: 4, step: 1 },
  ];
}

function createFormulaeForPrompt(prompt: string): ExperimentPlan['formulae'] {
  if (/电|欧姆|电阻|电压|电流/.test(prompt)) {
    return [{ id: 'ohms-law', title: '欧姆定律', latex: 'I = U / R' }];
  }
  if (/斜面|小车|摩擦|加速度/.test(prompt)) {
    return [{ id: 'inclined-plane', title: '斜面加速度', latex: 'a = g sin(theta) - mu g cos(theta)' }];
  }
  if (/酸|碱|中和|滴定/.test(prompt)) {
    return [{ id: 'neutralization', title: '中和关系', latex: 'n(H+) = n(OH-)' }];
  }
  return [{ id: 'variable-relation', title: '变量关系', latex: 'result = f(variable)' }];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
