import { generateWithConfiguredModel, LlmTruncationError } from '@/lib/generation/llmClient';
import { artifactDesignContractPrompt } from '@/lib/generation/artifactDesignContract';
import { buildInternalMultiAgentPlanningPrompt } from '@/lib/generation/multiAgentGenerationPrompt';
import {
  diagnoseHtmlCompleteness,
  extractWidgetConfig,
  patchTruncatedHtml,
  repairMalformedHtml,
  stripMarkdownCodeFence,
} from '@/lib/generation/htmlSafety';
import { createLogger } from '@/lib/logger';
import { recordGenerationTrace } from '@/lib/generation/trace';
import { withAbortableTimeout } from '@/lib/utils/withTimeout';
import { makeId } from '@/lib/utils/makeId';
import { evaluatePedagogy, type PedagogyEvalContext } from '@/features/deep-interaction/lib/agents/pedagogyEvaluatorAgent';
import { evaluateUX, type UxEvalContext } from '@/features/deep-interaction/lib/agents/uxEvaluatorAgent';
import { evaluateSafety } from '@/features/deep-interaction/lib/agents/safetyEvaluatorAgent';
import { evaluateRuntime } from '@/features/deep-interaction/lib/agents/runtimeEvaluator';
import { judgeEvaluations } from '@/features/deep-interaction/lib/agents/judgeAgent';
import type { RepairContext, RepairResult } from '@/features/deep-interaction/lib/agents/repairAgent';
import { validateInteractionArtifact } from '@/features/deep-interaction/lib/validators';
import type { DeepInteractionStreamEvent } from '@/features/deep-interaction/lib/events';
import type {
  AgentEvaluation,
  FeedbackIteration,
  FeedbackLoopResult,
  InteractionArtifact,
  InteractionSchema,
  InteractionSubject,
  AgentIssue,
  LearningBlueprint,
  QualityReport,
  RepairTraceItem,
} from '@/features/deep-interaction/lib/types';
import type { InteractionAction } from '@/features/deep-interaction/lib/actions/actionTypes';
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
import {
  activeInteractionDiagnosticsToEvaluation,
  diagnoseActiveRagWidgetInteraction,
  type ActiveInteractionDiagnostics,
} from './activeInteractionDiagnostics';
import { buildRagVisualizationDesignContext } from './designContext';
import {
  buildCompactVisualizationSpecContext,
  formatCompactVisualizationSpecContext,
} from './specContext';
import type {
  InteractiveHtmlSpec,
  RagVisualizationBrief,
  RagVisualizationGenerationPlan,
  VisualizationSpec,
  VisualizationType,
} from './types';
import type { RagLightweightVisualizationPlan } from './lightweight_rag_visualization_agents';
import { formatLightweightPlanForPrompt } from './lightweight_rag_visualization_agents';

const log = createLogger('rag-visualization-audit');
// 002B: reduced from 900s (15 min) to 120s; HTML generation should complete in under 2 minutes
const DEFAULT_RAG_WIDGET_HTML_TIMEOUT_MS = 120000;

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
  visualizationSpec?: VisualizationSpec;
  now?: string;
}

export interface RagWidgetHtmlGenerationInput extends RagVisualizationAuditInput {
  plan: RagVisualizationGenerationPlan;
  /** Round 002B: Optional lightweight plan from 5-agent pipeline, injected into HTML prompt. */
  lightweightPlan?: RagLightweightVisualizationPlan;
}

export const RAG_WIDGET_HTML_SYSTEM_PROMPT = `You are STEMotion RAG WidgetHtmlAgent.

Task: generate one complete self-contained HTML document for a problem-specific RAG visualization.

- Return HTML only. No markdown, no prose, no explanation, no code fences.
- Output target: 600–900 lines of clean HTML/CSS/JS. Do NOT pad the output with verbose comments, ASCII diagrams, or duplicate event handlers to fill the token budget. Every line must contribute to functionality.
- Before final output, perform an internal self-check for layout, state machine, runtime protocol, and visible feedback; do NOT write the checklist in the response.
- Use pure inline HTML/CSS/JavaScript.
- No remote resources, network requests, storage APIs, eval, dynamic import, or nested iframes.
- The widget must be problem-specific, not a generic explanation page or a marketing/landing page; 不要营销页式 hero 或装饰性首屏。
- Preserve the original question, variables, known values, and requested result.
- Treat the output as a working interactive prototype and design artifact, not a static mockup.
- Build a high-fidelity, problem-specific educational design artifact; do not produce a generic web page, landing page, or static template.
- The first viewport must show the core interactive stage immediately, with compact controls and visible metrics.
- Implement a real state machine: start/reset/sliders must update state and visibly change SVG/Canvas/DOM metrics.
- Every start/reset button and every slider must cause visible state changes in #visualization or #metrics.
- Fake interaction is not acceptable: hover-only effects, alert(), console.log(), postMessage-only ACKs, or empty listeners do not count.
- Do not include external tool protocol names, hidden environment instructions, or artifact authoring workflow text.
${buildRagVisualizationDesignContext({
  medium: 'problem-specific RAG visualization widget',
  interactionIntent: 'turn the problem plan into a compact, reviewable, interactive learning widget',
})}
${artifactDesignContractPrompt({
  medium: 'problem-specific RAG visualization widget',
  mainStage: 'main visualization/work area',
  supportPanel: 'right explanation/sidebar area',
  supportingContent: 'variables, learning goals, plans, citations, formulas, and long explanations',
})}`;

export interface RagVisualizationAuditPipelineOptions extends RagVisualizationPlanningOptions {
  htmlGenerator?: (input: RagWidgetHtmlGenerationInput) => Promise<string>;
  pedagogyEvaluator?: (ctx: PedagogyEvalContext) => Promise<AgentEvaluation>;
  uxEvaluator?: (ctx: UxEvalContext) => Promise<AgentEvaluation>;
  repairer?: (ctx: RepairContext) => Promise<RepairResult | string>;
  activeInteractionEvaluator?: (html: string) => Promise<ActiveInteractionDiagnostics>;
  emit?: (event: DeepInteractionStreamEvent) => void;
  isAborted?: () => boolean;
  signal?: AbortSignal;
  maxIterations?: number;
  allowRepair?: boolean;
  reviewerProfile?: RagVisualizationReviewerProfile;
  postPublishReviewMode?: 'inline' | 'skip';
  htmlTimeoutMs?: number;
  /** Round 002B: Optional lightweight plan from the 5-agent pipeline. Injected into HTML prompt. */
  lightweightPlan?: import('./lightweight_rag_visualization_agents').RagLightweightVisualizationPlan;
}

