import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { stripMarkdownCodeFence, repairMalformedHtml } from '@/lib/generation/htmlSafety';
import type { HtmlDiagnostic } from '@/lib/generation/htmlSafety';
import type { RagWidgetContractDiagnostic } from '@/lib/rag/visualization/widgetContract';
import { formatRagWidgetContractForPrompt } from '@/lib/rag/visualization/widgetContract';
import { createLogger } from '@/lib/logger';
import type { InteractionAction } from '../actions/actionTypes';
import type { AgentIssue, JudgeDecision, LearningBlueprint, SchemaValidationSummary } from '../types';
import { formatBlueprintForPrompt } from './learningDesignAgent';

const log = createLogger('repair');

export interface RepairContext {
  html: string;
  actions: InteractionAction[];
  plan: {
    title: string;
    concept: string;
    description: string;
    interactionType: string;
    subject: string;
    gradeLevel: string;
    learningGoals: string[];
    variables: Array<Record<string, unknown>>;
    widgetOutline: Record<string, unknown>;
  };
  blueprint?: LearningBlueprint;
  schemaValidation?: SchemaValidationSummary;
  decision: JudgeDecision;
  issues: AgentIssue[];
  diagnostic?: HtmlDiagnostic;
  contractDiagnostic?: RagWidgetContractDiagnostic;
}

export interface RepairResult {
  revisedHtml?: string;
  revisedActions?: InteractionAction[];
  changeLog: string[];
}

export async function repairArtifact(ctx: RepairContext): Promise<RepairResult> {
  const target = ctx.decision.target ?? 'html';
  const changeLog: string[] = [];

  log.info('Repair started', { target, issues: ctx.issues.length, instruction: ctx.decision.repairInstruction?.slice(0, 100) });

  try {
    if (target === 'html' || target === 'all') {
      const revisedHtml = await repairHtml(ctx);
      if (revisedHtml) {
        changeLog.push(`修复了 HTML（${target === 'all' ? '全面重生成' : '定向修复'}）。`);
        return { revisedHtml, changeLog };
      }
    }

    if (target === 'teacherActions' || target === 'all') {
      const revisedActions = await repairTeacherActions(ctx);
      if (revisedActions) {
        changeLog.push('重新生成了教师讲解动作。');
        return { revisedActions, changeLog };
      }
    }

    if (target === 'lessonPlan' || target === 'all') {
      // For lessonPlan repair, we regenerate teacher actions with updated context
      const revisedActions = await repairTeacherActions(ctx);
      if (revisedActions) {
        changeLog.push('根据教学改进重新生成了教师讲解。');
        return { revisedActions, changeLog };
      }
    }

    // Fallback: try HTML repair regardless of target
    const revisedHtml = await repairHtml(ctx);
    if (revisedHtml) {
      changeLog.push('尝试了通用 HTML 修复。');
      return { revisedHtml, changeLog };
    }
  } catch (e) {
    log.warn('Repair failed', { error: e instanceof Error ? e.message : String(e) });
  }

  changeLog.push('修复未能成功，保留当前版本。');
  return { changeLog };
}

