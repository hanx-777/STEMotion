import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diagnoseActiveRagWidgetInteraction,
  evaluateActiveRagWidgetInteraction,
} from '../src/features/rag/lib/visualization/activeInteractionDiagnostics';

const inertControlsHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>假交互</title></head>
<body>
  <main>
    <section id="visualization">
      <svg viewBox="0 0 120 80" width="240" height="160">
        <circle id="dot" cx="40" cy="40" r="12" fill="#2563eb"></circle>
      </svg>
    </section>
    <section id="controls">
      <button id="start-btn" type="button">开始</button>
      <button id="reset-btn" type="button">重置</button>
      <label>速度 <input id="speed" data-var="speed" type="range" min="1" max="5" value="2"></label>
    </section>
    <section id="metrics">速度：<span id="speed-value">2</span></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"假交互","variables":[{"name":"speed","label":"速度","default":2}],"defaultState":{"speed":2,"running":false},"messageTargets":[{"id":"#visualization","purpose":"主舞台"},{"id":"#metrics","purpose":"指标"}]}</script>
  <script>
    const state = { speed: 2, running: false };
    function draw() {}
    function update() { draw(); }
    document.getElementById('speed').addEventListener('input', function () {
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'speed' }, '*');
      update();
    });
    document.getElementById('start-btn').addEventListener('click', function () {
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'start' }, '*');
      update();
    });
    document.getElementById('reset-btn').addEventListener('click', function () {
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'reset' }, '*');
      update();
    });
    window.addEventListener('error', function (event) {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_ERROR', message: String(event.message) }, '*');
    });
    window.addEventListener('message', function (event) {
      const data = event.data || {};
      if (data.type === 'PING') window.parent.postMessage({ type: 'WIDGET_PONG' }, '*');
      if (data.type === 'SET_WIDGET_STATE') Object.assign(state, data.state || {});
      if (data.type === 'HIGHLIGHT_ELEMENT') document.querySelector(data.target || '#visualization')?.setAttribute('data-highlighted', 'true');
      if (data.type === 'ANNOTATE_ELEMENT') document.querySelector(data.target || '#metrics')?.setAttribute('data-note', data.content || '');
      if (data.type === 'REVEAL_ELEMENT') document.querySelector(data.target || '#visualization')?.removeAttribute('hidden');
    });
    function animate() {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_REPORT', state }, '*');
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
    window.parent.postMessage({ type: 'WIDGET_READY', state }, '*');
  </script>
</body>
</html>`;

const workingControlsHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>真交互</title></head>
<body>
  <main>
    <section id="visualization">
      <svg viewBox="0 0 120 80" width="240" height="160">
        <circle id="dot" cx="40" cy="40" r="12" fill="#2563eb" opacity="0.55"></circle>
      </svg>
    </section>
    <section id="controls">
      <button id="start-btn" type="button">开始</button>
      <button id="reset-btn" type="button">重置</button>
      <label>速度 <input id="speed" data-var="speed" type="range" min="1" max="5" value="2"></label>
    </section>
    <section id="metrics">速度：<span id="speed-value">2</span> 状态：<span id="running-value">false</span></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"真交互","variables":[{"name":"speed","label":"速度","default":2}],"defaultState":{"speed":2,"running":false},"messageTargets":[{"id":"#visualization","purpose":"主舞台"},{"id":"#metrics","purpose":"指标"}]}</script>
  <script>
    const state = { speed: 2, running: false };
    function draw() {
      document.getElementById('dot').setAttribute('r', String(8 + state.speed * 3));
      document.getElementById('dot').setAttribute('opacity', state.running ? '1' : '0.55');
      document.getElementById('speed-value').textContent = String(state.speed);
      document.getElementById('running-value').textContent = String(state.running);
    }
    function update() { draw(); }
    document.getElementById('speed').addEventListener('input', function (event) {
      state.speed = Number(event.target.value);
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'speed', state }, '*');
      update();
    });
    document.getElementById('start-btn').addEventListener('click', function () {
      state.running = !state.running;
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'start', state }, '*');
      update();
    });
    document.getElementById('reset-btn').addEventListener('click', function () {
      state.speed = 2;
      state.running = false;
      document.getElementById('speed').value = '2';
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'reset', state }, '*');
      update();
    });
    window.addEventListener('error', function (event) {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_ERROR', message: String(event.message) }, '*');
    });
    window.addEventListener('message', function (event) {
      const data = event.data || {};
      if (data.type === 'PING') window.parent.postMessage({ type: 'WIDGET_PONG' }, '*');
      if (data.type === 'SET_WIDGET_STATE') Object.assign(state, data.state || {});
      if (data.type === 'HIGHLIGHT_ELEMENT') document.querySelector(data.target || '#visualization')?.setAttribute('data-highlighted', 'true');
      if (data.type === 'ANNOTATE_ELEMENT') document.querySelector(data.target || '#metrics')?.setAttribute('data-note', data.content || '');
      if (data.type === 'REVEAL_ELEMENT') document.querySelector(data.target || '#visualization')?.removeAttribute('hidden');
      update();
    });
    function animate() {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_REPORT', state }, '*');
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
    draw();
    window.parent.postMessage({ type: 'WIDGET_READY', state }, '*');
  </script>
</body>
</html>`;

const workingCanvasHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Canvas 交互</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 12px; padding: 12px; box-sizing: border-box; }
    #visualization { min-height: 320px; border: 1px solid #d1d5db; }
    #controls, #metrics { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    button, input { min-height: 44px; }
    @media (max-width: 640px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section id="visualization">
      <canvas id="canvas-stage" width="360" height="220"></canvas>
    </section>
    <aside>
      <section id="controls">
        <button id="start-btn" type="button">开始</button>
        <button id="reset-btn" type="button">重置</button>
        <label>角度 <input id="angle" data-var="angle" type="range" min="10" max="80" value="30"></label>
      </section>
      <section id="metrics">角度：<span id="angle-value">30</span> 运行：<span id="running-value">false</span></section>
    </aside>
  </main>
  <script type="application/json" id="widget-config">{"concept":"Canvas 抛体","variables":[{"name":"angle","label":"角度","default":30}],"defaultState":{"angle":30,"running":false},"messageTargets":[{"id":"#visualization","purpose":"主舞台"},{"id":"#metrics","purpose":"指标"}]}</script>
  <script>
    const state = { angle: 30, running: false };
    const canvas = document.getElementById('canvas-stage');
    const ctx = canvas.getContext('2d');
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = state.running ? '#dcfce7' : '#eff6ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = state.running ? '#16a34a' : '#2563eb';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(30, 180);
      ctx.lineTo(120 + state.angle, 180 - state.angle);
      ctx.lineTo(280, 170);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(120 + state.angle, 180 - state.angle, 9, 0, Math.PI * 2);
      ctx.fill();
      document.getElementById('angle-value').textContent = String(state.angle);
      document.getElementById('running-value').textContent = String(state.running);
    }
    function update() { draw(); }
    document.getElementById('angle').addEventListener('input', function (event) {
      state.angle = Number(event.target.value);
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'angle', state }, '*');
      update();
    });
    document.getElementById('start-btn').addEventListener('click', function () {
      state.running = !state.running;
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'start', state }, '*');
      update();
    });
    document.getElementById('reset-btn').addEventListener('click', function () {
      state.angle = 30;
      state.running = false;
      document.getElementById('angle').value = '30';
      window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'reset', state }, '*');
      update();
    });
    window.addEventListener('error', function (event) {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_ERROR', message: String(event.message) }, '*');
    });
    window.addEventListener('message', function (event) {
      const data = event.data || {};
      if (data.type === 'PING') window.parent.postMessage({ type: 'WIDGET_PONG' }, '*');
      if (data.type === 'SET_WIDGET_STATE') Object.assign(state, data.state || {});
      if (data.type === 'HIGHLIGHT_ELEMENT') document.querySelector(data.target || '#visualization')?.setAttribute('data-highlighted', 'true');
      if (data.type === 'ANNOTATE_ELEMENT') document.querySelector(data.target || '#metrics')?.setAttribute('data-note', data.content || '');
      if (data.type === 'REVEAL_ELEMENT') document.querySelector(data.target || '#visualization')?.removeAttribute('hidden');
      update();
    });
    function animate() {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_REPORT', state }, '*');
      requestAnimationFrame(animate);
    }
    draw();
    requestAnimationFrame(animate);
    window.parent.postMessage({ type: 'WIDGET_READY', state }, '*');
  </script>
