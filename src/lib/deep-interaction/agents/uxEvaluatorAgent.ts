import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import type { AgentEvaluation, AgentIssue } from '../types';

const log = createLogger('evaluator');
const HTML_PREVIEW_CHARS = 6000;

export interface UxEvalContext {
  html: string;
  title: string;
  concept: string;
  interactionType: string;
  variables: Array<{ name: string; label: string }>;
}

export async function evaluateUX(ctx: UxEvalContext): Promise<AgentEvaluation> {
  const startTime = Date.now();
  const agentName = 'UX Evaluator';

  try {
    const raw = await withTimeout(
      generateWithConfiguredModel({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(ctx) },
        ],
        temperature: 0.1,
        maxTokens: 8000,
        stream: false,
      }),
      30000,
    );

    const parsed = parseJsonResponse(raw) as {
      score?: number;
      passed?: boolean;
      summary?: string;
      issues?: Array<{
        severity?: string;
        category?: string;
        message?: string;
        suggestion?: string;
        target?: string;
        evidence?: string;
      }>;
    };

    const issues: AgentIssue[] = Array.isArray(parsed.issues)
      ? parsed.issues.map((issue, i) => {
          const evidence = typeof issue.evidence === 'string' && issue.evidence.trim()
            ? issue.evidence.trim()
            : undefined;

          return {
            id: `ux_issue_${i}`,
            severity: normalizeSeverity(issue.severity),
            category: normalizeCategory(issue.category, 'ux'),
            message: String(issue.message || '未指定问题'),
            suggestion: String(issue.suggestion || '请检查相关 UI 设计。'),
            target: normalizeTarget(issue.target) ?? 'html',
            ...(evidence ? { evidence } : {}),
          };
        })
      : [];

    const score = clamp(Number(parsed.score) || 70, 0, 100);
    const passed = parsed.passed ?? score >= 70;

    log.info('UX evaluation complete', { score, passed, issues: issues.length, durationMs: Date.now() - startTime });

    return {
      agentName,
      score,
      passed,
      summary: String(parsed.summary || '交互体验评估完成。'),
      issues,
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    log.warn('UX evaluation failed, using fallback', { error: e instanceof Error ? e.message : String(e) });
    return {
      agentName,
      score: 60,
      passed: false,
      summary: '交互体验评估未能完成（LLM 调用失败）。',
      issues: [{
        id: 'ux_fallback_1',
        severity: 'medium',
        category: 'ux',
        message: 'UX 评估 Agent 未能返回结果。',
        suggestion: '请人工检查交互体验。',
        target: 'html',
      }],
      durationMs: Date.now() - startTime,
    };
  }
}

