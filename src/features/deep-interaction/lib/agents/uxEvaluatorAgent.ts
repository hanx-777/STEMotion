import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { buildInternalMultiAgentPlanningPrompt } from '@/lib/generation/multiAgentGenerationPrompt';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import { withAbortableTimeout } from '@/lib/utils/withTimeout';
import type { AgentEvaluation, AgentIssue } from '../types';
import { designReviewRubricPrompt } from './designReviewRubric';
import {
  createNonBlockingEvaluatorFallback,
  resolveEvaluatorTimeoutMs,
} from './evaluatorFallback';

const log = createLogger('evaluator');
const HTML_PREVIEW_CHARS = 6000;

export interface UxEvalContext {
  html: string;
  title: string;
  concept: string;
  interactionType: string;
  variables: Array<{ name: string; label: string }>;
  signal?: AbortSignal;
}

export async function evaluateUX(ctx: UxEvalContext): Promise<AgentEvaluation> {
  const startTime = Date.now();
  const agentName = 'UX Evaluator';

  try {
    const raw = await withAbortableTimeout(
      (signal) => generateWithConfiguredModel({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(ctx) },
        ],
        temperature: 0.1,
        requestPreset: 'reviewer',
        profileRole: 'reviewer',
        signal,
        metadata: {
          stage: 'ux_evaluator',
          promptVersion: 'ux-evaluator-v1',
        },
      }),
      resolveEvaluatorTimeoutMs(),
      'UX evaluation timed out.',
      ctx.signal,
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
    if (ctx.signal?.aborted) throw new Error('已取消');
    log.warn('UX evaluation failed, using fallback', { error: e instanceof Error ? e.message : String(e) });
    return createNonBlockingEvaluatorFallback({
      agentName,
      issueId: 'ux_fallback_1',
      category: 'ux',
      message: 'UX 评估 Agent 超时或未能返回结果，已作为非阻塞 warning 记录。',
      suggestion: '请人工按 shared design-review rubric 检查首屏可用性、主舞台比例、响应式、滚动、控件命中区域和具体修复位置；生成主流程可继续。',
      target: 'html',
      startTime,
      error: e,
    });
  }
}

const SYSTEM_PROMPT = `你是 STEMotion UxEvaluatorAgent。

任务：评估 AI 生成的 HTML 交互组件是否适合学生探索和教师课堂讲解。

输出规则：
- 返回纯 JSON，不要写 Markdown。
- 只允许 category: "ux" 或 "accessibility"。
- target 默认使用 "html"。
- 没有明显问题时 issues 返回空数组。

评分维度：
- 可访问性 20%：对比度、标签、aria/label、键盘顺序、非纯颜色状态。
- 交互反馈 20%：滑块、按钮、预设、运行状态有即时反馈。
- 移动端与触控 20%：375px 无横向溢出，触控目标约 44px，控件不遮挡主舞台。
- 布局与层级 20%：主舞台、控件、指标、说明分区清晰，文字不重叠，1366x768 和 1440x900 首屏可用。
- 动画与性能 10%：动画服务学习，使用 requestAnimationFrame 或等价平滑更新。
- 教育场景适配 10%：鼓励观察、比较、调节和反馈，适合投屏和独立探索。

UI 布局审查必须覆盖：
- 首屏是否能看到核心交互区和主要结果区，特别是 1366x768、1440x900。
- 主区域、侧栏、说明区比例是否合理；主舞台应占 65%-75%，侧栏或说明区约 25%-35%。
- 是否右栏过宽、主舞台过小、内容拥挤或过度留白。
- 控件区是否过高，顶部标题区是否重复或过大，说明文字是否过长。
- 是否存在多个滚动区域互相嵌套，导致普通笔记本屏幕无法稳定操作。
- 是否需要 draggable splitter / 可拖动分隔栏；没有 splitter 时是否有稳定的 grid/flex 固定比例 fallback。
- 每个 issue 的 suggestion 必须给出具体修改建议，例如压缩 header、把说明移入 details、把网格改为 72/28、减少 nested scroll。

${designReviewRubricPrompt()}

高风险问题必须扣分并写入 issues：横向溢出、控件遮挡、无反馈、文字重叠、低对比、触控目标过小、hover-only、纯装饰动画、右栏过宽、主舞台过小、嵌套滚动、首屏看不到核心交互。

评分要求：
- 90-100：课堂可直接使用。
- 80-89：整体良好，仅有低风险问题。
- 70-79：可用但需要改进。
- 60-69：体验不足，需要修复后再使用。
- <60：严重影响学习或操作。

JSON 格式:
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
}`;

const INTERNAL_REVIEWER_FLOW = buildInternalMultiAgentPlanningPrompt({
  mode: 'reviewer',
  artifactKind: 'UX and accessibility evaluation JSON',
  outputInstruction: '返回纯 JSON，覆盖功能正确性、代码质量、UI/UX、响应式、可视化质量、首屏比例、控件密度和嵌套滚动。',
});

function buildUserPrompt(ctx: UxEvalContext): string {
  const signals = extractUxSignals(ctx.html);

  return `${INTERNAL_REVIEWER_FLOW}

请评估以下交互组件的用户体验：

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSeverity(value: unknown): AgentIssue['severity'] {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' || value === 'warning' ? value : 'medium';
}

function normalizeCategory(value: unknown, fallback: AgentIssue['category']): AgentIssue['category'] {
  const valid: AgentIssue['category'][] = ['pedagogy', 'ux', 'safety', 'runtime', 'curriculum', 'accessibility', 'schema'];
  return valid.includes(value as AgentIssue['category']) ? (value as AgentIssue['category']) : fallback;
}

function normalizeTarget(value: unknown): AgentIssue['target'] | undefined {
  const valid = ['lessonPlan', 'html', 'teacherActions', 'schema', 'all'];
  return valid.includes(value as string) ? (value as AgentIssue['target']) : undefined;
}
