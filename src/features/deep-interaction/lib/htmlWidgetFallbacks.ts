import type { DeepInteractionType } from './types';

export interface WidgetVariable {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit?: string;
}

export interface WidgetPlan {
  title: string;
  concept: string;
  description: string;
  interactionType: DeepInteractionType;
  variables: WidgetVariable[];
  learningGoals: string[];
}

export function createFallbackWidgetHtml(plan: WidgetPlan): string {
  const palette = getPalette(plan.interactionType);
  const config = {
    concept: plan.concept,
    variables: plan.variables,
    defaultState: {
      running: false,
      paused: false,
      time: 0,
      ...Object.fromEntries(plan.variables.map((variable) => [variable.name, variable.default])),
    },
    messageTargets: [
      { id: '#controls', purpose: '参数控制区' },
      { id: '#visualization', purpose: '主动画舞台' },
      { id: '#metrics', purpose: '实时指标区' },
      { id: '#start-btn', purpose: '运行或暂停实验' },
      { id: '#reset-btn', purpose: '重置实验状态' },
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
    html, body { width: 100%; min-height: 100%; margin: 0; }
    body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f8fafc; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(260px, 340px) 1fr; }
    .panel { padding: 22px; background: #ffffff; border-right: 1px solid #dbe4ef; overflow: auto; }
    .badge { display: inline-flex; min-height: 28px; align-items: center; border-radius: 999px; padding: 0 10px; background: ${palette.soft}; color: ${palette.main}; font-size: 12px; font-weight: 900; }
    h1 { margin: 14px 0 8px; font-size: 24px; line-height: 1.15; }
    .desc { margin: 0 0 18px; color: #64748b; font-size: 13px; line-height: 1.65; }
    .control { margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 12px; }
    label { display: flex; justify-content: space-between; gap: 10px; color: #334155; font-size: 13px; font-weight: 900; }
    input[type="range"] { width: 100%; margin-top: 12px; accent-color: ${palette.main}; }
    .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
    button { min-height: 44px; border: 0; border-radius: 8px; font-weight: 900; cursor: pointer; touch-action: manipulation; }
    #start-btn { background: ${palette.main}; color: white; }
    #reset-btn { background: #e2e8f0; color: #334155; }
    .stage { min-height: 100vh; padding: 18px; display: grid; grid-template-rows: minmax(360px, 1fr) auto; gap: 14px; }
    .canvas { position: relative; overflow: hidden; border: 1px solid #dbe4ef; border-radius: 8px; background: linear-gradient(180deg, #ffffff 0%, ${palette.wash} 100%); }
    svg { width: 100%; height: 100%; min-height: 360px; display: block; }
    .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric { border: 1px solid #dbe4ef; border-radius: 8px; background: #ffffff; padding: 12px; }
    .metric span { display: block; color: #64748b; font-size: 12px; }
    .metric strong { display: block; margin-top: 4px; color: #0f172a; font-size: 20px; }
    .annotation { position: absolute; left: 20px; top: 20px; max-width: 320px; padding: 10px 12px; border-radius: 8px; background: #172033; color: white; font-size: 13px; opacity: 0; transform: translateY(-6px); transition: 180ms ease; pointer-events: none; z-index: 5; }
    .annotation.show { opacity: 1; transform: translateY(0); }
    .highlight { outline: 3px solid #f59e0b; outline-offset: 4px; animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { outline-color: #f59e0b; } 50% { outline-color: #fde68a; } }
    @media (max-width: 760px) {
      .shell { grid-template-columns: 1fr; }
      .panel { max-height: 44vh; border-right: 0; border-bottom: 1px solid #dbe4ef; }
      .stage { min-height: auto; padding: 12px; }
      .metrics { grid-template-columns: 1fr; }
      svg { min-height: 320px; }
    }
  </style>
</head>
<body>
  <script type="application/json" id="widget-config">${safeJson(config)}</script>
  <div class="shell">
    <aside class="panel" id="controls">
      <div class="badge">${typeLabel(plan.interactionType)}</div>
      <h1>${escapeHtml(plan.title)}</h1>
      <p class="desc">${escapeHtml(plan.description)}</p>
      <div id="sliders"></div>
      <div class="buttons">
        <button id="start-btn" type="button">运行</button>
        <button id="reset-btn" type="button">重置</button>
      </div>
    </aside>
    <main class="stage">
      <section class="canvas" id="visualization">
        <svg viewBox="0 0 900 520" role="img" aria-label="${escapeHtml(plan.title)}">
          <defs>
            <linearGradient id="mainGradient" x1="0%" x2="100%">
              <stop offset="0%" stop-color="${palette.main}" />
              <stop offset="100%" stop-color="${palette.second}" />
            </linearGradient>
          </defs>
          <text x="42" y="58" font-size="26" font-weight="900" fill="#0f172a">${escapeHtml(plan.concept)}</text>
          <g id="visualLayer"></g>
          <text x="42" y="482" font-size="15" fill="#475569">点击运行，观察变量改变后图形、指标和反馈如何同步变化。</text>
        </svg>
        <div class="annotation" id="annotation"></div>
      </section>
      <section class="metrics" id="metrics"></section>
    </main>
  </div>
  <script>
    (function () {
      var config = JSON.parse(document.getElementById('widget-config').textContent);
      var interactionType = ${JSON.stringify(plan.interactionType)};
      var state = Object.assign({}, config.defaultState);
      var sliders = document.getElementById('sliders');
      var metrics = document.getElementById('metrics');
      var layer = document.getElementById('visualLayer');
      var annotation = document.getElementById('annotation');
      var startBtn = document.getElementById('start-btn');
      var resetBtn = document.getElementById('reset-btn');

      function value(name) {
        var number = Number(state[name]);
        return Number.isFinite(number) ? number : 0;
      }

      function renderControls() {
        sliders.innerHTML = '';
        config.variables.forEach(function (variable) {
          var box = document.createElement('div');
          box.className = 'control';
          box.innerHTML = '<label><span>' + escapeHtml(variable.label) + '</span><span id="' + variable.name + '-display"></span></label><input id="' + variable.name + '-slider" data-var="' + variable.name + '" type="range" min="' + variable.min + '" max="' + variable.max + '" step="' + variable.step + '" value="' + value(variable.name) + '" aria-label="' + escapeHtml(variable.label) + '" />';
          sliders.appendChild(box);
          box.querySelector('input').addEventListener('input', function (event) {
            state[variable.name] = Number(event.target.value);
            render();
          });
        });
      }

      function render() {
        var values = config.variables.map(function (variable) { return value(variable.name); });
        var total = values.reduce(function (sum, item) { return sum + item; }, 0);
        var avg = values.length ? total / values.length : 0;
        startBtn.textContent = state.running ? '暂停' : '运行';
        metrics.innerHTML = '<div class="metric" id="metric-total"><span>变量合计</span><strong>' + total.toFixed(2) + '</strong></div><div class="metric"><span>平均水平</span><strong>' + avg.toFixed(2) + '</strong></div><div class="metric"><span>状态</span><strong>' + (state.running ? '运行中' : '已暂停') + '</strong></div>';
        config.variables.forEach(function (variable) {
          var display = document.getElementById(variable.name + '-display');
          var input = document.getElementById(variable.name + '-slider');
          if (display) display.textContent = value(variable.name).toFixed(1) + (variable.unit || '');
          if (input) input.value = value(variable.name);
        });
        if (interactionType === 'mind_map') drawMindMap(avg);
        else if (interactionType === 'game') drawGame(avg);
        else if (interactionType === '3d_visualization') drawSpace(avg);
        else drawSimulation(avg);
      }

      function drawSimulation(avg) {
        var t = (state.time * (0.16 + avg / 38)) % 1;
        var x = 100 + t * 700;
        var y = 335 + Math.sin(t * Math.PI * 4) * (24 + avg * 0.9);
        var dots = '';
        for (var i = 0; i < 8; i += 1) {
          var dx = 120 + ((t * 700 + i * 86) % 680);
          var dy = 218 + Math.sin(state.time * 4 + i) * 36;
          dots += '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="' + (5 + (i % 3)) + '" fill="${palette.second}" opacity="0.58" />';
        }
        layer.innerHTML = '<path id="track" d="M100 340 C220 210, 360 430, 520 280 S730 210, 800 330" fill="none" stroke="url(#mainGradient)" stroke-width="10" stroke-linecap="round" />' + dots + '<circle id="movingObject" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="24" fill="${palette.main}" /><text x="' + (x + 34).toFixed(1) + '" y="' + (y - 20).toFixed(1) + '" font-size="15" font-weight="800" fill="#172033">动态对象</text>';
      }

      function drawMindMap(avg) {
        var labels = ['核心主题', '概念', '变量', '规律', '应用', '问题'];
        var cx = 450;
        var cy = 250;
        var html = '';
        labels.forEach(function (label, index) {
          var angle = index === 0 ? 0 : (Math.PI * 2 * (index - 1) / 5) + state.time * 0.18;
          var radius = index === 0 ? 0 : 145 + avg;
          var x = cx + Math.cos(angle) * radius;
          var y = cy + Math.sin(angle) * radius;
          if (index > 0) html += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#94a3b8" stroke-width="3" />';
          html += '<g id="node-' + index + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (index === 0 ? 60 : 42) + '" fill="${palette.soft}" stroke="${palette.main}" stroke-width="3" /><text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="middle" font-size="15" font-weight="900" fill="#172033">' + label + '</text></g>';
        });
        layer.innerHTML = html;
      }

      function drawGame(avg) {
        var progress = (Math.sin(state.time * 1.8) + 1) / 2;
        var playerX = 120 + progress * 360;
        var gateX = 650 - avg * 4;
        layer.innerHTML = '<rect x="80" y="390" width="740" height="18" rx="9" fill="#cbd5e1" /><circle id="player" cx="' + playerX.toFixed(1) + '" cy="360" r="34" fill="${palette.main}" /><rect id="challenge" x="' + gateX.toFixed(1) + '" y="260" width="84" height="130" rx="10" fill="${palette.soft}" stroke="${palette.main}" stroke-width="4" /><text x="86" y="118" font-size="20" font-weight="900" fill="#172033">调整变量，让角色穿过挑战门。</text><text x="' + gateX.toFixed(1) + '" y="244" font-size="18" font-weight="900" fill="#172033">挑战</text>';
      }

      function drawSpace(avg) {
        var cx = 450;
        var cy = 260;
        var html = '<ellipse id="orbit" cx="' + cx + '" cy="' + cy + '" rx="' + (210 + avg).toFixed(1) + '" ry="82" fill="none" stroke="#94a3b8" stroke-width="3" stroke-dasharray="8 8" /><circle id="core" cx="' + cx + '" cy="' + cy + '" r="56" fill="${palette.soft}" stroke="${palette.main}" stroke-width="4" /><text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" font-size="16" font-weight="900" fill="#172033">核心</text>';
        for (var i = 0; i < 5; i += 1) {
          var angle = state.time * (0.65 + avg / 55) + i * Math.PI * 2 / 5;
          var x = cx + Math.cos(angle) * (210 + avg);
          var y = cy + Math.sin(angle) * 82;
          html += '<circle id="particle-' + i + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="24" fill="${palette.second}" opacity="0.86" /><text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="900" fill="white">点</text>';
        }
        layer.innerHTML = html;
      }

      function tick() {
        if (state.running) state.time += 0.016;
        render();
        requestAnimationFrame(tick);
      }

      function resetWidget() {
        state = Object.assign({}, config.defaultState);
        render();
      }

      function highlight(target, content) {
        document.querySelectorAll('.highlight').forEach(function (node) { node.classList.remove('highlight'); });
        var element = document.querySelector(target);
        if (element) element.classList.add('highlight');
        if (content) {
          annotation.textContent = content;
          annotation.classList.add('show');
          setTimeout(function () { annotation.classList.remove('show'); }, 3200);
        }
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      startBtn.addEventListener('click', function () {
        state.running = !state.running;
        render();
      });
      resetBtn.addEventListener('click', resetWidget);
      window.addEventListener('message', function (event) {
        var message = event.data || {};
        if (message.type === 'SET_WIDGET_STATE') { state = Object.assign(state, message.state || {}); render(); }
        if (message.type === 'HIGHLIGHT_ELEMENT') highlight(message.target, message.content);
        if (message.type === 'ANNOTATE_ELEMENT') highlight(message.target, message.content);
        if (message.type === 'REVEAL_ELEMENT') {
          var element = document.querySelector(message.target);
          if (element) element.hidden = false;
        }
      });

      renderControls();
      resetWidget();
      requestAnimationFrame(tick);
    })();
  </script>
</body>
</html>`;
}

function getPalette(type: DeepInteractionType) {
  if (type === 'game') return { main: '#d97706', second: '#f59e0b', soft: '#fef3c7', wash: '#fffbeb' };
  if (type === 'mind_map') return { main: '#059669', second: '#10b981', soft: '#d1fae5', wash: '#ecfdf5' };
  if (type === '3d_visualization') return { main: '#4f46e5', second: '#8b5cf6', soft: '#e0e7ff', wash: '#eef2ff' };
  return { main: '#2563eb', second: '#06b6d4', soft: '#dbeafe', wash: '#eff6ff' };
}

function typeLabel(type: DeepInteractionType): string {
  if (type === 'game') return '游戏';
  if (type === 'mind_map') return '思维导图';
  if (type === '3d_visualization') return '3D 可视化';
  return '模拟实验';
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