export type RagVisualizationReviewerProfile = 'full' | 'lightweight';

export interface RagArtifactQualityReviewInput {
  artifact: InteractionArtifact;
}

export interface RagArtifactQualityReviewOptions {
  pedagogyEvaluator?: (ctx: PedagogyEvalContext) => Promise<AgentEvaluation>;
  uxEvaluator?: (ctx: UxEvalContext) => Promise<AgentEvaluation>;
  emit?: (event: DeepInteractionStreamEvent) => void;
  isAborted?: () => boolean;
  signal?: AbortSignal;
}

export async function runRagVisualizationAuditPipeline(
  input: RagVisualizationAuditInput,
  options: RagVisualizationAuditPipelineOptions = {},
): Promise<InteractionArtifact> {
  const startedAt = Date.now();
  const now = input.now ?? new Date().toISOString();
  const specContext = buildCompactVisualizationSpecContext(input.visualizationSpec);
  const checkAborted = () => {
    if (options.isAborted?.()) throw new Error('已取消');
  };

  emit(options, { type: 'progress', stage: 'planning', message: '正在还原原题与可视化目标...', progress: 8 });
  const plannerOptions = options.lightweightPlan
    ? {
        plannerModel: options.plannerModel,
        // Round 002B perf fix: skip the 99.5s LLM planning call — use pure conversion instead
        skipLlmCall: true as const,
        lightweightPlanForConversion: options.lightweightPlan,
      }
    : { plannerModel: options.plannerModel };

  const plan = await createRagVisualizationGenerationPlan(
    {
      question: input.question,
      answerText: input.answerText,
      subject: input.subject,
      taskType: input.taskType,
      formulaBlocks: input.formulaBlocks,
      finalResults: input.finalResults,
      preferredType: input.preferredType,
      visualizationSpec: input.visualizationSpec,
    },
    plannerOptions,
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
      specContext,
      contract: ['HTML agent generation', 'widget-config', '#visualization', '#controls', '#metrics', 'start/reset', 'publish-first quality report'],
    },
    progress: 24,
  });
  emit(options, {
    type: 'progress',
    stage: 'building_interaction',
    message: '正在生成题目专属互动 HTML/SVG/Canvas...',
    progress: 42,
  });

  const generationIssues: AgentIssue[] = [];
  const changeLog: string[] = [];
  let rawHtml: string;
  try {
    rawHtml = options.htmlGenerator
      ? await options.htmlGenerator({ ...input, plan })
      : await generateRagWidgetHtml({ ...input, plan, lightweightPlan: options.lightweightPlan }, options.signal, options.htmlTimeoutMs);
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    const reason = summarizeGenerationError(error);
    const fallbackMessage = `HTML LLM 生成失败，已降级使用本地 fallback artifact：${reason}`;
    log.warn('RAG widget HTML generation failed, using deterministic fallback', { error: reason });
    recordGenerationTrace({
      event: 'runner_event',
      stage: 'rag_widget_html_fallback',
      summary: {
        reason,
        fallback: 'deterministic_html',
      },
    });
    emit(options, {
      type: 'progress',
      stage: 'building_interaction',
      message: 'HTML 生成超时或返回为空，已切换本地可视化 fallback...',
      progress: 55,
    });
    changeLog.push(fallbackMessage);
    generationIssues.push(createHtmlGenerationFallbackIssue(reason));
    rawHtml = createDeterministicRagWidgetHtml({ ...input, plan }, reason);
  }
  const currentHtml = normalizeCandidateHtml(rawHtml);
  const currentActions = createRagTeacherActions(plan);
  const blueprint = createRagLearningBlueprint(input, plan, now);
  const maxIterations = 1;
  const reviewerProfile = options.reviewerProfile ?? 'full';
  const postPublishReviewMode = options.postPublishReviewMode ?? 'inline';

  emit(options, { type: 'validation_started', message: '正在校验安全、运行时与交互质量...', progress: 68 });
  emit(options, {
    type: 'feedback_started',
    message: reviewerProfile === 'lightweight'
      ? '开始 RAG 可视化轻量确定性诊断...'
      : '开始 RAG 可视化发布前确定性诊断...',
    progress: 72,
  });

  checkAborted();
  emit(options, {
    type: 'feedback_iteration_started',
    iteration: 1,
    maxIterations,
    message: '发布前确定性诊断...',
    progress: 79,
  });
  emit(options, {
    type: 'evaluator_started',
    iteration: 1,
    agentName: 'Active Interaction Evaluator',
    message: '主动点击与滑块交互验收中...',
    progress: 82,
  });

  const finalSafety = evaluateSafety(currentHtml);
  const finalRuntime = evaluateRuntime(currentHtml);
  const finalContractDiagnostic = diagnoseRagWidgetContract(currentHtml);
  const contractEval = contractDiagnosticToEvaluation(finalContractDiagnostic);
  const finalActiveInteractionDiagnostic = await runActiveInteractionDiagnostic(currentHtml, options);
  const finalActiveInteractionEval = activeInteractionDiagnosticsToEvaluation(finalActiveInteractionDiagnostic);
  const deterministicEvaluations = [
    finalSafety,
    finalRuntime,
    ...(contractEval ? [contractEval] : []),
    finalActiveInteractionEval,
  ];

  for (const evaluation of deterministicEvaluations) {
    emit(options, { type: 'evaluator_completed', iteration: 1, evaluation, progress: 86 });
  }

  const finalGateIssues = uniqueIssues([
    ...generationIssues,
    ...collectFinalGateIssues({
    safetyEval: finalSafety,
    runtimeEval: finalRuntime,
    contractDiagnostic: finalContractDiagnostic,
    activeInteractionEval: finalActiveInteractionEval,
    }),
  ]);
  if (finalGateIssues.length > 0) {
    const releaseWarning = 'HTML 审计未通过，但已按放行策略发布，建议人工复核。';
    changeLog.push(releaseWarning);
    log.warn('RAG visualization audit released with warnings', {
      issues: finalGateIssues.length,
      repairAttempts: 0,
      categories: Array.from(new Set(finalGateIssues.map((issue) => issue.category))),
    });
  }

  const deterministicDecision = judgeEvaluations(deterministicEvaluations);
  emit(options, { type: 'judge_decision', iteration: 1, decision: deterministicDecision, progress: 88 });
  const deterministicIteration: FeedbackIteration = {
    iteration: 1,
    evaluations: deterministicEvaluations,
    judgeDecision: deterministicDecision,
    scoreBefore: 0,
    scoreAfter: deterministicDecision.finalScore,
    createdAt: new Date().toISOString(),
  };
  const feedbackResult = createFeedbackResult([deterministicIteration], deterministicDecision.finalScore, finalGateIssues);
  const qualityReport = withQualityReportStatus(
    createQualityReport(feedbackResult, plan),
    reviewerProfile === 'full' ? 'reviewing' : 'deterministic_ready',
  );
  let artifact = createArtifact({
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

  validateInteractionArtifact(artifact, { skipHtmlSafety: true });
  emit(options, { type: 'artifact_ready', artifact, progress: 100 });

  if (reviewerProfile === 'full' && postPublishReviewMode !== 'skip') {
    checkAborted();
    emit(options, {
      type: 'feedback_started',
      message: 'artifact 已发布，正在进行发布后 Pedagogy + UX + Reviewer/Critic 质量报告...',
      progress: 92,
    });
    emit(options, { type: 'evaluator_started', iteration: 1, agentName: 'Pedagogy Evaluator', message: '发布后教学一致性评估中...', progress: 93 });
    emit(options, { type: 'evaluator_started', iteration: 1, agentName: 'UX Evaluator', message: '发布后交互体验评估中...', progress: 93 });
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
        signal: options.signal,
      }),
      (options.uxEvaluator ?? evaluateUX)({
        html: currentHtml,
        title: artifactTitle(plan),
        concept: plan.knowledgePoint,
        interactionType: 'rag_visualization',
        variables: plan.variables.map((variable) => ({ name: variable.name, label: variable.label })),
        signal: options.signal,
      }),
    ]);
    const deepEvaluations = [...deterministicEvaluations, pedagogyEval, uxEval];
    for (const evaluation of [pedagogyEval, uxEval]) {
      emit(options, { type: 'evaluator_completed', iteration: 1, evaluation, progress: 95 });
    }
    const deepDecision = judgeEvaluations(deepEvaluations);
    emit(options, { type: 'judge_decision', iteration: 1, decision: deepDecision, progress: 96 });
    const deepIteration: FeedbackIteration = {
      iteration: 1,
      evaluations: deepEvaluations,
      judgeDecision: deepDecision,
      scoreBefore: deterministicDecision.finalScore,
      scoreAfter: deepDecision.finalScore,
      changeLog: ['发布后 Reviewer/Critic 风格质量报告完成；HTML 未自动修改。'],
      createdAt: new Date().toISOString(),
    };
    const deepFeedbackResult = createFeedbackResult([deepIteration], deepDecision.finalScore, finalGateIssues);
    const deepQualityReport = withQualityReportStatus(createQualityReport(deepFeedbackResult, plan), 'reviewed');
    const deepChangeLog = [...changeLog, '发布后 Reviewer/Critic 风格质量报告完成；HTML 未自动修改。'];
    artifact = updateArtifactQuality(artifact, deepFeedbackResult, deepQualityReport, deepChangeLog, now);
    emit(options, {
      type: 'artifact_quality_updated',
      artifactId: artifact.id,
      qualityReport: deepQualityReport,
      feedbackLoop: deepFeedbackResult,
      finalScore: deepQualityReport.finalScore,
      changeLog: deepChangeLog,
      progress: 98,
    });
  }

  emit(options, { type: 'feedback_completed', result: artifact.feedbackLoop!, qualityReport: artifact.qualityReport!, progress: 99 });

  log.info('RAG visualization audit pipeline completed', {
    artifactId: artifact.id,
    elapsed: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    score: artifact.finalScore,
  });

  return artifact;
}

