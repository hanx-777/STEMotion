import { createLogger } from '@/lib/logger';
import type { AgentEvaluation, AgentIssue } from '@/features/deep-interaction/lib/types';

const log = createLogger('rag-active-interaction');

let issueCounter = 0;

export interface ActiveInteractionDiagnostics {
  passed: boolean;
  actionsTested: string[];
  visibleMutations: string[];
  warnings: string[];
  failureReason?: string;
  elapsedMs?: number;
}

interface ActiveInteractionOptions {
  timeoutMs?: number;
  settleMs?: number;
  viewport?: {
    width: number;
    height: number;
  };
}

interface VisibleSnapshot {
  visualizationHtml: string;
  visualizationText: string;
  metricsHtml: string;
  metricsText: string;
  bodyState: string;
  canvasFrames: string[];
}

type PlaywrightPage = import('playwright').Page;
type PlaywrightBrowser = import('playwright').Browser;

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_SETTLE_MS = 180;
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };

export async function diagnoseActiveRagWidgetInteraction(
  html: string,
  options: ActiveInteractionOptions = {},
): Promise<ActiveInteractionDiagnostics> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const actionsTested: string[] = [];
  const visibleMutations: string[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  let browser: PlaywrightBrowser | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: options.viewport ?? DEFAULT_VIEWPORT });
    page.setDefaultTimeout(timeoutMs);
    page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') warnings.push(`console error: ${message.text().slice(0, 160)}`);
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(settleMs);

    const startResult = await testButtonMutation(page, {
      actionName: 'start',
      selectors: ['#start-btn', '[data-action="start"]'],
      textPattern: /开始|启动|播放|运行|start|run|play/i,
      settleMs,
    });
    recordActionResult(startResult, actionsTested, visibleMutations, failures);

    const resetResult = await testButtonMutation(page, {
      actionName: 'reset',
      selectors: ['#reset-btn', '[data-action="reset"]'],
      textPattern: /重置|复位|reset|restart/i,
      settleMs,
    });
    recordActionResult(resetResult, actionsTested, visibleMutations, failures);

    const rangeResults = await testRangeMutations(page, settleMs);
    for (const result of rangeResults) {
      recordActionResult(result, actionsTested, visibleMutations, failures);
    }
    if (rangeResults.length === 0) {
      warnings.push('No range slider found; button interactions were still checked.');
    }

    if (actionsTested.length === 0) {
      failures.push('No actionable start/reset/range control was found for active interaction testing.');
    }

    const passed = failures.length === 0;
    return {
      passed,
      actionsTested,
      visibleMutations,
      warnings,
      failureReason: passed ? undefined : failures.join(' '),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('Active interaction diagnostic failed', { error: message });
    return {
      passed: false,
      actionsTested,
      visibleMutations,
      warnings: [...warnings, message],
      failureReason: `Active browser interaction diagnostic could not complete: ${message}`,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function evaluateActiveRagWidgetInteraction(html: string): Promise<AgentEvaluation> {
  const diagnostic = await diagnoseActiveRagWidgetInteraction(html);
  return activeInteractionDiagnosticsToEvaluation(diagnostic);
}

export function activeInteractionDiagnosticsToEvaluation(
  diagnostic: ActiveInteractionDiagnostics,
): AgentEvaluation {
  const issues: AgentIssue[] = diagnostic.passed
    ? []
    : [{
        id: `active_interaction_${++issueCounter}`,
        severity: 'critical',
        category: 'runtime',
        message: '主动交互验收未通过：按钮或滑块没有产生可见变化。',
        evidence: diagnostic.failureReason,
        suggestion: `${formatActiveInteractionDiagnosticsForPrompt(diagnostic)}\n修复 HTML：为 start/reset/slider 补齐真实状态机，使 #visualization 或 #metrics 在每次操作后发生可见变化；禁止只发送 ACK、alert()、console.log()、hover 效果或空事件监听。`,
        target: 'html',
      }];

  const score = diagnostic.passed ? 96 : 42;
  return {
    agentName: 'Active Interaction Evaluator',
    score,
    passed: diagnostic.passed,
    summary: diagnostic.passed
      ? `主动交互验收通过：${diagnostic.visibleMutations.join('；') || '控件产生了可见变化'}。`
      : `主动交互验收失败：${diagnostic.failureReason ?? '控件未产生可见变化'}。`,
    issues,
    durationMs: diagnostic.elapsedMs,
  };
}

export function formatActiveInteractionDiagnosticsForPrompt(
  diagnostic: ActiveInteractionDiagnostics,
): string {
  const actions = diagnostic.actionsTested.length ? diagnostic.actionsTested.map((item) => `- ${item}`).join('\n') : '- 无';
  const mutations = diagnostic.visibleMutations.length ? diagnostic.visibleMutations.map((item) => `- ${item}`).join('\n') : '- 无';
  const warnings = diagnostic.warnings.length ? diagnostic.warnings.map((item) => `- ${item}`).join('\n') : '- 无';
  return `## Active Interaction 诊断
通过：${diagnostic.passed ? '是' : '否'}
已测试动作：
${actions}
可见变化：
${mutations}
失败原因：${diagnostic.failureReason ?? '无'}
警告：
${warnings}`;
}

async function launchChromium(chromium: typeof import('playwright').chromium): Promise<PlaywrightBrowser> {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

interface ActionResult {
  actionName: string;
  found: boolean;
  diffs: string[];
}

async function testButtonMutation(
  page: PlaywrightPage,
  input: {
    actionName: 'start' | 'reset';
    selectors: string[];
    textPattern: RegExp;
    settleMs: number;
  },
): Promise<ActionResult> {
  const target = await findButton(page, input.selectors, input.textPattern);
  if (!target) return { actionName: input.actionName, found: false, diffs: [] };

  const before = await captureVisibleSnapshot(page);
  await target.click();
  await page.waitForTimeout(input.settleMs);
  const after = await captureVisibleSnapshot(page);
  return {
    actionName: input.actionName,
    found: true,
    diffs: diffSnapshots(before, after),
  };
}

async function testRangeMutations(page: PlaywrightPage, settleMs: number): Promise<ActionResult[]> {
  const count = await page.locator('#controls input[type="range"], input[type="range"]').count();
  const results: ActionResult[] = [];

  for (let index = 0; index < Math.min(count, 3); index += 1) {
    const slider = page.locator('#controls input[type="range"], input[type="range"]').nth(index);
    const meta = {
      id: await slider.getAttribute('id') || await slider.getAttribute('data-var') || await slider.getAttribute('name') || '',
      value: Number(await slider.inputValue()),
      min: parseNumberAttribute(await slider.getAttribute('min'), 0),
      max: parseNumberAttribute(await slider.getAttribute('max'), 100),
      step: parseNumberAttribute(await slider.getAttribute('step'), 1),
    };
    const nextValue = nextSliderValue(meta);
    const before = await captureVisibleSnapshot(page);
    await dispatchRangeInput(page, index, nextValue);
    await page.waitForTimeout(settleMs);
    const after = await captureVisibleSnapshot(page);
    results.push({
      actionName: `range:${meta.id || `slider-${index + 1}`}`,
      found: true,
      diffs: diffSnapshots(before, after),
    });
  }

  return results;
}

async function findButton(page: PlaywrightPage, selectors: string[], textPattern: RegExp) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) return locator;
  }

  const buttons = page.locator('button, [role="button"], input[type="button"]');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    const text = [
      await candidate.textContent().catch(() => ''),
      await candidate.getAttribute('value').catch(() => ''),
      await candidate.getAttribute('aria-label').catch(() => ''),
    ].filter(Boolean).join(' ');
    if (textPattern.test(text)) return candidate;
  }

  return null;
}