const SYSTEM_PROMPT = `你是一个 K-12 STEM 教育产品交互体验评估专家。你的任务是评估一个 AI 生成的 HTML 交互组件是否适合学生动手探索和教师课堂讲解。

返回纯 JSON，不要写 markdown。

评分维度和权重：
- 可访问性（20%）：文字/图标对比度足够，按钮和图标有可理解标签，表单控件有 label 或 aria-label，不只靠颜色传达状态，键盘/读屏顺序不混乱。
- 交互反馈（20%）：滑块、按钮、预设和运行状态有即时且明显反馈，开始/暂停/重置状态清楚，不能依赖 hover 才能完成主要操作。
- 移动端与触控（20%）：375px 宽度下无横向溢出，触控目标约 44px 以上，控件之间至少有合理间距，控制区不遮挡主舞台，允许正常缩放。
- 布局与视觉层级（20%）：主舞台、控件、指标、说明分区清晰，字号/间距/对齐稳定，避免文字重叠、按钮挤压、卡片套卡片或装饰压过学习内容。
- 动画与性能（10%）：动画服务于概念理解，使用 requestAnimationFrame 或等价方式平滑更新，不用会造成布局抖动的动画，不阻塞用户操作。
- 教育场景适配（10%）：界面鼓励观察、比较、调节和反馈，适合课堂投屏与学生独立探索，不做营销页式视觉堆砌。

高风险问题必须扣分并写入 issues：
- 375px 移动宽度可能横向溢出或控件遮挡主舞台。
- 按钮、滑块或核心交互没有视觉反馈。
- 文字重叠、按钮挤压、低对比度、灰字灰底。
- 只用颜色表达重要状态，没有文字/形状/图标辅助。
- 触控目标过小，或关键控件只能 hover 使用。
- 动画纯装饰、过慢、造成布局跳动，或影响操作。

评分要求：
- 90-100：课堂可直接使用，移动端、可访问性、交互反馈都表现好。
- 80-89：整体良好，仅有低风险问题。
- 70-79：可用但需要改进；存在影响体验但不阻断学习的问题。
- 60-69：体验不足，需要修复后再使用。
- <60：严重影响学习或操作，必须重做或大修。

返回格式：
{
  "score": 82,
  "passed": true,
  "summary": "一句话总结",
  "issues": [
    {
      "severity": "low|medium|high|critical",
      "category": "ux|accessibility",
      "message": "问题描述",
      "evidence": "可选，引用静态信号或 HTML 线索，例如：未检测到 aria-label / 存在 width: 900px",
      "suggestion": "修复建议",
      "target": "html"
    }
  ]
}

只允许使用 category: "ux" 或 "accessibility"。target 默认使用 "html"。如果没有明显问题，issues 返回空数组。`;

function buildUserPrompt(ctx: UxEvalContext): string {
  const signals = extractUxSignals(ctx.html);

  return `请评估以下交互组件的用户体验：

## 基本信息
- 标题：${ctx.title}
- 核心概念：${ctx.concept}
- 交互类型：${ctx.interactionType}
- 可调变量：${ctx.variables.map((v) => `${v.label}(${v.name})`).join(', ')}

## 自动 UX 信号摘要
${formatUxSignals(signals)}

## HTML 代码（前 ${HTML_PREVIEW_CHARS} 字符）
\`\`\`html
${ctx.html.slice(0, HTML_PREVIEW_CHARS)}
\`\`\`

请从用户体验角度评估这个交互组件。`;
}

interface UxStaticSignals {
  hasViewportMeta: boolean;
  hasResponsiveViewport: boolean;
  hasMediaQuery: boolean;
  rangeInputCount: number;
  buttonCount: number;
  ariaAttributeCount: number;
  labelCount: number;
  hasInputLabels: boolean;
  fixedWidthMatches: string[];
  hasRequestAnimationFrame: boolean;
  hasStartControl: boolean;
  hasResetControl: boolean;
  hasOverflowXHidden: boolean;
  hasTouchAction: boolean;
  hasReducedMotion: boolean;
  hasCssTransitionOrAnimation: boolean;
  possibleHorizontalOverflow: boolean;
}