async function repairHtml(ctx: RepairContext): Promise<string | null> {
  const issuesDescription = ctx.issues
    .filter((i) => i.target === 'html' || i.target === undefined)
    .map((i) => `- [${i.severity}] ${i.message}（建议：${i.suggestion}）`)
    .join('\n');

  const diagnosticInfo = ctx.diagnostic
    ? `\n## 诊断信息（自动检测）\n截断：${ctx.diagnostic.isTruncated ? '是' : '否'}\n交互代码缺失：${ctx.diagnostic.missingInteractivity ? '是' : '否'}\n缺失项：\n${ctx.diagnostic.details.map(d => `- ${d}`).join('\n')}`
    : '';
  const contractDiagnosticInfo = ctx.contractDiagnostic
    ? `\n\n${formatRagWidgetContractForPrompt(ctx.contractDiagnostic)}`
    : '';

  const interactivityInstructions = ctx.diagnostic?.missingInteractivity
    ? `\n\n重要：检测到交互代码不完整。你必须确保修复后的 HTML 包含以下完整功能：
1. 所有 <input type="range"> 必须有 input/change 事件监听器，实时更新模拟状态
2. Canvas 必须有完整的绘制代码（getContext、clearRect、drawImage/fillRect/stroke 等）
3. 必须有 update/render/draw 状态更新函数
4. 开始/重置按钮必须有 click 事件处理
5. 必须通过 postMessage 发送 WIDGET_READY 通知
6. 所有交互控件必须可操作，页面必须是完整可用的`
    : '';
  const blueprintSection = ctx.blueprint
    ? `\n\n## LearningBlueprint 修复锚点\n${formatBlueprintForPrompt(ctx.blueprint)}`
    : '';
  const schemaValidationSection = ctx.schemaValidation
    ? `\n\n## Subject Schema 校验摘要\n通过：${ctx.schemaValidation.passed ? '是' : '否'}\nSchema：${ctx.schemaValidation.schemaKey ?? '未匹配'}\nViolations：\n${ctx.schemaValidation.violations.map((item) => `- ${item}`).join('\n') || '- 无'}\nWarnings：\n${ctx.schemaValidation.warnings.map((item) => `- ${item}`).join('\n') || '- 无'}`
    : '';

  const raw = await withTimeout(
    generateWithConfiguredModel({
      messages: [
        {
          role: 'system',
          content: `你是 STEMotion HtmlRepairAgent。

任务：根据问题列表修复 HTML，并返回完整替换版本。

输出规则：
- 只返回完整 HTML 文档，不要写 Markdown、说明文字或局部 patch。
- 保留原教学内容和核心交互，只修复指出的问题。

必须保留：
- widget-config。
- postMessage 监听器。
- SET_WIDGET_STATE / HIGHLIGHT_ELEMENT / ANNOTATE_ELEMENT / REVEAL_ELEMENT。
- requestAnimationFrame 动画循环。
- 开始/重置按钮。
- WIDGET_READY / WIDGET_RUNTIME_REPORT / WIDGET_RUNTIME_ERROR / WIDGET_PONG / WIDGET_ACTION_ACK。

安全要求：
- 只允许内联 CSS/JS。
- 禁止 fetch、WebSocket、XMLHttpRequest、EventSource、storage API、cookie、eval、动态 import、外部资源和嵌套 iframe。

LearningBlueprint 存在时，修复后必须继续满足 expectedInsight、must 级知识约束和 coreVariables；不要删除核心变量控件或观察结果。
${interactivityInstructions}`,
        },
        {
          role: 'user',
          content: `## 需要修复的问题
${issuesDescription || '根据评审意见改进组件质量。'}

## 修复指令
${ctx.decision.repairInstruction ?? '改进整体质量。'}
${diagnosticInfo}
${contractDiagnosticInfo}
${blueprintSection}
${schemaValidationSection}

## 当前 HTML
${ctx.html}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 131072,
      stream: false,
    }),
    120000,
  );

  const cleaned = stripMarkdownCodeFence(raw);
  return repairMalformedHtml(cleaned);
}

async function repairTeacherActions(ctx: RepairContext): Promise<InteractionAction[] | null> {
  const issuesDescription = ctx.issues
    .filter((i) => i.target === 'teacherActions' || i.target === 'lessonPlan' || i.target === undefined)
    .map((i) => `- [${i.severity}] ${i.message}`)
    .join('\n');
  const blueprintSection = ctx.blueprint
    ? `\n## LearningBlueprint\n${JSON.stringify({
        topic: ctx.blueprint.topic,
        expectedInsight: ctx.blueprint.expectedInsight,
        coreVariables: ctx.blueprint.coreVariables,
        knowledgeConstraints: ctx.blueprint.knowledgeConstraints,
      }, null, 2)}`
    : '';

  const raw = await withTimeout(
    generateWithConfiguredModel({
      messages: [
        {
          role: 'system',
          content: `你是 STEMotion TeacherActionRepairAgent。

任务：根据评审意见重新生成教师讲解动作。

输出规则：
- 返回纯 JSON：{"actions":[...]}。
- 允许的 action 类型：speech, set_widget_state, highlight_widget_element, annotate_widget_element, reveal_widget_element, show_quiz。
- 使用 durationMs 字段，不使用 duration。
- 生成 5-8 个 action。
- 使用用户语言。
- 动作必须引导观察、变量操作和总结，不要只描述界面。`,
        },
        {
          role: 'user',
          content: `## 组件信息
- 标题：${ctx.plan.title}
- 概念：${ctx.plan.concept}
- 类型：${ctx.plan.interactionType}
- 学科：${ctx.plan.subject}

## 评审问题
${issuesDescription || '改进教师动作的质量。'}

## 修复指令
${ctx.decision.repairInstruction ?? '改进教师动作的教学引导效果。'}
${blueprintSection}

## 当前动作
${JSON.stringify(ctx.actions, null, 2).slice(0, 3000)}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 8000,
      stream: false,
    }),
    60000,
  );

  try {
    const parsed = parseJsonResponse(raw) as { actions?: unknown[] };
    if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
      return parsed.actions as InteractionAction[];
    }
  } catch {
    // parse failed
  }

  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Repair timed out.')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
