import { generateWithConfiguredModel, LlmTruncationError } from '@/lib/generation/llmClient';
import {
  assertSafeInteractiveHtml,
  diagnoseHtmlCompleteness,
  extractWidgetConfig,
  patchTruncatedHtml,
  repairMalformedHtml,
  stripMarkdownCodeFence,
} from '@/lib/generation/htmlSafety';
import { createLogger } from '@/lib/logger';
import { withTimeout } from '@/lib/utils/withTimeout';
import { makeId } from '@/lib/utils/makeId';
import { evaluatePedagogy, type PedagogyEvalContext } from '@/lib/deep-interaction/agents/pedagogyEvaluatorAgent';
import { evaluateUX, type UxEvalContext } from '@/lib/deep-interaction/agents/uxEvaluatorAgent';
import { evaluateSafety } from '@/lib/deep-interaction/agents/safetyEvaluatorAgent';
import { evaluateRuntime } from '@/lib/deep-interaction/agents/runtimeEvaluator';
import { judgeEvaluations } from '@/lib/deep-interaction/agents/judgeAgent';
import { repairArtifact, type RepairContext, type RepairResult } from '@/lib/deep-interaction/agents/repairAgent';
import { validateInteractionArtifact } from '@/lib/deep-interaction/validators';
import type { DeepInteractionStreamEvent } from '@/lib/deep-interaction/events';
import type {
  AgentEvaluation,
  FeedbackIteration,
  FeedbackLoopResult,
  InteractionArtifact,
  InteractionSchema,
  InteractionSubject,
  LearningBlueprint,
  QualityReport,
  RepairTraceItem,
} from '@/lib/deep-interaction/types';
import type { InteractionAction } from '@/lib/deep-interaction/actions/actionTypes';
import {
  createRagVisualizationGenerationPlan,
  type RagVisualizationPlanningOptions,
} from './planningAgent';
import {
  diagnoseRagWidgetContract,
  ensureRagWidgetContractHtml,
  formatRagWidgetContractForPrompt,
  type RagWidgetContractDiagnostic,
} from './widgetContract';
import type {
  InteractiveHtmlSpec,
  RagVisualizationBrief,
  RagVisualizationGenerationPlan,
  VisualizationType,
} from './types';

const log = createLogger('rag-visualization-audit');

const ALLOWED_MESSAGES = [
  'SET_WIDGET_STATE',
  'HIGHLIGHT_ELEMENT',
  'ANNOTATE_ELEMENT',
  'REVEAL_ELEMENT',
] as const;

export interface RagVisualizationAuditInput {
  question: string;
  answerText?: string;
  answerSections?: Array<{ id?: string; title: string; content: string }>;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  citations?: unknown[];
  subject: string;
  taskType: string;
  source: 'student' | 'teacher';
  preferredType?: VisualizationType;
  now?: string;
}

export interface RagWidgetHtmlGenerationInput extends RagVisualizationAuditInput {
  plan: RagVisualizationGenerationPlan;
}

export interface RagVisualizationAuditPipelineOptions extends RagVisualizationPlanningOptions {
  htmlGenerator?: (input: RagWidgetHtmlGenerationInput) => Promise<string>;
  pedagogyEvaluator?: (ctx: PedagogyEvalContext) => Promise<AgentEvaluation>;
  uxEvaluator?: (ctx: UxEvalContext) => Promise<AgentEvaluation>;
  repairer?: (ctx: RepairContext) => Promise<RepairResult | string>;
  emit?: (event: DeepInteractionStreamEvent) => void;
  isAborted?: () => boolean;
  maxIterations?: number;
}