async function captureVisibleSnapshot(page: PlaywrightPage): Promise<VisibleSnapshot> {
  return page.evaluate(`(() => {
    function readRegion(selector) {
      const element = document.querySelector(selector);
      if (!element) return { html: '', text: '' };
      return {
        html: element.outerHTML,
        text: (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim(),
      };
    }

    function readBodyState() {
      const attrs = ['class', 'style', 'data-state', 'data-running', 'data-step']
        .map((name) => name + '=' + (document.body.getAttribute(name) || ''))
        .join('|');
      return attrs;
    }

    function readCanvasFrames() {
      return Array.from(document.querySelectorAll('#visualization canvas, canvas'))
        .slice(0, 3)
        .map((canvas) => {
          try {
            return canvas.toDataURL('image/png');
          } catch {
            return 'canvas-unavailable';
          }
        });
    }

    const visualization = readRegion('#visualization');
    const metrics = readRegion('#metrics');
    return {
      visualizationHtml: visualization.html,
      visualizationText: visualization.text,
      metricsHtml: metrics.html,
      metricsText: metrics.text,
      bodyState: readBodyState(),
      canvasFrames: readCanvasFrames(),
    };
  })()`);
}

async function dispatchRangeInput(page: PlaywrightPage, index: number, value: number): Promise<void> {
  const serializedValue = JSON.stringify(String(value));
  await page.evaluate(`(() => {
    const input = document.querySelectorAll('#controls input[type="range"], input[type="range"]')[${index}];
    if (!input) return;
    input.value = ${serializedValue};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

function diffSnapshots(before: VisibleSnapshot, after: VisibleSnapshot): string[] {
  const diffs: string[] = [];
  if (before.visualizationHtml !== after.visualizationHtml) diffs.push('visualization DOM changed');
  if (before.visualizationText !== after.visualizationText) diffs.push('visualization text changed');
  if (before.metricsHtml !== after.metricsHtml) diffs.push('metrics DOM changed');
  if (before.metricsText !== after.metricsText) diffs.push('metrics text changed');
  if (before.bodyState !== after.bodyState) diffs.push('body state changed');
  if (JSON.stringify(before.canvasFrames) !== JSON.stringify(after.canvasFrames)) diffs.push('canvas pixels changed');
  return Array.from(new Set(diffs));
}

function recordActionResult(
  result: ActionResult,
  actionsTested: string[],
  visibleMutations: string[],
  failures: string[],
): void {
  if (!result.found) {
    failures.push(`${result.actionName} control was not found.`);
    return;
  }
  actionsTested.push(result.actionName);
  if (result.diffs.length > 0) {
    visibleMutations.push(`${result.actionName}: ${result.diffs.join(', ')}`);
    return;
  }
  failures.push(`${result.actionName} produced no visible mutation in #visualization or #metrics.`);
}

function nextSliderValue(meta: { value: number; min: number; max: number; step: number }): number {
  const min = Number.isFinite(meta.min) ? meta.min : 0;
  const max = Number.isFinite(meta.max) && meta.max > min ? meta.max : min + 100;
  const step = Number.isFinite(meta.step) && meta.step > 0 ? meta.step : 1;
  const value = Number.isFinite(meta.value) ? meta.value : min;
  if (value + step <= max) return value + step;
  if (value - step >= min) return value - step;
  return value === min ? max : min;
}

function parseNumberAttribute(value: string | null, fallback: number): number {
  if (value === null || value === '' || value === 'any') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