export async function runRagArtifactQualityReview(
  input: RagArtifactQualityReviewInput,
  options: RagArtifactQualityReviewOptions = {},
): Promise<InteractionArtifact> {
  const artifact = input.artifact;
  const now = new Date().toISOString();
  const checkAborted = () => {
    if (options.isAborted?.()) throw new Error('已取消');
  };

  if (artifact.schema.type !== 'rag_visualization') {
    throw new Error('artifact_quality_review only supports rag_visualization artifacts.');
  }

  const plan = artifact.schema.visualizationPlan;
  if (!plan) {
    const failedReport = markQualityReviewFailed(
      artifact.qualityReport,
      '缺少 RAG visualizationPlan，无法执行发布后质量报告。',
    );
    return {
      ...artifact,
      qualityReport: failedReport,
      finalScore: failedReport.finalScore,
      updatedAt: now,
    };
  }

  const currentHtml = artifact.schema.htmlWidget?.html
    || (artifact.schema.visualizationSpec.type === 'interactive_html' ? artifact.schema.visualizationSpec.html : '');
  const blueprint = artifact.blueprint;
  const existingEvaluations = artifact.feedbackLoop?.iterations.at(-1)?.evaluations ?? [];
  const existingFinalIssues = artifact.feedbackLoop?.finalIssues ?? [];
  const scoreBefore = artifact.feedbackLoop?.finalScore ?? artifact.finalScore ?? 0;
  const actionsSummary = artifact.schema.explanationSteps
    .flatMap((step) => step.actions ?? [])
    .map((action) => action.type)
    .join(', ');

  checkAborted();
  emit(options, {
    type: 'feedback_started',
    message: '正在后台更新互动可视化质量报告...',
    progress: 15,
  });
  emit(options, { type: 'evaluator_started', iteration: 1, agentName: 'Pedagogy Evaluator', message: '后台教学一致性评估中...', progress: 35 });
  emit(options, { type: 'evaluator_started', iteration: 1, agentName: 'UX Evaluator', message: '后台交互体验评估中...', progress: 35 });

  const [pedagogyEval, uxEval] = await Promise.all([
    (options.pedagogyEvaluator ?? evaluatePedagogy)({
      prompt: artifact.schema.ragMetadata.originalQuestion,
      title: artifact.title,
      concept: plan.knowledgePoint,
      description: plan.problemRestatement,
      subject: mapInteractionSubject(artifact.schema.ragMetadata.subject),
      gradeLevel: 'high_school',
      interactionType: 'rag_visualization',
      learningGoals: learningGoalsFromPlan(plan),
      htmlPreview: currentHtml.slice(0, 1200),
      actionsSummary,
      blueprint,
      signal: options.signal,
    }),
    (options.uxEvaluator ?? evaluateUX)({
      html: currentHtml,
      title: artifact.title,
      concept: plan.knowledgePoint,
      interactionType: 'rag_visualization',
      variables: plan.variables.map((variable) => ({ name: variable.name, label: variable.label })),
      signal: options.signal,
    }),
  ]);

  for (const evaluation of [pedagogyEval, uxEval]) {
    emit(options, { type: 'evaluator_completed', iteration: 1, evaluation, progress: 70 });
  }

  const deepEvaluations = [...existingEvaluations, pedagogyEval, uxEval];
  const deepDecision = judgeEvaluations(deepEvaluations);
  emit(options, { type: 'judge_decision', iteration: 1, decision: deepDecision, progress: 82 });
  const deepIteration: FeedbackIteration = {
    iteration: 1,
    evaluations: deepEvaluations,
    judgeDecision: deepDecision,
    scoreBefore,
    scoreAfter: deepDecision.finalScore,
    changeLog: ['后台 Reviewer/Critic 质量报告完成；HTML 未自动修改。'],
    createdAt: now,
  };
  const deepFeedbackResult = createFeedbackResult([deepIteration], deepDecision.finalScore, existingFinalIssues);
  const deepQualityReport = withQualityReportStatus(createQualityReport(deepFeedbackResult, plan), 'reviewed');
  const deepChangeLog = [
    ...(artifact.changeLog ?? []),
    '后台 Reviewer/Critic 质量报告完成；HTML 未自动修改。',
  ];
  const updatedArtifact = updateArtifactQuality(artifact, deepFeedbackResult, deepQualityReport, deepChangeLog, now);

  emit(options, {
    type: 'artifact_quality_updated',
    artifactId: artifact.id,
    qualityReport: deepQualityReport,
    feedbackLoop: deepFeedbackResult,
    finalScore: deepQualityReport.finalScore,
    changeLog: deepChangeLog,
    progress: 95,
  });
  emit(options, { type: 'feedback_completed', result: deepFeedbackResult, qualityReport: deepQualityReport, progress: 99 });

  return updatedArtifact;
}

