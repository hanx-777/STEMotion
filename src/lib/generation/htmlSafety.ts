import { createLogger } from '@/lib/logger';

const log = createLogger('html');

export interface HtmlSafetyResult {
  ok: boolean;
  errors: string[];
}

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/<iframe\b/i, 'Nested iframes are not allowed inside generated widgets.'],
  [/\bfetch\s*[\(\.]/i, 'fetch() is not allowed in generated widgets.'],
  [/\bXMLHttpRequest\b/i, 'XMLHttpRequest is not allowed in generated widgets.'],
  [/\bWebSocket\b/i, 'WebSocket is not allowed in generated widgets.'],
  [/\bEventSource\b/i, 'EventSource is not allowed in generated widgets.'],
  [/\bnavigator\.sendBeacon\b/i, 'sendBeacon is not allowed in generated widgets.'],
  [/\bdocument\.cookie\b/i, 'document.cookie is not allowed in generated widgets.'],
  [/\bwindow\.open\s*\(/i, 'window.open is not allowed in generated widgets.'],
  [/\beval\s*\(/i, 'eval() is not allowed in generated widgets.'],
  [/\bnew\s+Function\s*\(/i, 'new Function() is not allowed in generated widgets.'],
  [/\bimport\s*\(/i, 'Dynamic import() is not allowed in generated widgets.'],
  [/\blocalStorage\b/i, 'localStorage is not allowed in generated widgets.'],
  [/\bsessionStorage\b/i, 'sessionStorage is not allowed in generated widgets.'],
];

const REQUIRED_MESSAGES = [
  'SET_WIDGET_STATE',
  'HIGHLIGHT_ELEMENT',
  'ANNOTATE_ELEMENT',
  'REVEAL_ELEMENT',
];

export function validateInteractiveHtml(html: string): HtmlSafetyResult {
  const errors: string[] = [];
  const trimmed = html.trim();

  if (!trimmed.startsWith('<!DOCTYPE html>')) {
    errors.push('HTML must start with exactly one <!DOCTYPE html>.');
  }

  if ((trimmed.match(/<!DOCTYPE html>/gi) ?? []).length !== 1) {
    errors.push('HTML must contain exactly one <!DOCTYPE html>.');
  }

  if ((trimmed.match(/<\/html>/gi) ?? []).length !== 1) {
    errors.push('HTML must contain exactly one closing </html> tag.');
  }

  if (!/<script\s+type=["']application\/json["']\s+id=["']widget-config["'][^>]*>/i.test(trimmed)) {
    errors.push('HTML must include <script type="application/json" id="widget-config">.');
  }

  if (!/window\.addEventListener\s*\(\s*["']message["']/i.test(trimmed)) {
    errors.push('HTML must listen for postMessage teacher actions.');
  }

  if (!/requestAnimationFrame\s*\(/i.test(trimmed)) {
    errors.push('HTML must use requestAnimationFrame for visible animation.');
  }

  for (const messageType of REQUIRED_MESSAGES) {
    if (!trimmed.includes(messageType)) {
      errors.push(`HTML must implement ${messageType}.`);
    }
  }

  for (const [pattern, message] of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      errors.push(message);
    }
  }

  // Interactive JS completeness checks (catch truncated HTML that passes structural validation)
  const hasRangeInput = /<input[^>]*type=["']range["']/i.test(trimmed);
  const hasInputListener = /addEventListener\s*\(\s*['"]input['"]/i.test(trimmed)
    || /addEventListener\s*\(\s*['"]change['"]/i.test(trimmed);
  if (hasRangeInput && !hasInputListener) {
    errors.push('HTML has range inputs but no input/change event listeners.');
  }

  const hasCanvas = /getContext\s*\(\s*['"]2d['"]\)/i.test(trimmed);
  const hasDrawing = /fillRect|stroke\(|beginPath|drawImage|arc\(|fill\(|clearRect/i.test(trimmed);
  if (hasCanvas && !hasDrawing) {
    errors.push('HTML has canvas but no drawing operations.');
  }

  if (errors.length > 0) {
    log.warn('HTML validation failed', { errors, htmlChars: trimmed.length });
  }
  return { ok: errors.length === 0, errors };
}

export function assertSafeInteractiveHtml(html: string) {
  const result = validateInteractiveHtml(html);
  if (!result.ok) {
    throw new Error(`HTML safety validation failed: ${result.errors.join(' ')}`);
  }
}

// --- Truncation diagnostics ---

export interface HtmlDiagnostic {
  isTruncated: boolean;
  missingInteractivity: boolean;
  details: string[];
}

export function diagnoseHtmlCompleteness(html: string): HtmlDiagnostic {
  const details: string[] = [];
  const trimmed = html.trim();

  // 1. Structural truncation
  const hasClosingHtml = /<\/html>/i.test(trimmed);
  const openScripts = (trimmed.match(/<script\b/gi) ?? []).length;
  const closeScripts = (trimmed.match(/<\/script>/gi) ?? []).length;
  const scriptBalanced = openScripts === closeScripts;

  if (!hasClosingHtml) {
    details.push('缺少 </html> 闭合标签');
  }
  if (!scriptBalanced) {
    details.push(`<script> 标签未闭合（${openScripts} 开 ${closeScripts} 闭）`);
  }

  const isTruncated = !hasClosingHtml || !scriptBalanced;

  // 2. Interactive JS completeness
  const hasInputListener = /addEventListener\s*\(\s*['"]input['"]/i.test(trimmed)
    || /addEventListener\s*\(\s*['"]change['"]/i.test(trimmed);
  const hasCanvas = /getContext\s*\(\s*['"]2d['"]\)/i.test(trimmed);
  const hasDrawing = /fillRect|stroke\(|beginPath|drawImage|arc\(|fill\(|clearRect/i.test(trimmed);
  const hasUpdateFn = /function\s+(update|render|draw|redraw|animate)\b/i.test(trimmed)
    || /(?:const|let|var)\s+(update|render|draw|redraw|animate)\s*=/i.test(trimmed);
  const hasWidgetReady = /WIDGET_READY/i.test(trimmed);
  const hasBtnListener = /addEventListener\s*\(\s*['"]click['"]/i.test(trimmed)
    || /onclick\s*=/i.test(trimmed);
  const hasRangeInput = /<input[^>]*type=["']range["']/i.test(trimmed);

  if (hasRangeInput && !hasInputListener) {
    details.push('有 range input 控件但缺少 input/change 事件监听器');
  }
  if (hasCanvas && !hasDrawing) {
    details.push('有 canvas 但缺少绘制操作（fillRect/stroke/beginPath 等）');
  }
  if (!hasUpdateFn) {
    details.push('缺少 update/render/draw 状态更新函数');
  }
  if (!hasWidgetReady) {
    details.push('缺少 WIDGET_READY postMessage 上报');
  }
  if (!hasBtnListener && (/<button/i.test(trimmed) || /<input[^>]*type=["']button["']/i.test(trimmed))) {
    details.push('有按钮但缺少 click 事件监听器');
  }

  const missingInteractivity = details.length > 0;

  if (isTruncated || missingInteractivity) {
    log.warn('HTML completeness diagnostic', { isTruncated, missingInteractivity, details });
  }

  return { isTruncated, missingInteractivity, details };
}

/**
 * Patch truncated HTML output from the LLM by injecting missing infrastructure.
 * This handles the common case where the model runs out of tokens before writing
 * the closing tags and message handler JavaScript.
 */
export function patchTruncatedHtml(html: string): string {
  let patched = html.trim();

  // If the HTML was cut off mid-tag, try to close the last open tag
  // Remove any trailing incomplete tag like `<div class="foo`
  patched = patched.replace(/<[^>]*$/, '');

  // Check what's missing
  const hasClosingHtml = /<\/html>/i.test(patched);
  const hasMessageListener = /window\.addEventListener\s*\(\s*["']message["']/i.test(patched);
  const hasRAF = /requestAnimationFrame\s*\(/i.test(patched);
  const hasSetWidgetState = patched.includes('SET_WIDGET_STATE');
  const hasHighlight = patched.includes('HIGHLIGHT_ELEMENT');
  const hasAnnotate = patched.includes('ANNOTATE_ELEMENT');
  const hasReveal = patched.includes('REVEAL_ELEMENT');

  const needsMessageHandler = !hasMessageListener || !hasSetWidgetState || !hasHighlight || !hasAnnotate || !hasReveal;

  // Check interactive JS completeness
  const hasRangeInput = /<input[^>]*type=["']range["']/i.test(patched);
  const hasInputListener = /addEventListener\s*\(\s*['"]input['"]/i.test(patched)
    || /addEventListener\s*\(\s*['"]change['"]/i.test(patched);
  const hasCanvas = /getContext\s*\(\s*['"]2d['"]\)/i.test(patched);
  const hasDrawing = /fillRect|stroke\(|beginPath|drawImage|arc\(|fill\(|clearRect/i.test(patched);
  const hasUpdateFn = /function\s+(update|render|draw|redraw|animate)\b/i.test(patched)
    || /(?:const|let|var)\s+(update|render|draw|redraw|animate)\s*=/i.test(patched);
  const hasWidgetReady = /WIDGET_READY/i.test(patched);
  const hasBtnListener = /addEventListener\s*\(\s*['"]click['"]/i.test(patched)
    || /onclick\s*=/i.test(patched);

  const needsInteractiveSkeleton = (hasRangeInput && !hasInputListener)
    || (hasCanvas && !hasDrawing)
    || !hasUpdateFn
    || !hasWidgetReady
    || (!hasBtnListener && (/<button/i.test(patched) || /<input[^>]*type=["']button["']/i.test(patched)));

  if (!needsMessageHandler && hasRAF && hasClosingHtml && !needsInteractiveSkeleton) {
    return patched; // Nothing to patch
  }

  const missing: string[] = [];
  if (!hasRAF) missing.push('requestAnimationFrame');
  if (needsMessageHandler) missing.push('messageHandler');
  if (needsInteractiveSkeleton) missing.push('interactiveSkeleton');
  if (!hasClosingHtml) missing.push('</html>');
  log.info('Patching truncated HTML', { missing, htmlChars: html.length });

  // Build the patch script
  const parts: string[] = [];

  if (!hasRAF) {
    parts.push(`  // Fallback animation loop
  (function rafLoop() { requestAnimationFrame(rafLoop); })();`);
  }

  if (needsMessageHandler) {
    parts.push(`  // Teacher action message handler (auto-patched)
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || !data.type) return;
    switch (data.type) {
      case 'SET_WIDGET_STATE':
        if (data.state && typeof data.state === 'object') {
          Object.keys(data.state).forEach(function(key) {
            var el = document.querySelector('[data-var="' + key + '"]') || document.getElementById(key);
            if (el && el.tagName === 'INPUT') el.value = data.state[key];
          });
        }
        break;
      case 'HIGHLIGHT_ELEMENT':
        var hTarget = document.querySelector(data.target || '#visualization');
        if (hTarget) {
          hTarget.style.outline = '3px solid #f59e0b';
          hTarget.style.outlineOffset = '2px';
          setTimeout(function() { hTarget.style.outline = ''; hTarget.style.outlineOffset = ''; }, 2000);
        }
        break;
      case 'ANNOTATE_ELEMENT':
        var aTarget = document.querySelector(data.target || '#visualization');
        if (aTarget && data.content) {
          var ann = document.createElement('div');
          ann.textContent = data.content;
          ann.style.cssText = 'position:absolute;background:#fef3c7;border:1px solid #f59e0b;padding:4px 8px;border-radius:4px;font-size:12px;z-index:9999;top:0;left:0;';
          aTarget.style.position = 'relative';
          aTarget.appendChild(ann);
          setTimeout(function() { ann.remove(); }, 3000);
        }
        break;
      case 'REVEAL_ELEMENT':
        var rTarget = document.querySelector(data.target || '#visualization');
        if (rTarget) {
          rTarget.style.opacity = '0';
          rTarget.style.transition = 'opacity 0.5s';
          setTimeout(function() { rTarget.style.opacity = '1'; }, 50);
        }
        break;
    }
  });`);
  }

  // Inject interactive skeleton when JS interactivity is missing
  if (needsInteractiveSkeleton) {
    const skeletonParts: string[] = [];

    // State management from widget-config
    skeletonParts.push(`  // Interactive skeleton (auto-patched)
  var widgetState = {};
  try {
    var cfgEl = document.getElementById('widget-config');
    if (cfgEl) {
      var cfg = JSON.parse(cfgEl.textContent);
      if (cfg.defaultState) widgetState = JSON.parse(JSON.stringify(cfg.defaultState));
      if (cfg.variables) {
        cfg.variables.forEach(function(v) {
          if (v.name && v.default !== undefined) widgetState[v.name] = v.default;
        });
      }
    }
  } catch(e) { console.warn('widget-config parse error', e); }`);

    // Range input listeners
    if (hasRangeInput && !hasInputListener) {
      skeletonParts.push(`
  // Auto-bound range input listeners
  document.querySelectorAll('input[type=range]').forEach(function(slider) {
    var varName = slider.getAttribute('data-var') || slider.id || slider.name;
    slider.addEventListener('input', function() {
      var val = parseFloat(slider.value);
      if (varName) widgetState[varName] = val;
      var label = slider.parentElement.querySelector('.value-label, .slider-value, [data-value]');
      if (label) label.textContent = val;
      if (typeof window.update === 'function') window.update();
      if (typeof window.draw === 'function') window.draw();
      if (typeof window.render === 'function') window.render();
    });
  });`);
    }

    // Button click listeners
    if (!hasBtnListener) {
      skeletonParts.push(`
  // Auto-bound button listeners
  var startBtn = document.querySelector('#start-btn, #startBtn, [data-action=start], button:first-of-type');
  var resetBtn = document.querySelector('#reset-btn, #resetBtn, [data-action=reset], button:last-of-type');
  var isRunning = false;
  if (startBtn) {
    startBtn.addEventListener('click', function() {
      isRunning = !isRunning;
      startBtn.textContent = isRunning ? '暂停' : '开始';
      if (typeof window.update === 'function') window.update();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      isRunning = false;
      if (startBtn) startBtn.textContent = '开始';
      try {
        var cfg2 = JSON.parse(document.getElementById('widget-config').textContent);
        if (cfg2.defaultState) widgetState = JSON.parse(JSON.stringify(cfg2.defaultState));
        if (cfg2.variables) {
          cfg2.variables.forEach(function(v) {
            if (v.name && v.default !== undefined) widgetState[v.name] = v.default;
          });
        }
        document.querySelectorAll('input[type=range]').forEach(function(s) {
          var vn = s.getAttribute('data-var') || s.id;
          if (vn && widgetState[vn] !== undefined) s.value = widgetState[vn];
        });
      } catch(e) {}
      if (typeof window.update === 'function') window.update();
      if (typeof window.draw === 'function') window.draw();
      if (typeof window.render === 'function') window.render();
    });
  }`);
    }

    // Empty update/draw stubs if missing
    if (!hasUpdateFn) {
      skeletonParts.push(`
  // Stub update/draw functions (override these with actual logic)
  window.update = function() {
    // Read widgetState and update DOM elements
    Object.keys(widgetState).forEach(function(key) {
      var displays = document.querySelectorAll('[data-display="' + key + '"], #' + key + '-value, .' + key + '-value');
      displays.forEach(function(el) { el.textContent = widgetState[key]; });
    });
  };
  window.draw = function() {
    // Redraw canvas content based on widgetState
    var canvas = document.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Placeholder: actual drawing logic should be provided by the generator
  };`);
    }

    // WIDGET_READY postMessage
    if (!hasWidgetReady) {
      skeletonParts.push(`
  // WIDGET_READY notification
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'WIDGET_READY', state: widgetState }, '*');
  }`);
    }

    parts.push(skeletonParts.join('\n'));
  }

  if (parts.length === 0 && hasClosingHtml) {
    return patched;
  }

  const scriptBlock = `<script>\n${parts.join('\n')}\n</script>`;

  // Remove existing closing tags so we can re-append them properly
  patched = patched.replace(/<\/body>\s*<\/html>\s*$/i, '');
  patched = patched.replace(/<\/html>\s*$/i, '');
  patched = patched.replace(/<\/body>\s*$/i, '');

  // Close any unclosed script tags (truncation mid-script)
  const openScripts = (patched.match(/<script\b/gi) ?? []).length;
  const closeScripts = (patched.match(/<\/script>/gi) ?? []).length;
  if (openScripts > closeScripts) {
    patched += '\n</script>';
  }

  patched += `\n${scriptBlock}\n</body>\n</html>`;
  return patched;
}

export function extractWidgetConfig(html: string): Record<string, unknown> {
  const match = html.match(
    /<script\s+type=["']application\/json["']\s+id=["']widget-config["'][^>]*>([\s\S]*?)<\/script>/i,
  );

  if (!match?.[1]) {
    log.error('Missing widget-config JSON script in generated HTML');
    throw new Error('Missing widget-config JSON script.');
  }

  const rawConfig = match[1].trim();
  log.debug('Extracting widget-config', { rawLength: rawConfig.length });
  const jsonContent = rawConfig.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return JSON.parse(jsonContent);
}

export function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  // Try matching complete fences (opening and closing ```)
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  // Handle case where opening fence exists but closing is missing (truncated output)
  const openOnly = trimmed.match(/^```(?:html)?\s*\n([\s\S]+)$/i);
  if (openOnly?.[1]) return openOnly[1].trim();
  return trimmed;
}

/**
 * Repair common malformed HTML patterns produced by LLMs.
 * Called after stripMarkdownCodeFence and before assertSafeInteractiveHtml.
 */
export function repairMalformedHtml(html: string): string {
  let result = html;

  // Fix broken meta tags: <meta charset="UTF-8"> name="viewport" content="..."
  // This pattern occurs when the model merges two meta tags into one malformed line
  result = result.replace(
    /<meta\s+charset=["']([^"']+)["']\s*>\s*name=["']viewport["']\s+content=["']([^"']+)["']\s*>/gi,
    '<meta charset="$1">\n<meta name="viewport" content="$2">',
  );

  // Fix another variant: <meta charset="UTF-8" name="viewport" content="...">
  // (attributes that should be on separate meta tags merged into one)
  result = result.replace(
    /<meta\s+charset=["']([^"']+)["']\s+name=["']viewport["']\s+content=["']([^"']+)["']\s*\/?>/gi,
    '<meta charset="$1">\n<meta name="viewport" content="$2">',
  );

  // Remove duplicate <!DOCTYPE html> declarations (keep only the first)
  const doctypeMatches = result.match(/<!DOCTYPE html>/gi);
  if (doctypeMatches && doctypeMatches.length > 1) {
    let first = true;
    result = result.replace(/<!DOCTYPE html>/gi, (match) => {
      if (first) {
        first = false;
        return match;
      }
      return '';
    });
  }

  // Remove duplicate </html> tags (keep only the last)
  const closingHtmlMatches = result.match(/<\/html>/gi);
  if (closingHtmlMatches && closingHtmlMatches.length > 1) {
    let count = 0;
    const total = closingHtmlMatches.length;
    result = result.replace(/<\/html>/gi, (match) => {
      count++;
      return count === total ? match : '';
    });
  }

  // Fix unclosed <meta> tags that have trailing attributes outside the tag
  // e.g., <meta charset="UTF-8">\n name="viewport" content="width=device-width, initial-scale=1.0">
  result = result.replace(
    /(<meta\s+charset=["'][^"']+["']\s*>)\s*\n?\s*name=["']([^"']+)["']\s+content=["']([^"']+)["']\s*>/gi,
    '$1\n<meta name="$2" content="$3">',
  );

  return result;
}
