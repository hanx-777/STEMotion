import { patchTruncatedHtml, repairMalformedHtml } from '@/lib/generation/htmlSafety';

export interface RagWidgetContractDiagnostic {
  passed: boolean;
  missing: string[];
  warnings: string[];
}

const CONTRACT_MESSAGES = [
  'SET_WIDGET_STATE',
  'HIGHLIGHT_ELEMENT',
  'ANNOTATE_ELEMENT',
  'REVEAL_ELEMENT',
  'WIDGET_READY',
  'WIDGET_RUNTIME_REPORT',
  'WIDGET_RUNTIME_ERROR',
  'WIDGET_PONG',
  'WIDGET_ACTION_ACK',
] as const;

export function diagnoseRagWidgetContract(html: string): RagWidgetContractDiagnostic {
  const source = html.trim();
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!source.startsWith('<!DOCTYPE html>')) missing.push('doctype');
  if (!/<\/html>/i.test(source)) missing.push('closing html');
  if (!/<script\s+type=["']application\/json["']\s+id=["']widget-config["'][^>]*>/i.test(source)) {
    missing.push('widget-config');
  }
  if (!/\bid=["']visualization["']/i.test(source)) missing.push('#visualization');
  if (!/\bid=["']controls["']/i.test(source)) missing.push('#controls');
  if (!/\bid=["']metrics["']/i.test(source)) missing.push('#metrics');
  if (!/window\.addEventListener\s*\(\s*["']message["']/i.test(source)) missing.push('message listener');
  if (!/requestAnimationFrame\s*\(/i.test(source)) missing.push('requestAnimationFrame');
  if (!/window\.addEventListener\s*\(\s*["']error["']/i.test(source)) missing.push('error listener');

  for (const message of CONTRACT_MESSAGES) {
    if (!source.includes(message)) missing.push(message);
  }

  const hasStartButton = /\bid=["']start-btn["']/i.test(source) || /data-action=["']start["']/i.test(source);
  const hasResetButton = /\bid=["']reset-btn["']/i.test(source) || /data-action=["']reset["']/i.test(source);
  if (!hasStartButton) missing.push('start button');
  if (!hasResetButton) missing.push('reset button');

  const hasClickListener = /addEventListener\s*\(\s*["']click["']/i.test(source) || /onclick\s*=/i.test(source);
  if ((hasStartButton || hasResetButton) && !hasClickListener) missing.push('button click listener');

  const hasRangeInput = /<input[^>]*type=["']range["']/i.test(source);
  const hasInputListener = /addEventListener\s*\(\s*["']input["']/i.test(source)
    || /addEventListener\s*\(\s*["']change["']/i.test(source);
  if (hasRangeInput && !hasInputListener) missing.push('range input listener');

  const hasCanvas = /<canvas\b/i.test(source) || /getContext\s*\(\s*["']2d["']\)/i.test(source);
  const hasSvg = /<svg\b/i.test(source);
  if (!hasCanvas && !hasSvg) warnings.push('no Canvas/SVG visual object detected');
  if (hasCanvas && !/fillRect|stroke\(|beginPath|drawImage|arc\(|fill\(|clearRect/i.test(source)) {
    missing.push('canvas drawing operations');
  }

  return {
    passed: missing.length === 0,
    missing: Array.from(new Set(missing)),
    warnings: Array.from(new Set(warnings)),
  };
}

export function formatRagWidgetContractForPrompt(diagnostic: RagWidgetContractDiagnostic): string {
  const missing = diagnostic.missing.length ? diagnostic.missing.map((item) => `- ${item}`).join('\n') : '- 无';
  const warnings = diagnostic.warnings.length ? diagnostic.warnings.map((item) => `- ${item}`).join('\n') : '- 无';
  return `## RAG Widget Contract 诊断
通过：${diagnostic.passed ? '是' : '否'}
缺失项：
${missing}
警告：
${warnings}`;
}

export function ensureRagWidgetContractHtml(html: string): string {
  let fixed = repairMalformedHtml(html.trim());
  const diagnostic = diagnoseRagWidgetContract(fixed);
  if (diagnostic.passed) return fixed;

  fixed = ensureBasicSections(fixed);
  fixed = patchTruncatedHtml(fixed);
  fixed = injectContractRuntime(fixed);
  return repairMalformedHtml(fixed);
}

function ensureBasicSections(html: string): string {
  let fixed = html.trim();
  if (!fixed.startsWith('<!DOCTYPE html>')) fixed = `<!DOCTYPE html>\n${fixed}`;
  if (!/<html\b/i.test(fixed)) fixed = fixed.replace(/^<!DOCTYPE html>\s*/i, '<!DOCTYPE html>\n<html lang="zh-CN">\n');
  if (!/<body\b/i.test(fixed)) fixed = fixed.replace(/<html([^>]*)>/i, '<html$1>\n<body>');

  fixed = ensureElement(fixed, 'visualization', '<section id="visualization" data-role="simulation-main"></section>');
  fixed = ensureElement(fixed, 'controls', '<section id="controls" data-role="control-panel"><button id="start-btn" type="button">开始</button><button id="reset-btn" type="button">重置</button></section>');
  fixed = ensureElement(fixed, 'metrics', '<section id="metrics" data-role="observation-panel"></section>');

  if (!/\bid=["']start-btn["']/i.test(fixed)) {
    fixed = insertBeforeSectionEnd(fixed, 'controls', '<button id="start-btn" type="button">开始</button>');
  }
  if (!/\bid=["']reset-btn["']/i.test(fixed)) {
    fixed = insertBeforeSectionEnd(fixed, 'controls', '<button id="reset-btn" type="button">重置</button>');
  }
  if (!/<script\s+type=["']application\/json["']\s+id=["']widget-config["'][^>]*>/i.test(fixed)) {
    fixed = insertBeforeBodyEnd(fixed, '<script type="application/json" id="widget-config">{"concept":"RAG 可视化","variables":[],"defaultState":{"running":false},"messageTargets":[{"id":"#visualization","purpose":"主舞台"},{"id":"#controls","purpose":"控制区"},{"id":"#metrics","purpose":"指标区"}]}</script>');
  }

  if (!/<\/body>/i.test(fixed)) fixed += '\n</body>';
  if (!/<\/html>/i.test(fixed)) fixed += '\n</html>';
  return fixed;
}

function ensureElement(html: string, id: string, markup: string): string {
  if (new RegExp(`\\bid=["']${id}["']`, 'i').test(html)) return html;
  return insertAfterBodyStart(html, markup);
}

function insertBeforeSectionEnd(html: string, id: string, markup: string): string {
  const pattern = new RegExp(`(<section[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?)(</section>)`, 'i');
  if (!pattern.test(html)) return insertAfterBodyStart(html, markup);
  return html.replace(pattern, `$1${markup}$2`);
}

function injectContractRuntime(html: string): string {
  const diagnostic = diagnoseRagWidgetContract(html);
  if (diagnostic.passed) return html;

  const script = `<script data-rag-widget-contract="true">
(function(){
  var widgetState = window.widgetState && typeof window.widgetState === 'object' ? window.widgetState : { running: false };
  window.widgetState = widgetState;
  var visibleMutationTick = 0;
  function readConfig(){
    try {
      var cfgEl = document.getElementById('widget-config');
      if (!cfgEl) return {};
      return JSON.parse(cfgEl.textContent || '{}');
    } catch (error) {
      return {};
    }
  }
  function resetFromConfig(){
    var cfg = readConfig();
    widgetState = Object.assign({ running: false }, cfg.defaultState || {}, widgetState);
    window.widgetState = widgetState;
  }
  function markVisibleMutation(action){
    visibleMutationTick += 1;
    widgetState.__lastAction = action;
    widgetState.__visibleMutationTick = visibleMutationTick;
  }
  function setDisplayValue(key, value){
    document.querySelectorAll('[data-display="' + key + '"], #' + key + '-value, .' + key + '-value').forEach(function(el){
      el.textContent = String(value);
    });
  }
  function reflectVisibleState(){
    Object.keys(widgetState).forEach(function(key){ setDisplayValue(key, widgetState[key]); });
    var stage = document.getElementById('visualization');
    if (stage) {
      stage.setAttribute('data-running', widgetState.running ? 'true' : 'false');
      stage.setAttribute('data-last-action', String(widgetState.__lastAction || 'init'));
      stage.setAttribute('data-state-signature', JSON.stringify(widgetState).slice(0, 240));
    }
    var metrics = document.getElementById('metrics');
    if (metrics) {
      var status = document.getElementById('rag-contract-visible-state');
      if (!status) {
        status = document.createElement('span');
        status.id = 'rag-contract-visible-state';
        status.setAttribute('data-display', '__visibleMutationTick');
        metrics.appendChild(status);
      }
      status.textContent = '状态 ' + (widgetState.__lastAction || 'init') + ' #' + visibleMutationTick;
    }
  }
  var previousDraw = typeof window.draw === 'function' ? window.draw : null;
  window.draw = function(){
    if (previousDraw) previousDraw();
    reflectVisibleState();
  };
  window.update = function(){ window.draw(); };
  resetFromConfig();
  reflectVisibleState();
  document.querySelectorAll('input[type="range"]').forEach(function(input){
    var key = input.getAttribute('data-var') || input.id || input.name;
    input.addEventListener('input', function(){
      var value = Number(input.value);
      if (key) widgetState[key] = Number.isFinite(value) ? value : input.value;
      markVisibleMutation('range:' + (key || 'slider'));
      window.update();
    });
    input.addEventListener('change', function(){ markVisibleMutation('change:' + (key || 'slider')); window.update(); });
  });
  var startBtn = document.getElementById('start-btn') || document.querySelector('[data-action="start"]');
  var resetBtn = document.getElementById('reset-btn') || document.querySelector('[data-action="reset"]');
  if (startBtn) startBtn.addEventListener('click', function(){
    widgetState.running = !widgetState.running;
    markVisibleMutation('start');
    window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'start', state: widgetState }, '*');
    window.update();
  });
  if (resetBtn) resetBtn.addEventListener('click', function(){
    var cfg = readConfig();
    widgetState = Object.assign({ running: false }, cfg.defaultState || {});
    window.widgetState = widgetState;
    markVisibleMutation('reset');
    document.querySelectorAll('input[type="range"]').forEach(function(input){
      var key = input.getAttribute('data-var') || input.id || input.name;
      if (key && widgetState[key] !== undefined) input.value = widgetState[key];
    });
    window.parent.postMessage({ type: 'WIDGET_ACTION_ACK', action: 'reset', state: widgetState }, '*');
    window.update();
  });
  window.addEventListener('error', function(event){
    window.parent.postMessage({ type: 'WIDGET_RUNTIME_ERROR', message: String(event.message || event.error || 'runtime error') }, '*');
  });
  window.addEventListener('message', function(event){
    var data = event.data || {};
    if (data.type === 'PING') window.parent.postMessage({ type: 'WIDGET_PONG', state: widgetState }, '*');
    if (data.type === 'SET_WIDGET_STATE' && data.state) { Object.assign(widgetState, data.state); window.update(); }
    if (data.type === 'HIGHLIGHT_ELEMENT') {
      var hTarget = document.querySelector(data.target || '#visualization');
      if (hTarget) { hTarget.style.outline = '3px solid #2563eb'; hTarget.style.outlineOffset = '3px'; }
    }
    if (data.type === 'ANNOTATE_ELEMENT') {
      var aTarget = document.querySelector(data.target || '#metrics');
      if (aTarget && data.content) aTarget.setAttribute('data-note', data.content);
    }
    if (data.type === 'REVEAL_ELEMENT') {
      var rTarget = document.querySelector(data.target || '#visualization');
      if (rTarget) rTarget.removeAttribute('hidden');
    }
  });
  function animate(){
    try {
      if (typeof window.render === 'function') window.render(widgetState);
      else window.update();
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_REPORT', state: widgetState }, '*');
    } catch (error) {
      window.parent.postMessage({ type: 'WIDGET_RUNTIME_ERROR', message: String(error && error.message ? error.message : error) }, '*');
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  window.parent.postMessage({ type: 'WIDGET_READY', state: widgetState }, '*');
})();
</script>`;

  return insertBeforeBodyEnd(html, script);
}

function insertAfterBodyStart(html: string, markup: string): string {
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>\n${markup}`);
  }
  return `${markup}\n${html}`;
}

function insertBeforeBodyEnd(html: string, markup: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${markup}\n</body>`);
  }
  return `${html}\n${markup}`;
}