</body>
</html>`;

test('active diagnostics reject controls that acknowledge actions without visible mutation', async () => {
  const diagnostic = await diagnoseActiveRagWidgetInteraction(inertControlsHtml);

  assert.equal(diagnostic.passed, false);
  assert.ok(diagnostic.actionsTested.includes('start'));
  assert.ok(diagnostic.actionsTested.includes('reset'));
  assert.ok(diagnostic.actionsTested.includes('range:speed'));
  assert.match(diagnostic.failureReason ?? '', /visible mutation/i);

  const evaluation = await evaluateActiveRagWidgetInteraction(inertControlsHtml);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.issues.some((issue) => issue.message.includes('可见变化')));
});

test('active diagnostics accept buttons and sliders that mutate stage or metrics', async () => {
  const diagnostic = await diagnoseActiveRagWidgetInteraction(workingControlsHtml);

  assert.equal(diagnostic.passed, true);
  assert.ok(diagnostic.visibleMutations.some((item) => item.startsWith('start:')));
  assert.ok(diagnostic.visibleMutations.some((item) => item.startsWith('reset:')));
  assert.ok(diagnostic.visibleMutations.some((item) => item.startsWith('range:speed:')));
});

test('active diagnostics detect canvas pixel mutations from controls', async () => {
  const diagnostic = await diagnoseActiveRagWidgetInteraction(workingCanvasHtml);

  assert.equal(diagnostic.passed, true);
  assert.ok(
    diagnostic.visibleMutations.some((item) => item.includes('canvas pixels changed')),
    `expected canvas pixel mutation, got: ${diagnostic.visibleMutations.join('; ')}`,
  );
});

test('active diagnostics pass at desktop and narrow mobile viewports', async () => {
  const desktop = await diagnoseActiveRagWidgetInteraction(workingControlsHtml, {
    viewport: { width: 1440, height: 900 },
  });
  const mobile = await diagnoseActiveRagWidgetInteraction(workingCanvasHtml, {
    viewport: { width: 375, height: 812 },
  });

  assert.equal(desktop.passed, true);
  assert.equal(mobile.passed, true);
  assert.ok(mobile.visibleMutations.length >= 3);
});