export async function runRagVisualizationAuditPipeline(
  input: RagVisualizationAuditInput,
  options: RagVisualizationAuditPipelineOptions = {},
): Promise<InteractionArtifact> {
  const startedAt = Date.now();
  const now = input.now ?? new Date().toISOString();
  const checkAborted = () => {
    if (options.isAborted?.()) throw new Error('已取消');
  };

  emit(options, { type: 'progress', stage: 'planning', message: '正在还原原题与可视化目标...', progress: 8 });
  const plan = await createRagVisualizationGenerationPlan(
    {
      question: input.question,
      answerText: input.answerText,
      subject: input.subject,
      taskType: input.taskType,
      formulaBlocks: input.formulaBlocks,
      finalResults: input.finalResults,
      preferredType: input.preferredType,
    },
    { plannerModel: options.plannerModel },
  );
  checkAborted();

  if (!plan.shouldGenerate || plan.confidence < 0.35) {
    throw new Error('当前问题不适合生成可靠的互动可视化。');
  }

  emit(options, {
    type: 'schema_generated',
    schemaPreview: {
      type: 'rag_visualization',
      title: artifactTitle(plan),
      plan,
      contract: ['widget-config', '#visualization', '#controls', '#metrics', 'start/reset', 'multi-agent audit'],
    },
    progress: 24,
  });
  emit(options, {
    type: 'progress',
    stage: 'building_interaction',
    message: '正在生成题目专属互动 HTML/SVG/Canvas...',
    progress: 42,
  });

  const rawHtml = await (options.htmlGenerator ?? generateRagWidgetHtml)({ ...input, plan });
  let currentHtml = normalizeCandidateHtml(rawHtml);
  let currentActions = createRagTeacherActions(plan);
  const blueprint = createRagLearningBlueprint(input, plan, now);
  const maxIterations = options.maxIterations ?? 5;
  const iterations: FeedbackIteration[] = [];
  const changeLog: string[] = [];
  let lastContractDiagnostic = diagnoseRagWidgetContract(currentHtml);
  let prevScore = 0;
  let bestScore = 0;

  emit(options, { type: 'validation_started', message: '正在校验安全、运行时、教学与 UX 质量...', progress: 68 });
  emit(options, { type: 'feedback_started', message: '开始 RAG 可视化多 Agent 质量评审...', progress: 72 });

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    checkAborted();
    lastContractDiagnostic = diagnoseRagWidgetContract(currentHtml);
    const progress = 72 + Math.min(iteration * 7, 22);
    emit(options, {
      type: 'feedback_iteration_started',
      iteration,
      maxIterations,
      message: `第 ${iteration}/${maxIterations} 轮可视化评审...`,
      progress,
    });

    emit(options, { type: 'evaluator_started', iteration, agentName: 'Pedagogy Evaluator', message: '教学一致性评估中...', progress });
    emit(options, { type: 'evaluator_started', iteration, agentName: 'UX Evaluator', message: '交互体验评估中...', progress });
    const [pedagogyEval, uxEval] = await Promise.all([
      (options.pedagogyEvaluator ?? evaluatePedagogy)({
        prompt: input.question,
        title: artifactTitle(plan),
        concept: plan.knowledgePoint,
        description: plan.problemRestatement,
        subject: mapInteractionSubject(input.subject),
        gradeLevel: 'high_school',
        interactionType: 'rag_visualization',
        learningGoals: learningGoalsFromPlan(plan),
        htmlPreview: currentHtml.slice(0, 1200),
        actionsSummary: currentActions.map((action) => action.type).join(', '),
        blueprint,
      }),
      (options.uxEvaluator ?? evaluateUX)({
        html: currentHtml,
        title: artifactTitle(plan),
        concept: plan.knowledgePoint,
        interactionType: 'rag_visualization',
        variables: plan.variables.map((variable) => ({ name: variable.name, label: variable.label })),
      }),
    ]);

    const safetyEval = evaluateSafety(currentHtml);
    const runtimeEval = evaluateRuntime(currentHtml);
    const evaluations = [pedagogyEval, uxEval, safetyEval, runtimeEval];

    for (const evaluation of evaluations) {
      emit(options, { type: 'evaluator_completed', iteration, evaluation, progress });
    }

    const decision = judgeEvaluations(evaluations, iterations[iterations.length - 1]);
    emit(options, { type: 'judge_decision', iteration, decision, progress });

    const feedbackIteration: FeedbackIteration = {
      iteration,
      evaluations,
      judgeDecision: decision,
      scoreBefore: prevScore,
      scoreAfter: decision.finalScore,
      createdAt: new Date().toISOString(),
    };
    iterations.push(feedbackIteration);
    bestScore = Math.max(bestScore, decision.finalScore);

    if (decision.type === 'accept') break;
    if (decision.type === 'reject') break;

    emit(options, {
      type: 'repair_started',
      iteration,
      target: decision.target ?? 'html',
      message: '正在根据审计意见修复互动可视化...',
      progress,
    });
    const rawRepairResult = await (options.repairer ?? repairArtifact)({
      html: currentHtml,
      actions: currentActions,
      plan: {
        title: artifactTitle(plan),
        concept: plan.knowledgePoint,
        description: plan.problemRestatement,
        interactionType: 'rag_visualization',
        subject: input.subject,
        gradeLevel: 'high_school',
        learningGoals: learningGoalsFromPlan(plan),
        variables: plan.variables.map((variable) => ({ ...variable })),
        widgetOutline: {
          visualObjects: plan.visualObjects,
          controls: plan.controls,
          metrics: plan.metrics,
          animationRequirements: plan.animationRequirements,
          successCriteria: plan.successCriteria,
        },
      },
      blueprint,
      decision,
      issues: [
        ...decision.blockingIssues,
        ...contractIssues(lastContractDiagnostic),
      ],
      diagnostic: diagnoseHtmlCompleteness(currentHtml),
      contractDiagnostic: lastContractDiagnostic,
    });
    const repairResult = typeof rawRepairResult === 'string'
      ? { revisedHtml: rawRepairResult, changeLog: ['修复了 HTML。'] }
      : rawRepairResult;

    if (repairResult.revisedHtml) {
      currentHtml = normalizeCandidateHtml(repairResult.revisedHtml);
      lastContractDiagnostic = diagnoseRagWidgetContract(currentHtml);
    }
    if (repairResult.revisedActions) {
      currentActions = repairResult.revisedActions;
    }
    feedbackIteration.changeLog = repairResult.changeLog;
    changeLog.push(...repairResult.changeLog);
    emit(options, { type: 'repair_completed', iteration, changeLog: repairResult.changeLog, progress });

    prevScore = decision.finalScore;
  }

  const finalSafety = evaluateSafety(currentHtml);
  const finalRuntime = evaluateRuntime(currentHtml);
  const finalContractDiagnostic = diagnoseRagWidgetContract(currentHtml);
  if (!finalSafety.passed || !finalRuntime.passed || !finalContractDiagnostic.passed) {
    const missing = Array.from(new Set([
      ...finalContractDiagnostic.missing,
      ...finalSafety.issues.map((issue) => issue.message),
      ...finalRuntime.issues.map((issue) => issue.message),
    ])).slice(0, 10);
    throw createRagVisualizationContractError(missing, iterations.length);
  }
  assertSafeInteractiveHtml(currentHtml);

  const feedbackResult = createFeedbackResult(iterations, bestScore);
  const qualityReport = createQualityReport(feedbackResult, plan);
  const artifact = createArtifact({
    input,
    plan,
    html: currentHtml,
    actions: currentActions,
    feedbackResult,
    qualityReport,
    changeLog,
    blueprint,
    now,
  });

  validateInteractionArtifact(artifact);
  emit(options, { type: 'feedback_completed', result: feedbackResult, qualityReport, progress: 96 });
  emit(options, { type: 'artifact_ready', artifact, progress: 100 });

  log.info('RAG visualization audit pipeline completed', {
    artifactId: artifact.id,
    elapsed: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    score: artifact.finalScore,
  });

  return artifact;
}