function extractUxSignals(html: string): UxStaticSignals {
  const hasViewportMeta = /<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(html);
  const hasResponsiveViewport = /<meta\b[^>]*name=["']viewport["'][^>]*content=["'][^"']*width\s*=\s*device-width/i.test(html);
  const hasMediaQuery = /@media\b/i.test(html);
  const rangeInputCount = countMatches(html, /<input\b[^>]*type=["']range["'][^>]*>/gi);
  const buttonCount = countMatches(html, /<button\b/gi)
    + countMatches(html, /<input\b[^>]*type=["'](?:button|submit|reset)["'][^>]*>/gi);
  const ariaAttributeCount = countMatches(html, /\baria-[a-z-]+\s*=/gi);
  const labelCount = countMatches(html, /<label\b/gi);
  const hasInputLabels = labelCount > 0 || /\baria-label\s*=|\baria-labelledby\s*=|\btitle\s*=/i.test(html);
  const fixedWidthMatches = collectWideFixedWidths(html);
  const hasRequestAnimationFrame = /requestAnimationFrame\s*\(/i.test(html);
  const hasStartControl = /start|run|play|开始|运行|播放/i.test(html);
  const hasResetControl = /reset|重置|重新开始/i.test(html);
  const hasOverflowXHidden = /overflow-x\s*:\s*hidden/i.test(html);
  const hasTouchAction = /touch-action\s*:/i.test(html);
  const hasReducedMotion = /prefers-reduced-motion/i.test(html);
  const hasCssTransitionOrAnimation = /transition\s*:|animation\s*:|@keyframes\b/i.test(html);
  const possibleHorizontalOverflow = fixedWidthMatches.length > 0 && !hasMediaQuery;

  return {
    hasViewportMeta,
    hasResponsiveViewport,
    hasMediaQuery,
    rangeInputCount,
    buttonCount,
    ariaAttributeCount,
    labelCount,
    hasInputLabels,
    fixedWidthMatches,
    hasRequestAnimationFrame,
    hasStartControl,
    hasResetControl,
    hasOverflowXHidden,
    hasTouchAction,
    hasReducedMotion,
    hasCssTransitionOrAnimation,
    possibleHorizontalOverflow,
  };
}

function formatUxSignals(signals: UxStaticSignals): string {
  return [
    `- viewport meta：${yesNo(signals.hasViewportMeta)}；响应式 viewport：${yesNo(signals.hasResponsiveViewport)}`,
    `- media query：${yesNo(signals.hasMediaQuery)}；可能横向溢出：${yesNo(signals.possibleHorizontalOverflow)}`,
    `- range 控件数量：${signals.rangeInputCount}；button 控件数量：${signals.buttonCount}`,
    `- label 数量：${signals.labelCount}；aria 属性数量：${signals.ariaAttributeCount}；输入控件标签线索：${yesNo(signals.hasInputLabels)}`,
    `- CSS 固定宽度线索：${signals.fixedWidthMatches.length ? signals.fixedWidthMatches.join(', ') : '未检测到 >=376px 的 CSS 固定宽度'}`,
    `- requestAnimationFrame：${yesNo(signals.hasRequestAnimationFrame)}；开始控件：${yesNo(signals.hasStartControl)}；重置控件：${yesNo(signals.hasResetControl)}`,
    `- overflow-x hidden：${yesNo(signals.hasOverflowXHidden)}；touch-action：${yesNo(signals.hasTouchAction)}`,
    `- reduced-motion：${yesNo(signals.hasReducedMotion)}；CSS transition/animation：${yesNo(signals.hasCssTransitionOrAnimation)}`,
  ].join('\n');
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function collectWideFixedWidths(html: string): string[] {
  const matches: string[] = [];
  const pattern = /\b(?:width|min-width|max-width)\s*:\s*(\d{3,4})px/gi;
  let match = pattern.exec(html);

  while (match && matches.length < 5) {
    if (Number(match[1]) >= 376) {
      matches.push(match[0]);
    }
    match = pattern.exec(html);
  }

  return matches;
}

function yesNo(value: boolean): string {
  return value ? '是' : '否';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('UX evaluation timed out.')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSeverity(value: unknown): AgentIssue['severity'] {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function normalizeCategory(value: unknown, fallback: AgentIssue['category']): AgentIssue['category'] {
  const valid: AgentIssue['category'][] = ['pedagogy', 'ux', 'safety', 'runtime', 'curriculum', 'accessibility', 'schema'];
  return valid.includes(value as AgentIssue['category']) ? (value as AgentIssue['category']) : fallback;
}

function normalizeTarget(value: unknown): AgentIssue['target'] | undefined {
  const valid = ['lessonPlan', 'html', 'teacherActions', 'schema', 'all'];
  return valid.includes(value as string) ? (value as AgentIssue['target']) : undefined;
}