export async function generateRagWidgetHtml(
  input: RagWidgetHtmlGenerationInput,
  parentSignal?: AbortSignal,
  timeoutMs = resolveRagWidgetHtmlTimeoutMs(),
  deps: { generate?: typeof generateWithConfiguredModel } = {},
): Promise<string> {
  const prompt = buildRagWidgetHtmlPrompt(input);
  const generate = deps.generate ?? generateWithConfiguredModel;
  let streamedPartial = '';
  let raw: string;

  try {
    raw = await withAbortableTimeout(
      (signal) => generate({
        messages: [
          {
            role: 'system',
            content: RAG_WIDGET_HTML_SYSTEM_PROMPT,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        requestPreset: 'artifact',
        profileRole: 'artifact',
        signal,
        metadata: {
          stage: 'rag_widget_html',
          promptVersion: 'rag-widget-html-v1',
        },
        onTextDelta: (delta) => {
          streamedPartial += delta;
        },
      }),
      timeoutMs,
      'RAG visualization HTML generation timed out.',
      parentSignal,
    );
  } catch (error) {
    if (error instanceof LlmTruncationError) {
      raw = error.partialContent;
    } else if (isRagWidgetHtmlTimeoutError(error) && streamedPartial.trim().length > 0) {
      log.warn('RAG widget HTML generation timed out after partial stream, recovering partial HTML', {
        partialChars: streamedPartial.length,
        timeoutMs,
      });
      recordGenerationTrace({
        event: 'llm_partial_recovered',
        stage: 'rag_widget_html',
        summary: {
          reason: 'timeout_with_partial_html',
          partialChars: streamedPartial.length,
          timeoutMs,
        },
      });
      raw = streamedPartial;
    } else {
      throw error;
    }
  }

  return normalizeCandidateHtml(raw);
}

export function resolveRagWidgetHtmlTimeoutMs(envValue = process.env.STEMOTION_RAG_WIDGET_HTML_TIMEOUT_MS): number {
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RAG_WIDGET_HTML_TIMEOUT_MS;
  return Math.max(5000, Math.min(900000, Math.floor(parsed)));
}

function createHtmlGenerationFallbackIssue(reason: string): AgentIssue {
  return {
    id: 'rag_html_generation_fallback_1',
    severity: 'high',
    category: 'runtime',
    message: 'HTML LLM 生成失败，使用本地 fallback HTML。',
    evidence: reason,
    suggestion: '检查对应 generation job trace 中的 rag_widget_html LLM request/response；必要时缩短 artifact prompt 或切换更稳定的 artifact 模型。',
    target: 'html',
  };
}

function createDeterministicRagWidgetHtml(input: RagWidgetHtmlGenerationInput, reason: string): string {
  const plan = input.plan;
  const steps = fallbackStepsFromInput(input);
  const config = {
    concept: plan.knowledgePoint,
    variables: [
      { name: 'speed', label: '播放速度', default: 2 },
      ...plan.variables.slice(0, 6).map((variable) => ({
        name: variable.name,
        label: variable.label,
        default: variable.value,
        ...(variable.unit ? { unit: variable.unit } : {}),
      })),
    ],
    defaultState: {
      running: false,
      step: 0,
      speed: 2,
    },
    messageTargets: [
      { id: '#visualization', purpose: '主舞台' },
      { id: '#controls', purpose: '控制区' },
      { id: '#metrics', purpose: '指标区' },
    ],
  };
  const title = artifactTitle(plan);
  const metrics = plan.metrics.length ? plan.metrics.slice(0, 6) : ['当前步骤', '状态', '观察目标'];
  const visualObjects = plan.visualObjects.length ? plan.visualObjects.slice(0, 6) : ['原题对象', '关键变量', '结果变化'];
  const questionPreview = input.question.slice(0, 180);

  return normalizeCandidateHtml(`<!DOCTYPE html>
<html lang="zh-CN" data-rag-fallback-html="true">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink: #102033; --muted: #5c667a; --line: #d9e2ef; --accent: #0f766e; --blue: #2563eb; --amber: #d97706; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fb; color: var(--ink); }
    main { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
    header { padding: 12px 16px; border-bottom: 1px solid var(--line); background: #ffffff; }
    h1 { margin: 0; font-size: clamp(18px, 2vw, 24px); line-height: 1.2; }
    header p { margin: 6px 0 0; max-width: 980px; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .shell { min-height: 0; display: grid; grid-template-columns: minmax(0, 72fr) minmax(250px, 28fr); gap: 0; }
    #visualization { min-height: 520px; display: grid; grid-template-rows: auto minmax(320px, 1fr); padding: 14px; background: #f8fbff; }
    .stage-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .badge { display: inline-flex; align-items: center; border: 1px solid #bde8de; background: #e8fbf7; color: #0f766e; border-radius: 6px; padding: 4px 8px; font-size: 12px; font-weight: 800; }
    .stage-card { min-height: 0; border: 1px solid var(--line); background: #ffffff; border-radius: 8px; overflow: hidden; }
    svg { display: block; width: 100%; height: 100%; min-height: 320px; }
    #controls { border-left: 1px solid var(--line); background: #ffffff; padding: 14px; display: grid; align-content: start; gap: 12px; }
    .control-row { display: flex; gap: 8px; flex-wrap: wrap; }
    button { min-height: 40px; border: 1px solid #0f766e; background: #0f766e; color: #ffffff; border-radius: 6px; padding: 0 14px; font-weight: 800; cursor: pointer; }
    button.secondary { background: #ffffff; color: #0f766e; }
    label { display: grid; gap: 6px; color: #344256; font-size: 13px; font-weight: 700; }
    input[type="range"] { width: 100%; accent-color: #0f766e; }
    #metrics { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .metric { border: 1px solid var(--line); background: #f8fafc; border-radius: 7px; padding: 9px; }
    .metric span { display: block; color: var(--muted); font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .metric strong { display: block; margin-top: 3px; font-size: 15px; }
    .steps { display: grid; gap: 6px; }
    .step { border: 1px solid var(--line); border-radius: 6px; padding: 8px; font-size: 12px; color: #405066; background: #ffffff; }
    .step[data-active="true"] { border-color: #0f766e; background: #ecfdf5; color: #0f392f; font-weight: 800; }
    .fallback-note { color: #8a5a00; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 8px; font-size: 12px; line-height: 1.45; }
    @media (max-width: 860px) {
      .shell { grid-template-columns: 1fr; }
      #controls { border-left: 0; border-top: 1px solid var(--line); }
      #visualization { min-height: 420px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(questionPreview)}${input.question.length > 180 ? '...' : ''}</p>
    </header>
    <section class="shell" aria-label="RAG 可视化 fallback">
      <section id="visualization" data-role="simulation-main" data-running="false">
        <div class="stage-head">
          <span class="badge">本地 fallback 可视化</span>
          <span class="badge" id="step-label">步骤 1 / ${steps.length}</span>
        </div>
        <div class="stage-card">
          <svg id="fallback-svg" viewBox="0 0 900 520" role="img" aria-label="${escapeAttr(plan.knowledgePoint)}状态演示">
            <defs>
              <linearGradient id="barGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#2dd4bf"></stop>
                <stop offset="100%" stop-color="#2563eb"></stop>
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="900" height="520" fill="#f8fbff"></rect>
            <g stroke="#d9e2ef" stroke-width="1">
              <line x1="70" y1="430" x2="820" y2="430"></line>
              <line x1="70" y1="80" x2="70" y2="430"></line>
            </g>
            <text x="70" y="48" fill="#102033" font-size="24" font-weight="800">${escapeSvgText(plan.knowledgePoint)}</text>
            <text id="svg-operation" x="70" y="76" fill="#5c667a" font-size="15">${escapeSvgText(steps[0]?.operation ?? '观察状态变化')}</text>
            <g id="bar-layer"></g>
            <g id="stack-layer"></g>
            <g id="output-layer"></g>
            <circle id="scan-marker" cx="110" cy="120" r="12" fill="#d97706"></circle>
          </svg>
        </div>
      </section>
      <aside id="controls" data-role="control-panel">
        <div class="control-row">
          <button id="start-btn" type="button">开始</button>
          <button id="reset-btn" class="secondary" type="button">重置</button>
        </div>
        <label>
          播放速度 <span id="speed-value">2</span>
          <input id="speed" data-var="speed" type="range" min="1" max="5" step="1" value="2">
        </label>
        <label>
          步骤 <span id="step-value">1</span>
          <input id="step-slider" data-var="step" type="range" min="0" max="${Math.max(0, steps.length - 1)}" step="1" value="0">
        </label>
        <section id="metrics" data-role="observation-panel">
          ${metrics.map((metric, index) => `<div class="metric"><span>${escapeHtml(metric)}</span><strong id="metric-${index}">${index === 0 ? escapeHtml(steps[0]?.operation ?? '准备观察') : escapeHtml(visualObjects[index - 1] ?? plan.knowledgePoint)}</strong></div>`).join('')}
        </section>
        <div class="steps" id="step-list">
          ${steps.map((step, index) => `<div class="step" data-step-index="${index}" data-active="${index === 0 ? 'true' : 'false'}">${escapeHtml(step.operation)}</div>`).join('')}
        </div>
        <div class="fallback-note">LLM artifact 未能及时返回可见 HTML，当前页面由系统根据原题规划生成，可继续用于预览和保存。原因：${escapeHtml(reason)}</div>
      </aside>
    </section>
  </main>
  <script type="application/json" id="widget-config">${safeJsonForScript(config)}</script>
  <script type="application/json" id="fallback-steps">${safeJsonForScript(steps)}</script>
  <script>
    (function(){
      var steps = JSON.parse(document.getElementById('fallback-steps').textContent || '[]');
      if (!steps.length) steps = [{ operation: '观察状态变化', explanation: '根据原题规划观察关键状态。', state: {} }];
      var state = { running: false, step: 0, speed: 2 };
      var lastAdvance = 0;
      var stage = document.getElementById('visualization');
      var stepLabel = document.getElementById('step-label');
      var stepValue = document.getElementById('step-value');
      var speedValue = document.getElementById('speed-value');
      var stepSlider = document.getElementById('step-slider');
      var speedSlider = document.getElementById('speed');
      var barLayer = document.getElementById('bar-layer');
      var stackLayer = document.getElementById('stack-layer');
      var outputLayer = document.getElementById('output-layer');
      var marker = document.getElementById('scan-marker');
      var operationText = document.getElementById('svg-operation');

      function post(type, payload) {
        window.parent.postMessage(Object.assign({ type: type }, payload || {}), '*');
      }
      function currentStep() {
        return steps[Math.max(0, Math.min(steps.length - 1, state.step))] || steps[0];
      }
      function formatValue(value) {
        if (Array.isArray(value)) return '[' + value.join(', ') + ']';
        if (value && typeof value === 'object') return JSON.stringify(value);
        return String(value == null ? 'unknown' : value);
      }
      function setMetric(index, value) {
        var el = document.getElementById('metric-' + index);
        if (el) el.textContent = value;
      }
      function drawBars(step) {
        var values = [2, 1, 2, 4, 3];
        var stateValues = step.state && typeof step.state === 'object' ? Object.values(step.state).flat() : [];
        var numeric = stateValues.map(Number).filter(function(value){ return Number.isFinite(value); }).map(function(value){ return Math.max(0, value); }).slice(0, 8);
        if (numeric.length >= 3) values = numeric;
        var max = Math.max.apply(null, values.map(function(value){ return Math.abs(Number(value)); }).concat([1]));
        barLayer.innerHTML = values.map(function(value, index){
          var normalizedValue = Math.max(0, Number(value));
          var height = 44 + Math.min(1, normalizedValue / max) * 220;
          var x = 110 + index * 86;
          var y = 420 - height;
          var active = index === state.step % values.length;
          return '<g transform="translate(' + x + ' 0)"><rect x="0" y="' + y + '" width="48" height="' + height + '" rx="8" fill="' + (active ? '#d97706' : 'url(#barGradient)') + '" opacity="' + (state.running || active ? '1' : '0.72') + '"></rect><text x="24" y="452" text-anchor="middle" fill="#5c667a" font-size="13">' + value + '</text></g>';
        }).join('');
      }
      function drawState(step) {
        var entries = Object.entries(step.state || {}).slice(0, 3);
        stackLayer.innerHTML = entries.map(function(entry, row){
          var label = entry[0];
          var value = formatValue(entry[1]).slice(0, 42);
          var y = 126 + row * 54;
          return '<g><rect x="610" y="' + y + '" width="230" height="38" rx="8" fill="#eef7ff" stroke="#bfdbfe"></rect><text x="626" y="' + (y + 24) + '" fill="#102033" font-size="13">' + label + ': ' + value.replace(/[<>&]/g, '') + '</text></g>';
        }).join('');
        outputLayer.innerHTML = '<text x="610" y="314" fill="#5c667a" font-size="14">' + String(step.explanation || '').slice(0, 46).replace(/[<>&]/g, '') + '</text>';
      }
      window.draw = function draw() {
        var step = currentStep();
        if (stage) stage.setAttribute('data-running', state.running ? 'true' : 'false');
        if (stage) stage.setAttribute('data-step', String(state.step));
        if (stage) stage.setAttribute('data-speed', String(state.speed));
        if (stepLabel) stepLabel.textContent = '步骤 ' + (state.step + 1) + ' / ' + steps.length;
        if (stepValue) stepValue.textContent = String(state.step + 1);
        if (speedValue) speedValue.textContent = String(state.speed);
        if (stepSlider && Number(stepSlider.value) !== state.step) stepSlider.value = String(state.step);
        if (speedSlider && Number(speedSlider.value) !== state.speed) speedSlider.value = String(state.speed);
        if (operationText) operationText.textContent = step.operation || '观察状态变化';
        if (marker) {
          marker.setAttribute('cx', String(110 + (state.step % 8) * 86));
          marker.setAttribute('r', String(8 + state.speed));
        }
        drawBars(step);
        drawState(step);
        setMetric(0, step.operation || '观察状态变化');
        setMetric(1, formatValue(step.state || {}));
        setMetric(2, (state.running ? '播放中' : '已暂停') + ' · 速度 ' + state.speed);
        document.querySelectorAll('[data-step-index]').forEach(function(el){
          el.setAttribute('data-active', Number(el.getAttribute('data-step-index')) === state.step ? 'true' : 'false');
        });
      };
      window.update = function update(){ window.draw(); };
      document.getElementById('start-btn').addEventListener('click', function(){
        state.running = !state.running;
        state.step = (state.step + 1) % steps.length;
        post('WIDGET_ACTION_ACK', { action: 'start', state: state });
        window.update();
      });
      document.getElementById('reset-btn').addEventListener('click', function(){
        state.running = false;
        state.step = 0;
        state.speed = 2;
        post('WIDGET_ACTION_ACK', { action: 'reset', state: state });
        window.update();
      });
      speedSlider.addEventListener('input', function(event){
        state.speed = Number(event.target.value) || 2;
        post('WIDGET_ACTION_ACK', { action: 'range:speed', state: state });
        window.update();
      });
      speedSlider.addEventListener('change', function(){ window.update(); });
      stepSlider.addEventListener('input', function(event){
        state.step = Math.max(0, Math.min(steps.length - 1, Number(event.target.value) || 0));
        post('WIDGET_ACTION_ACK', { action: 'range:step', state: state });
        window.update();
      });
      stepSlider.addEventListener('change', function(){ window.update(); });
      window.addEventListener('error', function(event){
        post('WIDGET_RUNTIME_ERROR', { message: String(event.message || event.error || 'runtime error') });
      });
      window.addEventListener('message', function(event){
        var data = event.data || {};
        if (data.type === 'PING') post('WIDGET_PONG', { state: state });
        if (data.type === 'SET_WIDGET_STATE' && data.state) { Object.assign(state, data.state); window.update(); }
        if (data.type === 'HIGHLIGHT_ELEMENT') {
          var target = document.querySelector(data.target || '#visualization');
          if (target) target.setAttribute('data-highlighted', 'true');
        }
        if (data.type === 'ANNOTATE_ELEMENT') {
          var noteTarget = document.querySelector(data.target || '#metrics');
          if (noteTarget) noteTarget.setAttribute('data-note', data.content || '');
        }
        if (data.type === 'REVEAL_ELEMENT') {
          var revealTarget = document.querySelector(data.target || '#visualization');
          if (revealTarget) revealTarget.removeAttribute('hidden');
        }
      });
      function animate(timestamp) {
        if (state.running && timestamp - lastAdvance > Math.max(180, 950 / Math.max(1, state.speed))) {
          state.step = (state.step + 1) % steps.length;
          lastAdvance = timestamp;
        }
        window.update();
        post('WIDGET_RUNTIME_REPORT', { state: state });
        requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
      window.update();
      post('WIDGET_READY', { state: state });
    })();
  </script>
</body>
</html>`);
}

interface DeterministicFallbackStep {
  operation: string;
  explanation: string;
  state: Record<string, unknown>;
}

function fallbackStepsFromInput(input: RagWidgetHtmlGenerationInput): DeterministicFallbackStep[] {
  const spec = input.visualizationSpec;
  if (spec?.type === 'algorithm_trace' && spec.steps.length > 0) {
    return spec.steps.slice(0, 10).map((step) => ({
      operation: step.operation || `步骤 ${step.stepIndex}`,
      explanation: step.explanation || '观察算法状态变化。',
      state: step.state && typeof step.state === 'object' ? step.state : {},
    }));
  }

  if (spec?.type === 'projectile_motion') {
    return [
      {
        operation: '读取运动参数',
        explanation: spec.description,
        state: {
          v0: spec.parameters.v0 ?? 'unknown',
          angle: spec.parameters.angle_deg ?? 'unknown',
          g: spec.parameters.g,
        },
      },
      {
        operation: '观察轨迹变化',
        explanation: '调整时间或速度，观察位置和指标变化。',
        state: {
          motionType: spec.motionType ?? 'generic',
          time: spec.parameters.time_s ?? 'demo',
        },
      },
    ];
  }

  const plan = input.plan;
  const requirements = plan.animationRequirements.length ? plan.animationRequirements : plan.successCriteria;
  const source = requirements.length ? requirements : ['观察关键对象变化', '对照指标理解结果'];
  const steps = source.slice(0, 8).map((item, index) => ({
    operation: item,
    explanation: plan.rightPanelNarration[index]?.narration ?? `围绕${plan.knowledgePoint}观察第 ${index + 1} 个关键状态。`,
    state: {
      step: index + 1,
      object: plan.visualObjects[index % Math.max(1, plan.visualObjects.length)] ?? plan.knowledgePoint,
      metric: plan.metrics[index % Math.max(1, plan.metrics.length)] ?? '观察指标',
    },
  }));

  return steps.length ? steps : [{
    operation: '观察状态变化',
    explanation: `根据原题规划观察${plan.knowledgePoint}。`,
    state: { concept: plan.knowledgePoint },
  }];
}

function summarizeGenerationError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function isRagWidgetHtmlTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timed?\s*out|timeout|超时/i.test(error.message);
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/timed?\s*out|timeout|超时/i.test(error.message)) return false;
  return error.name === 'AbortError' || /已取消|cancelled|canceled|user aborted/i.test(error.message);
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function escapeSvgText(value: string): string {
  return escapeHtml(value);
}

export function buildRagWidgetHtmlPrompt(input: {
  question: string;
  answerText?: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  visualizationSpec?: VisualizationSpec;
  plan: RagVisualizationGenerationPlan;
  lightweightPlan?: import('./lightweight_rag_visualization_agents').RagLightweightVisualizationPlan;
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
  const specText = formatCompactVisualizationSpecContext(
    buildCompactVisualizationSpecContext(input.visualizationSpec),
  );

  return `## 目标
生成一个 problem-specific RAG visualization widget。Use a single-pass / 一次性 high-resource strategy: spend the budget on one complete HTML document,真实状态机、SVG/Canvas/DOM 联动、首屏主舞台和可见反馈。
Treat the output as a working interactive prototype, not a static mockup, static spec previews, or explanation-only page.
Before final output, do an internal self-check for complete HTML, widget-config, #visualization/#controls/#metrics, start/reset/slider visible state change, runtime protocol, and mobile fit.
Return only complete HTML. No Markdown, no prose, no JSON summary, no fragment.

## 题目事实
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

必须遵守的题目规划：
${JSON.stringify(input.plan, null, 2)}

结构化 spec context（只用于保真，不允许直接套 deterministic renderer 或把 spec dump 到页面）：
${specText}

${input.lightweightPlan
  ? `## 002B 轻量 Agent 中间产物（优先参考）
${formatLightweightPlanForPrompt(input.lightweightPlan)}

`
  : ''}
${buildInternalMultiAgentPlanningPrompt({
  mode: 'artifact',
  artifactKind: 'problem-specific RAG visualization widget HTML',
  outputInstruction: 'Return only complete HTML. No Markdown, JSON summary, prose, or internal agent notes.',
})}

## 布局骨架
- 第一屏必须直接显示 main visualization/work area、compact controls、live metrics。
- 主舞台 id="visualization"，控制区 id="controls"，指标区 id="metrics"。
- 主舞台优先，说明/变量/学习目标/引用/长解释进入紧凑侧栏、details 或 secondary panel；不是通用解释页，不要营销页式 hero、静态 spec previews 或大段装饰空白。
- 移动端 375px 不横向溢出，1366x768 和 1440x900 首屏可操作，避免卡片套卡片。

设计上下文（落实到 HTML/CSS/交互，不要堆成可见长说明）：
${buildRagVisualizationDesignContext({
  medium: 'problem-specific RAG visualization widget',
  originalQuestion: input.question,
  variables: input.plan.variables,
  visualObjects: input.plan.visualObjects,
  controls: input.plan.controls,
  metrics: input.plan.metrics,
  interactionIntent: input.plan.animationRequirements.join('；') || input.plan.problemRestatement,
})}

## 状态机
- Use const state = {...} or var state = {...}; state must include running and real problem variables/defaultState.
- Implement function draw() { ... }, function update() { draw(); ... }, and function animate() { update(); window.parent.postMessage({ type: 'WIDGET_RUNTIME_REPORT', state }, '*'); requestAnimationFrame(animate); }.
- Include a real <button id="start-btn" type="button"> control; start-btn click toggles state.running and creates a visible state change.
- Include a real <button id="reset-btn" type="button"> control; reset-btn click restores defaultState and creates a visible state change.
- slider input/change updates real state variables and immediately changes #visualization or #metrics.
- Visible state change must be inspectable in SVG/Canvas/DOM text, metrics, transforms, classes, attributes, or canvas pixels after user input.

## 运行时协议
- Include <script type="application/json" id="widget-config"> with concept, variables, defaultState, messageTargets.
- Listen to window message and handle PING, SET_WIDGET_STATE, HIGHLIGHT_ELEMENT, ANNOTATE_ELEMENT, REVEAL_ELEMENT.
- Send WIDGET_READY, WIDGET_RUNTIME_REPORT, WIDGET_RUNTIME_ERROR, WIDGET_PONG, WIDGET_ACTION_ACK.
- Use requestAnimationFrame for animationRequirements: ${input.plan.animationRequirements.join('；')}.
- Draw problem-specific objects with SVG or Canvas: ${input.plan.visualObjects.join('、')}.
- Metrics must show: ${input.plan.metrics.join('、')}.

## 禁止项
- Fake interaction is forbidden: alert()/console.log-only handlers, hover-only styling, empty listeners, unchanged state, or generic fallback visuals.
- Do not change the problem into a similar example; titles, variables, labels, and operation steps must match the original question.
- Do not invent parameters; use unknown or clearly mark default demo values when values are missing.
- No remote resources, network requests, storage APIs, eval, dynamic import, nested iframes, or external scripts/styles.

## 输出格式
- Output one complete <!DOCTYPE html> document with inline CSS and JS only.
- If this is an algorithm problem, show input, current step, data structure state, and output result.
- If this is a physics/math problem, show variable changes, formula relationships, and result metrics.
- Follow the shared artifact design contract:
${artifactDesignContractPrompt({
  medium: 'problem-specific RAG visualization widget',
  mainStage: 'main visualization/work area',
  supportPanel: 'right explanation/sidebar area',
  supportingContent: 'the original question, variables, demonstration plan, learning goals, citations, formulas, and long explanations',
})}`;
}

function normalizeCandidateHtml(raw: string): string {
  const fixed = repairMalformedHtml(stripMarkdownCodeFence(raw));
  const diagnostic = diagnoseHtmlCompleteness(fixed);
  const structurallyFixed = diagnostic.isTruncated ? patchTruncatedHtml(fixed) : fixed;
  return ensureRagWidgetContractHtml(structurallyFixed);
}

async function runActiveInteractionDiagnostic(
  html: string,
  options: RagVisualizationAuditPipelineOptions,
): Promise<ActiveInteractionDiagnostics> {
  return (options.activeInteractionEvaluator ?? diagnoseActiveRagWidgetInteraction)(html);
}

function collectFinalGateIssues(input: {
  safetyEval: AgentEvaluation;
  runtimeEval: AgentEvaluation;
  contractDiagnostic: RagWidgetContractDiagnostic;
  activeInteractionEval: AgentEvaluation;
}): AgentIssue[] {
  return uniqueIssues([
    ...input.safetyEval.issues,
    ...input.runtimeEval.issues,
    ...contractIssues(input.contractDiagnostic),
    ...input.activeInteractionEval.issues,
  ]);
}

function uniqueIssues(issues: AgentIssue[]): AgentIssue[] {
  const seen = new Set<string>();
  const result: AgentIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.category}:${issue.severity}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
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

function contractDiagnosticToEvaluation(diagnostic: RagWidgetContractDiagnostic): AgentEvaluation | null {
  if (diagnostic.passed) return null;
  const issues = contractIssues(diagnostic);
  return {
    agentName: 'Widget Contract Evaluator',
    score: Math.max(30, 100 - issues.length * 12),
    passed: false,
    summary: `RAG widget contract 缺少 ${diagnostic.missing.length} 项运行时协议或结构。`,
    issues,
  };
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

function updateArtifactQuality(
  artifact: InteractionArtifact,
  feedbackResult: FeedbackLoopResult,
  qualityReport: QualityReport,
  changeLog: string[],
  now: string,
): InteractionArtifact {
  const schema: InteractionSchema = artifact.schema.type === 'rag_visualization'
    ? {
        ...artifact.schema,
        auditTrail: feedbackResult.iterations,
        repairTrace: changeLog,
      }
    : artifact.schema;

  return {
    ...artifact,
    updatedAt: now,
    feedbackLoop: feedbackResult,
    qualityReport,
    finalScore: qualityReport.finalScore,
    generationIterations: feedbackResult.iterations.length,
    changeLog,
    schema,
  };
}

function createFeedbackResult(
  iterations: FeedbackIteration[],
  bestScore: number,
  finalGateIssues: AgentIssue[] = [],
): FeedbackLoopResult {
  const lastDecision = iterations.at(-1)?.judgeDecision;
  const finalIssues = uniqueIssues([
    ...iterations.flatMap((iteration) => iteration.evaluations.flatMap((evaluation) => evaluation.issues)),
    ...finalGateIssues,
  ]);
  return {
    passed: lastDecision?.type === 'accept' && bestScore >= 85 && finalGateIssues.length === 0,
    finalScore: bestScore,
    iterations,
    finalIssues,
    bestVersionReason: iterations.length > 1
      ? `经过 ${iterations.length} 轮质量检查，最终评分 ${bestScore}/100。`
      : '发布优先质量检查完成。',
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
    const weakness = `${issue.category}: ${issue.message}`;
    if (!weaknesses.includes(weakness)) weaknesses.push(weakness);
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
      ? `${plan.knowledgePoint}互动可视化已通过质量检查（${score}/100）。`
      : `${plan.knowledgePoint}互动可视化完成审计，但仍建议人工复核（${score}/100）。`,
    strengths: strengths.length
      ? strengths
      : result.passed ? ['安全和运行时门禁已通过。'] : ['HTML 已生成并保留完整审计轨迹。'],
    weaknesses,
    suggestions: Array.from(new Set(suggestions)),
    evaluatorScores,
    passed: result.passed,
    repairTrace: buildRepairTrace(result.iterations),
  };
}

function withQualityReportStatus(
  report: QualityReport,
  status: NonNullable<QualityReport['status']>,
): QualityReport {
  return {
    ...report,
    status,
  };
}

function markQualityReviewFailed(report: QualityReport | undefined, message: string): QualityReport {
  return {
    finalScore: report?.finalScore ?? 0,
    level: report?.level ?? 'needs_improvement',
    summary: message,
    strengths: report?.strengths ?? [],
    weaknesses: Array.from(new Set([...(report?.weaknesses ?? []), message])),
    suggestions: Array.from(new Set([...(report?.suggestions ?? []), '请重新生成可视化或检查 artifact 的 visualizationPlan 元数据。'])),
    evaluatorScores: report?.evaluatorScores ?? {},
    passed: false,
    repairTrace: report?.repairTrace ?? [],
    status: 'review_failed',
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