export async function generateRagWidgetHtml(input: RagWidgetHtmlGenerationInput): Promise<string> {
  const prompt = buildRagWidgetHtmlPrompt(input);
  let raw: string;

  try {
    raw = await withTimeout(
      generateWithConfiguredModel({
        messages: [
          {
            role: 'system',
            content: `You are STEMotion RAG WidgetHtmlAgent.

Task: generate one complete self-contained HTML document for a problem-specific RAG visualization.

Return HTML only. No markdown or prose.

Rules:
- Use pure inline HTML/CSS/JavaScript.
- No remote resources, network requests, storage APIs, eval, dynamic import, or nested iframes.
- The widget must be problem-specific, not a generic explanation page.
- Preserve the original question, variables, known values, and requested result.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 32768,
        stream: true,
      }),
      900000,
      'RAG visualization HTML generation timed out.',
    );
  } catch (error) {
    if (error instanceof LlmTruncationError) {
      raw = error.partialContent;
    } else {
      throw error;
    }
  }

  return normalizeCandidateHtml(raw);
}

export function buildRagWidgetHtmlPrompt(input: {
  question: string;
  answerText?: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  plan: RagVisualizationGenerationPlan;
}): string {
  const variableText = input.plan.variables.length
    ? input.plan.variables.map((item) => `- ${item.label} (${item.name}) = ${item.value}${item.unit ?? ''}; role=${item.role ?? 'unknown'}`).join('\n')
    : '- 无明确变量，必须在页面说明使用默认演示值';
  const formulaText = input.formulaBlocks?.length
    ? input.formulaBlocks.map((item) => `- ${item.latex}${item.explanation ? `：${item.explanation}` : ''}`).join('\n')
    : '- 无';
  const resultText = input.finalResults?.length
    ? input.finalResults.map((item) => `- ${item.label}: ${item.value}${item.unit ?? ''}`).join('\n')
    : '- 无';

  return `生成一个与 /visualization 工作台同级别的 RAG 互动可视化 HTML。

必须遵守的题目规划：
${JSON.stringify(input.plan, null, 2)}

原题：
${input.question}

RAG 回答摘要：
${(input.answerText ?? '').slice(0, 3000) || '无'}

关键变量：
${variableText}

公式：
${formulaText}

最终结果：
${resultText}

HTML 合约（必须全部满足）：
1. 输出完整 <!DOCTYPE html> 文档，只允许内联 CSS/JS。
2. 包含 <script type="application/json" id="widget-config">，JSON 内含 concept、variables、defaultState、messageTargets。
3. 有主舞台 id="visualization"，控制区 id="controls"，指标区 id="metrics"。
4. 有按钮 id="start-btn" 和 id="reset-btn"，且都有 click 事件。
5. 用 SVG 或 Canvas 绘制题目专属对象：${input.plan.visualObjects.join('、')}。
6. 用 requestAnimationFrame 实现可见动画，满足 animationRequirements：${input.plan.animationRequirements.join('；')}。
7. 监听 window message，并实现 SET_WIDGET_STATE、HIGHLIGHT_ELEMENT、ANNOTATE_ELEMENT、REVEAL_ELEMENT。
8. 发送 WIDGET_READY、WIDGET_RUNTIME_REPORT、WIDGET_RUNTIME_ERROR、WIDGET_PONG、WIDGET_ACTION_ACK。
9. 控件必须能改变动画或指标，指标必须显示：${input.plan.metrics.join('、')}。
10. 移动端 375px 不横向溢出；主舞台高度稳定；不要卡片套卡片；不要营销页式 hero。

必须复制并改造的 JS 结构：
- const state = {...} 或 var state = {...}
- function draw() { ... }：绘制 SVG/Canvas/DOM 状态。
- function update() { draw(); ... }：把控件值和指标同步到页面。
- function animate() { update(); window.parent.postMessage({ type: 'WIDGET_RUNTIME_REPORT', state }, '*'); requestAnimationFrame(animate); }
- start-btn click：切换 state.running，并发送 WIDGET_ACTION_ACK。
- reset-btn click：恢复 defaultState，并发送 WIDGET_ACTION_ACK。
- window.addEventListener('message', ...)：必须处理 PING、SET_WIDGET_STATE、HIGHLIGHT_ELEMENT、ANNOTATE_ELEMENT、REVEAL_ELEMENT。
- window.addEventListener('error', ...)：必须发送 WIDGET_RUNTIME_ERROR。
- 页面初始化后必须 requestAnimationFrame(animate)，并发送 WIDGET_READY。

内容规则：
- 禁止泛化演示：标题、变量、图形标签和操作步骤必须对应原题。
- 禁止改题：不能把题目换成相似例题。
- 不要编造参数；缺失值用 unknown 或在页面中明确“默认演示值”。
- 如果是算法题，必须逐步展示输入、当前步骤、数据结构状态和输出结果。
- 如果是物理/数学题，必须展示变量变化、公式关系和结果指标。

只返回 HTML。`;
}

function normalizeCandidateHtml(raw: string): string {
  const fixed = repairMalformedHtml(stripMarkdownCodeFence(raw));
  const diagnostic = diagnoseHtmlCompleteness(fixed);
  const structurallyFixed = diagnostic.isTruncated ? patchTruncatedHtml(fixed) : fixed;
  return ensureRagWidgetContractHtml(structurallyFixed);
}

function createRagVisualizationContractError(missing: string[], repairAttempts: number): Error & {
  diagnostics?: { missing: string[]; repairAttempts: number };
} {
  const summarized = missing.length ? missing.join('、') : '未知运行时合约项';
  const error = new Error(`RAG 可视化运行时合约未通过：缺少 ${summarized}`);
  return Object.assign(error, {
    diagnostics: {
      missing,
      repairAttempts,
    },
  });
}

function contractIssues(diagnostic: RagWidgetContractDiagnostic): AgentEvaluation['issues'] {
  return diagnostic.missing.map((item, index) => ({
    id: `rag_contract_${index + 1}`,
    severity: 'high' as const,
    category: 'runtime' as const,
    message: `RAG widget contract 缺少 ${item}`,
    suggestion: `${formatRagWidgetContractForPrompt(diagnostic)}\n必须返回完整 HTML，不要只做局部补丁。`,
    target: 'html' as const,
  }));
}

function createArtifact(params: {
  input: RagVisualizationAuditInput;
  plan: RagVisualizationGenerationPlan;
  html: string;
  actions: InteractionAction[];
  feedbackResult: FeedbackLoopResult;
  qualityReport: QualityReport;
  changeLog: string[];
  blueprint: LearningBlueprint;
  now: string;
}): InteractionArtifact {
  const { input, plan, html, actions, feedbackResult, qualityReport, changeLog, blueprint, now } = params;
  const sessionId = makeId('rag_viz_session');
  const artifactId = makeId('rag_viz_artifact');
  const widgetConfig = withWidgetConfig(extractWidgetConfig(html), plan);
  const spec: InteractiveHtmlSpec = {
    type: 'interactive_html',
    title: artifactTitle(plan),
    description: plan.problemRestatement,
    contextTitle: plan.knowledgePoint,
    knowledgePoint: plan.knowledgePoint,
    scenario: plan.problemRestatement,
    variables: plan.variables,
    visualGoal: plan.successCriteria[0] ?? `观察 ${plan.knowledgePoint} 的关键关系。`,
    brief: planToBrief(input, plan),
    html,
    interactionType: mapRagHtmlInteractionType(plan),
    parameters: Object.fromEntries(plan.variables.map((variable) => [variable.name, variable.value])),
  };

  const schema: InteractionSchema = {
    type: 'rag_visualization',
    title: artifactTitle(plan),
    description: plan.problemRestatement,
    learningGoals: learningGoalsFromPlan(plan),
    explanationSteps: explanationStepsFromPlan(plan, actions),
    visualizationSpec: spec,
    visualizationPlan: plan,
    auditTrail: feedbackResult.iterations,
    repairTrace: changeLog,
    brief: spec.brief,
    ragMetadata: {
      source: input.source,
      subject: input.subject,
      originalQuestion: input.question,
      taskType: input.taskType,
    },
    htmlWidget: {
      html,
      widgetType: 'rag_visualization',
      widgetConfig,
      allowedMessageTypes: [...ALLOWED_MESSAGES],
    },
  } as InteractionSchema;

  return {
    id: artifactId,
    sessionId,
    type: 'rag_visualization',
    title: schema.title,
    description: schema.description,
    schema,
    status: 'ready',
    version: 1,
    createdAt: now,
    updatedAt: now,
    feedbackLoop: feedbackResult,
    qualityReport,
    finalScore: qualityReport.finalScore,
    generationIterations: feedbackResult.iterations.length,
    changeLog,
    blueprint,
  };
}

function createFeedbackResult(iterations: FeedbackIteration[], bestScore: number): FeedbackLoopResult {
  const lastDecision = iterations.at(-1)?.judgeDecision;
  const finalIssues = iterations.flatMap((iteration) => iteration.evaluations.flatMap((evaluation) => evaluation.issues));
  return {
    passed: lastDecision?.type === 'accept' && bestScore >= 85,
    finalScore: bestScore,
    iterations,
    finalIssues,
    bestVersionReason: iterations.length > 1
      ? `经过 ${iterations.length} 轮多 Agent 审计，最终评分 ${bestScore}/100。`
      : '首轮多 Agent 审计完成。',
  };
}

function createQualityReport(result: FeedbackLoopResult, plan: RagVisualizationGenerationPlan): QualityReport {
  const lastIteration = result.iterations.at(-1);
  const evaluatorScores: Record<string, number> = {};
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  for (const evaluation of lastIteration?.evaluations ?? []) {
    evaluatorScores[evaluation.agentName] = evaluation.score;
    if (evaluation.passed) strengths.push(`${evaluation.agentName} 通过（${evaluation.score}/100）`);
    else weaknesses.push(`${evaluation.agentName} 未通过（${evaluation.score}/100）`);
  }

  for (const issue of result.finalIssues) {
    if (issue.severity === 'high' || issue.severity === 'critical') suggestions.push(issue.suggestion);
  }

  const score = result.finalScore;
  const level: QualityReport['level'] =
    score >= 90 ? 'excellent' :
    score >= 80 ? 'good' :
    score >= 70 ? 'usable' :
    score >= 50 ? 'needs_improvement' : 'failed';

  return {
    finalScore: score,
    level,
    summary: result.passed
      ? `${plan.knowledgePoint}互动可视化已通过多 Agent 审计（${score}/100）。`
      : `${plan.knowledgePoint}互动可视化完成审计，但仍建议人工复核（${score}/100）。`,
    strengths: strengths.length ? strengths : ['安全和运行时门禁已通过。'],
    weaknesses,
    suggestions: Array.from(new Set(suggestions)),
    evaluatorScores,
    passed: result.passed,
    repairTrace: buildRepairTrace(result.iterations),
  };
}

function buildRepairTrace(iterations: FeedbackIteration[]): RepairTraceItem[] {
  return iterations.flatMap((iteration) => {
    const decision = iteration.judgeDecision;
    if (decision.type !== 'repair') return [];
    const trigger = decision.blockingIssues[0]?.category ?? 'ux';
    return [{
      iteration: iteration.iteration,
      trigger: trigger === 'accessibility' || trigger === 'curriculum' ? 'ux' : trigger,
      issue: decision.reason,
      actionTaken: iteration.changeLog?.join('；') || decision.repairInstruction || '按审计意见修复。',
      affectedArea: decision.target,
    } satisfies RepairTraceItem];
  });
}

function createRagTeacherActions(plan: RagVisualizationGenerationPlan): InteractionAction[] {
  return [
    { id: 'rag_intro', type: 'speech', text: `先还原原题：${plan.problemRestatement}`, durationMs: 1200 },
    { id: 'rag_highlight_stage', type: 'highlight_widget_element', target: '#visualization', content: '主舞台展示题目对象和动态变化。', durationMs: 1100 },
    { id: 'rag_start', type: 'set_widget_state', state: { running: true }, durationMs: 1200 },
    { id: 'rag_metrics', type: 'annotate_widget_element', target: '#metrics', content: `观察指标：${plan.metrics.join('、')}`, durationMs: 1200 },
    { id: 'rag_controls', type: 'highlight_widget_element', target: '#controls', content: '用控件切换步骤、重置或改变参数。', durationMs: 1000 },
  ];
}

function explanationStepsFromPlan(
  plan: RagVisualizationGenerationPlan,
  actions: InteractionAction[],
): InteractionSchema['explanationSteps'] {
  const source = plan.rightPanelNarration.length
    ? plan.rightPanelNarration
    : [
        { title: '还原原题', narration: plan.problemRestatement },
        { title: '观察对象', narration: plan.visualObjects.join('、') },
        { title: '动手探索', narration: plan.controls.join('、') },
      ];

  return source.slice(0, 8).map((step, index) => ({
    id: `rag_step_${index + 1}`,
    title: step.title,
    narration: step.narration,
    actions: actions.slice(index, index + 2),
  }));
}

function learningGoalsFromPlan(plan: RagVisualizationGenerationPlan): string[] {
  const goals = [
    `围绕原题理解${plan.knowledgePoint}`,
    ...plan.successCriteria.slice(0, 3),
  ].map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(goals)).slice(0, 4);
}

function planToBrief(input: RagVisualizationAuditInput, plan: RagVisualizationGenerationPlan): RagVisualizationBrief {
  return {
    originalQuestion: input.question,
    knowledgePoint: plan.knowledgePoint,
    scenario: plan.problemRestatement,
    variables: plan.variables,
    visualGoal: plan.successCriteria[0] ?? `通过互动演示理解${plan.knowledgePoint}。`,
    recommendedType: 'interactive_html',
    mustShow: Array.from(new Set([...plan.visualObjects, ...plan.metrics])).slice(0, 8),
    avoidGenericDemo: true,
    confidence: plan.confidence,
    source: 'llm',
  };
}

function createRagLearningBlueprint(
  input: RagVisualizationAuditInput,
  plan: RagVisualizationGenerationPlan,
  now: string,
): LearningBlueprint {
  return {
    id: makeId('rag_blueprint'),
    topic: plan.knowledgePoint,
    originalPrompt: input.question,
    subjectDomain: mapSubjectDomain(input.subject),
    interactionType: 'rag_visualization',
    gradeRange: [10, 12],
    bloomLevel: 'analyze',
    scaffoldingLevel: 'guided',
    coreVariables: plan.variables.map((variable, index) => ({
      name: variable.label,
      symbol: variable.name || `v${index + 1}`,
      unit: variable.unit,
      role: variable.role === 'derived' ? 'dependent' : variable.role === 'controlled' ? 'controlled' : 'independent',
      defaultValue: variable.value,
      description: `${variable.label}=${variable.value}${variable.unit ?? ''}`,
    })),
    expectedInsight: plan.successCriteria[0] ?? `观察${plan.knowledgePoint}中的关键关系。`,
    learningObjectives: learningGoalsFromPlan(plan),
    prerequisites: [],
    knowledgeConstraints: plan.successCriteria.map((item, index) => ({
      id: `rag_constraint_${index + 1}`,
      description: item,
      mustBeTrue: item,
      severity: 'must',
      checkType: 'visual',
    })),
    suggestedVisualStructure: plan.visualObjects.join('、'),
    estimatedDurationMinutes: 6,
    createdAt: now,
  };
}

function withWidgetConfig(
  value: Record<string, unknown>,
  plan: RagVisualizationGenerationPlan,
): NonNullable<InteractionSchema['htmlWidget']>['widgetConfig'] {
  const defaultState = value.defaultState && typeof value.defaultState === 'object'
    ? value.defaultState as Record<string, unknown>
    : Object.fromEntries(plan.variables.map((variable) => [variable.name, variable.value]));
  const messageTargets = Array.isArray(value.messageTargets) && value.messageTargets.length
    ? (value.messageTargets as Array<Record<string, unknown>>).map((target) => ({
        id: String(target.id || '#visualization'),
        purpose: String(target.purpose || '教师动作目标'),
      }))
    : [
        { id: '#visualization', purpose: '主舞台' },
        { id: '#controls', purpose: '控制区' },
        { id: '#metrics', purpose: '指标区' },
      ];

  return {
    concept: String(value.concept || plan.knowledgePoint),
    variables: Array.isArray(value.variables)
      ? value.variables as Array<Record<string, unknown>>
      : plan.variables.map((variable) => ({ ...variable, default: variable.value })),
    defaultState,
    messageTargets,
  };
}

function artifactTitle(plan: RagVisualizationGenerationPlan): string {
  return `${plan.knowledgePoint}互动可视化`;
}

function mapRagHtmlInteractionType(plan: RagVisualizationGenerationPlan): InteractiveHtmlSpec['interactionType'] {
  const type = plan.recommendedType;
  if (type === 'algorithm_trace') return 'algorithm_demo';
  if (type === 'function_graph') return 'math_visualization';
  if (type === 'projectile_motion' || type === 'force_diagram') return 'physics_simulation';
  if (/栈|递归|算法|BFS|DFS/i.test(plan.knowledgePoint)) return 'algorithm_demo';
  if (/函数|图像|极值|导数/.test(plan.knowledgePoint)) return 'math_visualization';
  if (/力|运动|抛|速度|加速度/.test(plan.knowledgePoint)) return 'physics_simulation';
  return 'custom';
}

function mapInteractionSubject(subject: string): InteractionSubject {
  const lower = subject.toLowerCase();
  if (lower.includes('math')) return 'math';
  if (lower.includes('physics')) return 'physics';
  if (lower.includes('chem')) return 'chemistry';
  if (lower.includes('bio')) return 'biology';
  return 'general';
}

function mapSubjectDomain(subject: string): LearningBlueprint['subjectDomain'] {
  const lower = subject.toLowerCase();
  if (lower.includes('computer')) return 'computer_science';
  if (lower.includes('physics')) return 'physics';
  if (lower.includes('math')) return 'math';
  if (lower.includes('chem')) return 'chemistry';
  if (lower.includes('bio')) return 'biology';
  return 'other';
}

function emit(options: RagVisualizationAuditPipelineOptions, event: DeepInteractionStreamEvent): void {
  options.emit?.(event);
}
