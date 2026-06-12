import { generateWithConfiguredModel, LlmTruncationError } from '@/lib/generation/llmClient';
import { artifactDesignContractPrompt } from '@/lib/generation/artifactDesignContract';
import { buildInternalMultiAgentPlanningPrompt } from '@/lib/generation/multiAgentGenerationPrompt';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import {
  assertSafeInteractiveHtml,
  diagnoseHtmlCompleteness,
  extractWidgetConfig,
  patchTruncatedHtml,
  repairMalformedHtml,
  stripMarkdownCodeFence,
} from '@/lib/generation/htmlSafety';
import type { HtmlDiagnostic } from '@/lib/generation/htmlSafety';
import { createLogger } from '@/lib/logger';
import { withAbortableTimeout } from '@/lib/utils/withTimeout';
import { makeId } from '@/lib/utils/makeId';
import type { DeepInteractionStreamEvent, InteractionOutline } from './events';
import { loadWidgetSystemPrompt, loadWidgetUserPrompt } from './prompts/loader';

const log = createLogger('pipeline');
import {
  createGameSchema,
  createInclinedPlaneSchema,
  createMindMapSchema,
  createThreeDVisualizationSchema,
} from './schemas';
import type {
  DeepInteractionType,
  FeedbackIteration,
  FeedbackLoopResult,
  GuidedGenerationPlan,
  HtmlInteractionWidget,
  InteractionArtifact,
  InteractionGradeLevel,
  InteractionSchema,
  InteractionSession,
  InteractionSubject,
  LearningBlueprint,
  QualityReport,
  SchemaValidationSummary,
  TemplateMetadata,
} from './types';
import { validateInteractionArtifact, validateInteractionSession } from './validators';
import type { WidgetPlan, WidgetVariable } from './htmlWidgetFallbacks';
import type { InteractionAction } from './actions/actionTypes';
import { evaluatePedagogy } from './agents/pedagogyEvaluatorAgent';
import { evaluateUX } from './agents/uxEvaluatorAgent';
import { evaluateSafety } from './agents/safetyEvaluatorAgent';
import { evaluateRuntime } from './agents/runtimeEvaluator';
import type { AgentEvaluation } from './types';
import { formatBlueprintForPrompt, generateLearningBlueprint } from './agents/learningDesignAgent';
import { validateBlueprintAgainstSchema, type BlueprintValidationResult } from './agents/subjectSchemaValidator';
import { runTemplateCustomizationAgent } from './agents/templateCustomizationAgent';
import {
  findMatchingVerifiedTemplate,
  isMediumConfidenceTemplateMatch,
  shouldAutoUseTemplate,
} from './verified-experiments';

const ALLOWED_MESSAGES = [
  'SET_WIDGET_STATE',
  'HIGHLIGHT_ELEMENT',
  'ANNOTATE_ELEMENT',
  'REVEAL_ELEMENT',
] as const;

export interface DeepInteractionGenerateInput {
  prompt: string;
  gradeLevel?: InteractionGradeLevel;
  preferredType?: DeepInteractionType;
  existingSessionId?: string;
  currentArtifactId?: string;
  guidedPlan?: GuidedGenerationPlan;
}

export type EmitDeepInteractionEvent = (event: DeepInteractionStreamEvent) => void;

interface WidgetOutline {
  widgetType: DeepInteractionType;
  concept: string;
  visualObjects: string[];
  keyVariables: WidgetVariable[];
  interactionMechanics: string[];
  animationRequirements: string[];
  teacherTargets: Array<{ id: string; purpose: string }>;
  presets: Array<{ name: string; state: Record<string, number | string | boolean> }>;
  successCriteria: string[];
}

interface InteractionPlan extends WidgetPlan {
  id: string;
  subject: InteractionSubject;
  gradeLevel: InteractionGradeLevel;
  outline: InteractionOutline;
  widgetOutline: WidgetOutline;
  quiz: {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  };
}

export async function runAgentWidgetPipeline(
  input: DeepInteractionGenerateInput,
  emit: EmitDeepInteractionEvent,
  options?: { isAborted?: () => boolean; signal?: AbortSignal },
): Promise<void> {
  const checkAborted = () => {
    if (options?.isAborted?.()) throw new Error('已取消');
  };
  const pipelineStart = Date.now();
  log.info('Pipeline started', { prompt: input.prompt?.slice(0, 60), type: input.preferredType });

  const now = new Date().toISOString();
  const sessionId = input.existingSessionId ?? makeId('session');
  const preferredType = input.preferredType ?? 'simulation';

  emit({ type: 'progress', stage: 'planning', message: '正在理解学习主题与交互目标...', progress: 8 });

  let stepStart = Date.now();
  log.info('Step planInteraction started', { prompt: input.prompt?.slice(0, 40), type: preferredType });
  const plan = await planInteraction(input.prompt, preferredType, input.gradeLevel, options?.signal);
  log.info('Step planInteraction done', { elapsed: `${((Date.now() - stepStart) / 1000).toFixed(1)}s` });
  checkAborted();
  const session: InteractionSession = {
    id: sessionId,
    title: plan.title,
    topic: plan.concept,
    subject: plan.subject,
    gradeLevel: plan.gradeLevel,
    mode: 'deep_interaction',
    interactionType: plan.interactionType,
    status: 'planning',
    progress: 10,
    messages: [
      {
        id: makeId('message'),
        role: 'user',
        content: input.prompt,
        createdAt: now,
      },
    ],
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };

  log.debug('Validating session', { sessionId: session.id, title: session.title });
  validateInteractionSession(session);
  emit({ type: 'session_created', session, progress: 10 });
  emit({
    type: 'type_selected',
    interactionType: plan.interactionType,
    message: `已锁定交互方式：${typeLabel(plan.interactionType)}。`,
    progress: 24,
  });

  stepStart = Date.now();
  log.info('Step generateLearningBlueprint started');
  const generatedBlueprint = await generateLearningBlueprint({
    prompt: input.prompt,
    interactionType: plan.interactionType,
    title: plan.title,
    concept: plan.concept,
    subject: plan.subject,
    gradeLevel: plan.gradeLevel,
    learningGoals: plan.learningGoals,
    variables: plan.variables,
    guidedPlan: input.guidedPlan,
    signal: options?.signal,
  });
  log.info('Step generateLearningBlueprint done', {
    elapsed: `${((Date.now() - stepStart) / 1000).toFixed(1)}s`,
    topic: generatedBlueprint.topic,
    subjectDomain: generatedBlueprint.subjectDomain,
  });
  checkAborted();
  emit({ type: 'blueprint_generated', blueprint: generatedBlueprint, progress: 32 });

  const validationResult = validateBlueprintAgainstSchema(generatedBlueprint);
  const blueprint: LearningBlueprint = {
    ...generatedBlueprint,
    knowledgeConstraints: validationResult.mergedConstraints,
  };
  emit({
    type: 'subject_validated',
    blueprintId: blueprint.id,
    ...toSchemaValidationSummary(validationResult),
    progress: 36,
  });

  const schemaValidationSummary = toSchemaValidationSummary(validationResult);
  const templateMatch = findMatchingVerifiedTemplate(input.prompt, blueprint);
  let templateMetadata: TemplateMetadata = { generationMode: 'free_generation' };
  let templateHtml: string | null = null;

  if (templateMatch && shouldAutoUseTemplate(templateMatch)) {
    emit({
      type: 'template_matched',
      templateId: templateMatch.template.id,
      title: templateMatch.template.title,
      score: templateMatch.score,
      reason: templateMatch.reason,
      progress: 38,
    });

    const customized = await runTemplateCustomizationAgent({
      userPrompt: input.prompt,
      blueprint,
      template: templateMatch.template,
      schemaValidation: schemaValidationSummary,
    });

    emit({
      type: 'template_customized',
      templateId: templateMatch.template.id,
      appliedSlotCount: customized.appliedSlots.length,
      warnings: customized.warnings,
      progress: 39,
    });

    templateHtml = customized.html;
    templateMetadata = {
      templateId: templateMatch.template.id,
      templateTitle: templateMatch.template.title,
      matchScore: templateMatch.score,
      reason: templateMatch.reason,
      generationMode: customized.usedFallback ? 'template_fallback_original' : 'template_customized',
      appliedSlots: customized.appliedSlots,
      warnings: customized.warnings,
    };
  } else if (isMediumConfidenceTemplateMatch(templateMatch)) {
    log.info('Medium confidence template match recorded without auto-use', {
      templateId: templateMatch?.template.id,
      score: templateMatch?.score,
      reason: templateMatch?.reason,
    });
  }

  emit({ type: 'outline_generated', outline: plan.outline, progress: 40 });
  emit({
    type: 'progress',
    stage: 'building_interaction',
    message: '正在生成自包含 HTML/SVG/Canvas 交互页...',
    progress: 55,
  });

  stepStart = Date.now();
  log.info(templateHtml ? 'Step verifiedTemplateHtmlSafety started' : 'Step buildWidgetHtml started');
  const html = templateHtml
    ? await ensureWidgetHtmlSafety(plan, templateHtml, blueprint, options?.signal)
    : await buildWidgetHtml(plan, blueprint, options?.signal);
  log.info(templateHtml ? 'Step verifiedTemplateHtmlSafety done' : 'Step buildWidgetHtml done', { elapsed: `${((Date.now() - stepStart) / 1000).toFixed(1)}s`, output: `${html.length} chars` });
  checkAborted();
  const widgetConfig = withWidgetConfig(extractWidgetConfig(html), plan);

  emit({
    type: 'schema_generated',
    schemaPreview: {
      type: plan.interactionType,
      title: plan.title,
      widgetType: plan.interactionType,
      targets: widgetConfig.messageTargets,
      learningGoals: plan.learningGoals,
      blueprint: {
        topic: blueprint.topic,
        subjectDomain: blueprint.subjectDomain,
        expectedInsight: blueprint.expectedInsight,
      },
      contract: ['完整 HTML', '内联 CSS/JS', 'requestAnimationFrame', 'postMessage 教师动作', '移动端布局'],
    },
    progress: 72,
  });

  emit({
    type: 'progress',
    stage: 'generating_schema',
    message: '正在生成教师讲解动作...',
    progress: 78,
  });

  stepStart = Date.now();
  log.info('Step buildTeacherActions started');
  const teacher = await buildTeacherActions(plan, widgetConfig.messageTargets, blueprint, options?.signal);
  log.info('Step buildTeacherActions done', { elapsed: `${((Date.now() - stepStart) / 1000).toFixed(1)}s`, actions: teacher.actions.length });
  checkAborted();

  emit({ type: 'validation_started', message: '正在校验 HTML 安全边界、动画能力和教师动作目标...', progress: 88 });

  const schema = createSchemaWithWidget(plan, html, widgetConfig, teacher.actions);
  const currentSchema = schema;
  const currentHtml = html;
  const currentActions = teacher.actions;
  const currentPlan = plan;

  const baseArtifact: InteractionArtifact = {
    id: makeId('artifact'),
    sessionId,
    type: plan.interactionType,
    title: plan.title,
    description: plan.description,
    schema: currentSchema,
    status: 'ready',
    version: 1,
    blueprint,
    templateMetadata,
    planningMetadata: input.guidedPlan
      ? {
          planningSessionId: input.guidedPlan.planningSessionId,
          approvedAt: input.guidedPlan.approvedAt,
          summary: `${input.guidedPlan.subjectDomain} / ${input.guidedPlan.topic}`,
          clarificationCount: 0,
        }
      : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  log.debug('Validating artifact', { artifactId: baseArtifact.id, type: baseArtifact.type, title: baseArtifact.title });
  validateInteractionArtifact(baseArtifact);

  emit({ type: 'validation_started', message: '正在运行安全、运行时和结构诊断...', progress: 88 });
  const deterministicEvaluations = [
    evaluateSafety(currentHtml),
    evaluateRuntime(currentHtml),
    schemaValidationEvaluation(schemaValidationSummary),
  ];
  const deterministicFeedback = buildPublishFirstFeedback({
    evaluations: deterministicEvaluations,
    scoreBefore: 0,
    reasonWhenPassed: '确定性安全、运行时和结构诊断通过。',
    reasonWhenFailed: '确定性诊断发现问题；artifact 已发布并在质量报告中标记。',
  });
  const deterministicQualityReport = buildQualityReport(
    deterministicFeedback,
    deterministicFeedback.iterations,
    blueprint,
    schemaValidationSummary,
    templateMetadata,
    currentHtml,
  );
  const initialChangeLog = ['确定性安全、运行时和结构诊断完成；artifact 已先发布，深度质量报告稍后更新。'];
  let finalArtifact: InteractionArtifact = {
    ...baseArtifact,
    feedbackLoop: deterministicFeedback,
    qualityReport: deterministicQualityReport,
    finalScore: deterministicFeedback.finalScore,
    generationIterations: 1,
    changeLog: initialChangeLog,
  };

  emit({ type: 'artifact_ready', artifact: finalArtifact, progress: 100 });

  checkAborted();
  emit({ type: 'feedback_started', message: 'artifact 已发布，正在更新 Pedagogy + UX 质量报告...', progress: 92 });
  emit({ type: 'evaluator_started', iteration: 1, agentName: 'Pedagogy Evaluator', message: '发布后教学一致性评估中...', progress: 93 });
  emit({ type: 'evaluator_started', iteration: 1, agentName: 'UX Evaluator', message: '发布后交互体验评估中...', progress: 93 });

  const [pedEval, uxEval] = await Promise.all([
    evaluatePedagogy({
      prompt: input.prompt,
      title: currentPlan.title,
      concept: currentPlan.concept,
      description: currentPlan.description,
      subject: currentPlan.subject,
      gradeLevel: currentPlan.gradeLevel,
      interactionType: currentPlan.interactionType,
      learningGoals: currentPlan.learningGoals,
      htmlPreview: currentHtml.slice(0, 1200),
      actionsSummary: currentActions.map((a) => a.type).join(', '),
      blueprint,
      signal: options?.signal,
    }),
    evaluateUX({
      html: currentHtml,
      title: currentPlan.title,
      concept: currentPlan.concept,
      interactionType: currentPlan.interactionType,
      variables: currentPlan.variables.map((v) => ({ name: v.name, label: v.label })),
      signal: options?.signal,
    }),
  ]);

  emit({ type: 'evaluator_completed', iteration: 1, evaluation: pedEval, progress: 95 });
  emit({ type: 'evaluator_completed', iteration: 1, evaluation: uxEval, progress: 95 });

  const deepEvaluations = [...deterministicEvaluations, pedEval, uxEval];
  const deepFeedback = buildPublishFirstFeedback({
    evaluations: deepEvaluations,
    scoreBefore: deterministicFeedback.finalScore,
    reasonWhenPassed: '发布后质量报告通过；HTML 未自动修改。',
    reasonWhenFailed: '发布后质量报告发现问题；HTML 未自动修改。',
    changeLog: ['发布后 Pedagogy/UX/Reviewer-Critic 质量报告完成；HTML 未自动修改。'],
  });
  const deepQualityReport = buildQualityReport(
    deepFeedback,
    deepFeedback.iterations,
    blueprint,
    schemaValidationSummary,
    templateMetadata,
    currentHtml,
  );
  const deepChangeLog = [...initialChangeLog, '发布后 Pedagogy/UX/Reviewer-Critic 质量报告完成；HTML 未自动修改。'];
  finalArtifact = {
    ...finalArtifact,
    feedbackLoop: deepFeedback,
    qualityReport: deepQualityReport,
    finalScore: deepFeedback.finalScore,
    generationIterations: 1,
    changeLog: deepChangeLog,
    updatedAt: new Date().toISOString(),
  };

  emit({
    type: 'artifact_quality_updated',
    artifactId: finalArtifact.id,
    qualityReport: deepQualityReport,
    feedbackLoop: deepFeedback,
    finalScore: deepFeedback.finalScore,
    changeLog: deepChangeLog,
    progress: 98,
  });
  emit({ type: 'feedback_completed', result: deepFeedback, qualityReport: deepQualityReport, progress: 99 });

  const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  const artifactSize = JSON.stringify(finalArtifact).length;
  log.info('Pipeline completed', { elapsed: `${totalElapsed}s`, artifactId: finalArtifact.id, artifactSize: `${(artifactSize / 1024).toFixed(1)}KB`, finalScore: deepFeedback.finalScore, iterations: 1 });
}

function buildPublishFirstFeedback(input: {
  evaluations: AgentEvaluation[];
  scoreBefore: number;
  reasonWhenPassed: string;
  reasonWhenFailed: string;
  changeLog?: string[];
}): FeedbackLoopResult {
  const finalScore = averageEvaluationScore(input.evaluations);
  const finalIssues = input.evaluations.flatMap((evaluation) => evaluation.issues);
  const passed = input.evaluations.every((evaluation) => evaluation.passed) && finalScore >= 75;
  const blockingIssues = finalIssues.filter((issue) => issue.severity === 'high' || issue.severity === 'critical');
  const iteration: FeedbackIteration = {
    iteration: 1,
    evaluations: input.evaluations,
    judgeDecision: {
      type: passed ? 'accept' : 'reject',
      finalScore,
      blockingIssues,
      reason: passed ? input.reasonWhenPassed : input.reasonWhenFailed,
    },
    scoreBefore: input.scoreBefore,
    scoreAfter: finalScore,
    changeLog: input.changeLog,
    createdAt: new Date().toISOString(),
  };

  return {
    passed,
    finalScore,
    iterations: [iteration],
    finalIssues,
    bestVersionReason: passed
      ? 'artifact 已先发布，质量报告已更新；HTML 未自动修改。'
      : 'artifact 已先发布，质量问题已记录；HTML 未自动修改。',
  };
}

function averageEvaluationScore(evaluations: AgentEvaluation[]): number {
  if (evaluations.length === 0) return 0;
  return Math.round(evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) / evaluations.length);
}

function schemaValidationEvaluation(schemaValidation: SchemaValidationSummary): AgentEvaluation {
  const violationIssues = schemaValidation.violations.map((violation, index) => ({
    id: `schema_violation_${index + 1}`,
    severity: 'high' as const,
    category: 'schema' as const,
    message: violation,
    suggestion: '请在质量报告中人工核对该学科约束；默认生成流程不会自动改写已发布 HTML。',
    target: 'schema' as const,
  }));
  const warningIssues = schemaValidation.warnings.map((warning, index) => ({
    id: `schema_warning_${index + 1}`,
    severity: 'warning' as const,
    category: 'schema' as const,
    message: warning,
    suggestion: '请在后续 refine 中按该 warning 微调内容。',
    target: 'schema' as const,
  }));
  const issues = [...violationIssues, ...warningIssues];

  return {
    agentName: 'Subject Schema Validator',
    score: schemaValidation.passed && schemaValidation.violations.length === 0
      ? (schemaValidation.warnings.length ? 86 : 94)
      : 72,
    passed: schemaValidation.passed && schemaValidation.violations.length === 0,
    summary: schemaValidation.passed
      ? 'Subject schema deterministic check passed.'
      : 'Subject schema deterministic check reported issues.',
    issues,
  };
}

async function planInteraction(
  prompt: string,
  preferredType: DeepInteractionType,
  gradeLevel?: InteractionGradeLevel,
  parentSignal?: AbortSignal,
): Promise<InteractionPlan> {
  const fallback = createFallbackPlan(prompt, preferredType, gradeLevel);
  const system = `You are STEMotion InteractionPlannerAgent.

${buildInternalMultiAgentPlanningPrompt({
  mode: 'planning',
  artifactKind: 'Deep Interaction generation plan JSON',
  outputInstruction: 'Return ONLY valid JSON using the InteractionPlan shape below.',
})}

Task: create one concise generation plan for a deep interaction widget.

Return ONLY valid JSON. Do not write markdown or prose.

Rules:
- The user-selected interaction type is fixed: ${preferredType}. Never change it.
- Online coding, programming, Python, JavaScript editor, and code runner modes are not supported.
- Use an original STEMotion plan. Do not copy OpenMAIC code, UI, prompts, assets, branding, or names.
- Use the same language as the user.
- If details are missing, make conservative classroom assumptions inside the JSON.

JSON shape:
{
  "id": "string",
  "title": "string",
  "concept": "string",
  "description": "string",
  "subject": "math|physics|chemistry|biology|general",
  "gradeLevel": "primary|middle_school|high_school",
  "learningGoals": ["string"],
  "variables": [{"name":"camelCase","label":"string","min":0,"max":10,"default":5,"step":1,"unit":"optional"}],
  "outline": {"title":"string","steps":["string"]},
  "widgetOutline": {
    "widgetType": "${preferredType}",
    "concept": "string",
    "visualObjects": ["string"],
    "keyVariables": [{"name":"camelCase","label":"string","min":0,"max":10,"default":5,"step":1,"unit":"optional"}],
    "interactionMechanics": ["string"],
    "animationRequirements": ["string"],
    "teacherTargets": [{"id":"#controls","purpose":"string"}],
    "presets": [{"name":"string","state":{"running":true}}],
    "successCriteria": ["string"]
  },
  "quiz": {"question":"string","options":["string"],"correctAnswer":"string","explanation":"string"}
}`;

  const raw = await withAbortableTimeout(
    (signal) => generateWithConfiguredModel({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.12,
      requestPreset: 'planning',
      signal,
    }),
    300000,
    'Interaction planner timed out.',
    parentSignal,
  );
  log.debug('Planner raw response', { chars: raw.length, preview: raw.slice(0, 500) });
  const parsed = parseJsonResponse(raw) as Partial<InteractionPlan>;
  log.debug('Planner parsed', { title: parsed.title, concept: parsed.concept, subject: parsed.subject });
  return normalizePlan(parsed, fallback, preferredType);
}

async function buildWidgetHtml(plan: InteractionPlan, blueprint: LearningBlueprint, parentSignal?: AbortSignal): Promise<string> {
  const system = widgetPromptForType(plan);
  const userTemplate = loadWidgetUserPrompt(plan.interactionType);
  const user = `${fillTemplate(userTemplate, {
    title: plan.title,
    concept: plan.concept,
    description: plan.description,
    subject: plan.subject,
    gradeLevel: plan.gradeLevel,
    learningGoals: plan.learningGoals.map((g) => `- ${g}`).join('\n'),
    variables: JSON.stringify(plan.variables, null, 2),
    outline: JSON.stringify(plan.outline, null, 2),
    widgetOutline: JSON.stringify(plan.widgetOutline, null, 2),
    gameType: plan.widgetOutline.widgetType === 'game' ? 'action' : '',
    diagramType: plan.widgetOutline.widgetType === 'mind_map' ? 'mindmap' : 'hierarchy',
    visualizationType: 'custom',
    objects: JSON.stringify(plan.widgetOutline.visualObjects, null, 2),
    interactions: JSON.stringify(plan.widgetOutline.interactionMechanics, null, 2),
  })}

${formatBlueprintForPrompt(blueprint)}

额外约束：
1. 所有 must 级知识约束必须正确体现在公式、变量、可视化和文字说明中。
2. 不要生成与 LearningBlueprint 或 Subject Schema 冲突的描述。
3. 控制区、主舞台、观察数据区、公式区和问题区必须有稳定 id 或 data-role，便于教师动作定位。`;

  let raw: string;
  try {
    raw = await withAbortableTimeout(
      (signal) => generateWithConfiguredModel({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.24,
        requestPreset: 'artifact',
        profileRole: 'artifact',
        signal,
        metadata: {
          stage: 'deep_interaction_widget_html',
          promptVersion: 'deep-widget-html-v1',
        },
      }),
      900000,
      'Widget HTML generation timed out.',
      parentSignal,
    );
  } catch (error) {
    if (error instanceof LlmTruncationError) {
      log.warn('Widget HTML generation was truncated, attempting recovery', {
        outputTokens: error.outputTokens,
        contentChars: error.partialContent.length,
      });
      raw = error.partialContent;
    } else {
      throw error;
    }
  }

  const rawHtml = stripMarkdownCodeFence(raw);
  log.debug('Widget HTML raw output', { chars: rawHtml.length, preview: rawHtml.slice(0, 300) });
  const html = repairMalformedHtml(rawHtml);
  try {
    assertSafeInteractiveHtml(html);
    return html;
  } catch (error) {
    const validationError = error instanceof Error ? error.message : String(error);
    const diagnostic = diagnoseHtmlCompleteness(html);
    log.warn('First HTML validation failed, attempting programmatic patch', { validationError, diagnostic });

    // Try programmatic patching first (handles truncation without another LLM call)
    const patched = patchTruncatedHtml(html);
    try {
      assertSafeInteractiveHtml(patched);
      log.info('Programmatic patch succeeded');
      return patched;
    } catch (patchError) {
      const patchValidationError = patchError instanceof Error ? patchError.message : String(patchError);
      log.warn('Programmatic patch insufficient, calling repair agent', patchValidationError);
    }

    // Fall back to LLM repair agent with diagnostic info
    const repaired = await repairWidgetHtml(plan, html, validationError, diagnostic, blueprint, parentSignal);
    const repairedFixed = repairMalformedHtml(repaired);
    try {
      assertSafeInteractiveHtml(repairedFixed);
      return repairedFixed;
    } catch {
      // Last resort: patch the repair agent's output too
      const repairedPatched = patchTruncatedHtml(repairedFixed);
      assertSafeInteractiveHtml(repairedPatched);
      log.info('Repair agent output also needed programmatic patch');
      return repairedPatched;
    }
  }
}

async function ensureWidgetHtmlSafety(
  plan: InteractionPlan,
  html: string,
  blueprint: LearningBlueprint,
  parentSignal?: AbortSignal,
): Promise<string> {
  const fixed = repairMalformedHtml(stripMarkdownCodeFence(html));
  try {
    assertSafeInteractiveHtml(fixed);
    return fixed;
  } catch (error) {
    const validationError = error instanceof Error ? error.message : String(error);
    const diagnostic = diagnoseHtmlCompleteness(fixed);
    const patched = patchTruncatedHtml(fixed);
    try {
      assertSafeInteractiveHtml(patched);
      return patched;
    } catch {
      const repaired = await repairWidgetHtml(plan, fixed, validationError, diagnostic, blueprint, parentSignal);
      const repairedFixed = repairMalformedHtml(repaired);
      assertSafeInteractiveHtml(repairedFixed);
      return repairedFixed;
    }
  }
}

async function repairWidgetHtml(
  plan: InteractionPlan,
  html: string,
  validationError: string,
  diagnostic?: HtmlDiagnostic,
  blueprint?: LearningBlueprint,
  parentSignal?: AbortSignal,
): Promise<string> {
  const diagnosticSection = diagnostic?.missingInteractivity
    ? `\nDiagnostic: interactive code is incomplete.\n${diagnostic.details.map(d => `- ${d}`).join('\n')}\nYou MUST regenerate the complete interactive JavaScript. Sliders must update the visualization, start/reset buttons must control the simulation, canvas must render content, and WIDGET_READY must be posted.`
    : '';

  const raw = await withAbortableTimeout(
    (signal) => generateWithConfiguredModel({
      messages: [
        {
          role: 'system',
          content: `You are STEMotion ValidationRepairAgent.

Task: repair a failed widget HTML candidate.

Return ONLY a complete HTML document. Do not write markdown or a partial patch.

Rules:
- Preserve the educational idea and fix every validation error.
- Keep inline CSS/JS only.
- No remote resources, fetch, XMLHttpRequest, WebSocket, EventSource, import(), storage APIs, cookies, eval, or nested iframes.
- Include widget-config, requestAnimationFrame, start/reset controls, and message handlers for SET_WIDGET_STATE, HIGHLIGHT_ELEMENT, ANNOTATE_ELEMENT, REVEAL_ELEMENT.
- The widget must be fully functional with complete interactive JavaScript.
${buildInternalMultiAgentPlanningPrompt({
  mode: 'repair',
  artifactKind: 'Deep Interaction widget validation repair',
  outputInstruction: 'Return ONLY a complete HTML document.',
  compact: true,
})}
${artifactDesignContractPrompt({
  medium: 'repaired self-contained Deep Interaction widget',
  mainStage: 'main simulation/game/diagram/visualization stage',
  supportPanel: 'explanation/sidebar/control support areas',
  supportingContent: 'variables, learning goals, plans, formulas, quiz, and long explanations',
})}
${blueprint ? formatBlueprintForPrompt(blueprint) : ''}
${diagnosticSection}`,
        },
        {
          role: 'user',
          content: JSON.stringify({ type: plan.interactionType, validationError, html }),
        },
      ],
      temperature: 0.1,
      requestPreset: 'repair',
      profileRole: 'artifact',
      signal,
      metadata: {
        stage: 'deep_interaction_widget_repair',
        promptVersion: 'deep-widget-repair-v1',
      },
    }),
    900000,
    'Widget repair timed out.',
    parentSignal,
  );

  return stripMarkdownCodeFence(raw);
}

async function buildTeacherActions(
  plan: InteractionPlan,
  targets: Array<{ id: string; purpose: string }>,
  blueprint: LearningBlueprint,
  parentSignal?: AbortSignal,
): Promise<{ actions: InteractionAction[] }> {
  throwIfSignalAborted(parentSignal);
  const fallback = createFallbackActions(plan);
  const system = `You are STEMotion TeacherActionAgent.

Task: create classroom actions that drive the widget.

Return ONLY JSON: {"actions":[...]}.

Rules:
- Allowed action types: speech,set_widget_state,highlight_widget_element,annotate_widget_element,reveal_widget_element,show_quiz.
- Use durationMs, not duration.
- Targets must come from the provided target list.
- Prefer stable data-role selectors or stable ids over random class names or deep DOM paths.
- Create 5 to 8 actions.
- Guide observation, variable manipulation, formula/unit attention, and final reflection; do not merely describe the page.
- Actions must support expectedInsight and must-level LearningBlueprint constraints.
- Use the user's language.`;

  try {
    const raw = await withAbortableTimeout(
      (signal) => generateWithConfiguredModel({
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: JSON.stringify({
              title: plan.title,
              concept: plan.concept,
              interactionType: plan.interactionType,
              variables: plan.variables,
              targets,
              blueprint,
              quizId: 'main_quiz',
            }),
          },
        ],
        temperature: 0.16,
        requestPreset: 'teacherActions',
        signal,
        metadata: {
          stage: 'deep_interaction_teacher_actions',
          promptVersion: 'deep-teacher-actions-v1',
        },
      }),
      300000,
      'TeacherActionAgent timed out.',
      parentSignal,
    );
    const parsed = parseJsonResponse(raw) as { actions?: unknown[] };
    log.debug('Teacher actions raw response', { chars: raw.length, preview: raw.slice(0, 300) });
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.map((action, index) => normalizeAction(action, index, targets)).filter(Boolean)
      : [];
    throwIfSignalAborted(parentSignal);
    return { actions: actions.length ? actions : fallback };
  } catch (e) {
    throwIfSignalAborted(parentSignal);
    log.warn('TeacherActionAgent failed, using fallback', { error: e instanceof Error ? e.message : String(e) });
    return { actions: fallback };
  }
}

function throwIfSignalAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('已取消');
}

function createSchemaWithWidget(
  plan: InteractionPlan,
  html: string,
  widgetConfig: HtmlInteractionWidget['widgetConfig'],
  actions: InteractionAction[],
): InteractionSchema {
  log.debug('Creating schema', { type: plan.interactionType, htmlChars: html.length, actions: actions.length, quiz: 1 });
  const base =
    plan.interactionType === 'mind_map'
      ? createMindMapSchema(plan.concept, plan.subject)
      : plan.interactionType === '3d_visualization'
        ? createThreeDVisualizationSchema(plan.concept, plan.subject)
        : plan.interactionType === 'game'
          ? createGameSchema(plan.concept)
          : createInclinedPlaneSchema(plan.title);

  return {
    ...base,
    title: plan.title,
    description: plan.description,
    learningGoals: plan.learningGoals,
    explanationSteps: [
      {
        id: 'step_intro',
        title: '进入交互',
        narration: `先观察 ${plan.concept} 的核心对象和可调变量。`,
        actions: actions.slice(0, 2),
      },
      {
        id: 'step_explore',
        title: '动手探索',
        narration: '运行互动页，调节变量，观察动画和指标如何同步变化。',
        actions: actions.slice(2, 5),
      },
      {
        id: 'step_reflect',
        title: '总结规律',
        narration: '把观察结果和公式、概念或知识结构连接起来，再完成一个检查问题。',
        actions: actions.slice(5),
      },
    ],
    quiz: [
      {
        id: 'main_quiz',
        question: plan.quiz.question,
        options: plan.quiz.options,
        correctAnswer: plan.quiz.correctAnswer,
        explanation: plan.quiz.explanation,
      },
    ],
    htmlWidget: {
      html,
      widgetType: plan.interactionType,
      widgetConfig,
      allowedMessageTypes: [...ALLOWED_MESSAGES],
    },
  } as InteractionSchema;
}

function widgetPromptForType(plan: InteractionPlan): string {
  const preamble = `You are STEMotion WidgetHtmlAgent.

Task: generate one complete self-contained HTML document.

Return HTML only. Do not use markdown.

Global rules:
- Do not copy OpenMAIC code, UI, prompts, assets, branding, or names.
- Text must be Chinese if the user prompt is Chinese.
- Use stable semantic selectors for major areas: data-role="simulation-main", data-role="control-panel", data-role="observation-panel", data-role="formula-panel", data-role="quiz-panel".

${buildInternalMultiAgentPlanningPrompt({
  mode: 'artifact',
  artifactKind: `${plan.interactionType} Deep Interaction widget HTML`,
  outputInstruction: 'Return HTML only. Do not output agent notes, Markdown, or planning JSON.',
})}

`;
  const template = loadWidgetSystemPrompt(plan.interactionType);
  return `${preamble}${template}

${artifactDesignContractPrompt({
  medium: `${plan.interactionType} Deep Interaction widget`,
  mainStage: 'main simulation/game/diagram/visualization stage',
  supportPanel: 'explanation/sidebar/control support areas',
  supportingContent: 'variables, learning goals, formulas, plans, quiz, and long explanations',
})}`;
}

function createFallbackPlan(
  prompt: string,
  preferredType: DeepInteractionType,
  gradeLevel: InteractionGradeLevel = 'middle_school',
): InteractionPlan {
  const concept = inferConcept(prompt);
  const variables = inferVariables(prompt, preferredType);
  return {
    id: makeId('plan'),
    title: `${concept}${typeLabel(preferredType)}`,
    concept,
    description: `围绕 ${concept} 生成一个可运行、可调节、可播放教师动作的 ${typeLabel(preferredType)}。`,
    interactionType: preferredType,
    subject: inferSubject(prompt),
    gradeLevel,
    learningGoals: [`理解 ${concept} 的关键规律`, '通过调节变量观察结果变化', '用互动反馈修正自己的解释'],
    variables,
    outline: {
      title: `${concept}交互大纲`,
      steps: ['认识核心对象', '调节关键变量', '观察动态变化', '总结规律并完成问题'],
    },
    widgetOutline: {
      widgetType: preferredType,
      concept,
      visualObjects: ['主舞台', '变量控件', '实时指标', '教师注释'],
      keyVariables: variables,
      interactionMechanics: ['拖动滑块改变状态', '点击运行观察动画', '点击重置回到初始状态'],
      animationRequirements: ['使用 requestAnimationFrame', '运行后出现连续运动或明显视觉变化'],
      teacherTargets: [
        { id: '#controls', purpose: '变量控制区' },
        { id: '#visualization', purpose: '主动画舞台' },
        { id: '#metrics', purpose: '实时指标区' },
        { id: '#start-btn', purpose: '运行按钮' },
        { id: '#reset-btn', purpose: '重置按钮' },
      ],
      presets: [{ name: '默认探索', state: { running: true } }],
      successCriteria: ['可以运行', '可以重置', '教师动作能高亮或注释目标元素'],
    },
    quiz: {
      question: `探索 ${concept} 时，最重要的学习动作是什么？`,
      options: ['主动调节变量并观察结果', '只看标题', '跳过反馈', '忽略动画'],
      correctAnswer: '主动调节变量并观察结果',
      explanation: '深度交互的价值在于让变量、现象和解释连接起来。',
    },
  };
}

function normalizePlan(
  parsed: Partial<InteractionPlan>,
  fallback: InteractionPlan,
  preferredType: DeepInteractionType,
): InteractionPlan {
  const variables = Array.isArray(parsed.variables) && parsed.variables.length
    ? parsed.variables.map((variable, index) => normalizeVariable(variable, index))
    : (log.warn('Plan normalize: variables fallback used'), fallback.variables);
  const goals = Array.isArray(parsed.learningGoals) && parsed.learningGoals.length
    ? parsed.learningGoals.map(String).slice(0, 5)
    : (log.warn('Plan normalize: learningGoals fallback used'), fallback.learningGoals);
  const options = Array.isArray(parsed.quiz?.options) && parsed.quiz.options.length >= 2
    ? parsed.quiz.options.map(String).slice(0, 5)
    : (log.warn('Plan normalize: quiz.options fallback used'), fallback.quiz.options);
  const outlineSteps = Array.isArray(parsed.outline?.steps) && parsed.outline.steps.length
    ? parsed.outline.steps.map(String).slice(0, 6)
    : (log.warn('Plan normalize: outline.steps fallback used'), fallback.outline.steps);

  const plan: InteractionPlan = {
    ...fallback,
    id: String(parsed.id || fallback.id),
    title: String(parsed.title || fallback.title),
    concept: String(parsed.concept || fallback.concept),
    description: String(parsed.description || fallback.description),
    interactionType: preferredType,
    subject: normalizeSubject(parsed.subject) ?? fallback.subject,
    gradeLevel: normalizeGrade(parsed.gradeLevel) ?? fallback.gradeLevel,
    learningGoals: goals,
    variables,
    outline: {
      title: String(parsed.outline?.title || fallback.outline.title),
      steps: outlineSteps,
    },
    quiz: {
      question: String(parsed.quiz?.question || fallback.quiz.question),
      options,
      correctAnswer: String(parsed.quiz?.correctAnswer || options[0]),
      explanation: String(parsed.quiz?.explanation || fallback.quiz.explanation),
    },
    widgetOutline: normalizeWidgetOutline(parsed.widgetOutline, fallback, preferredType, variables),
  };

  return plan;
}

function normalizeWidgetOutline(
  value: unknown,
  fallback: InteractionPlan,
  preferredType: DeepInteractionType,
  variables: WidgetVariable[],
): WidgetOutline {
  const outline = (value && typeof value === 'object' ? value : {}) as Partial<WidgetOutline>;
  const teacherTargets = Array.isArray(outline.teacherTargets) && outline.teacherTargets.length
    ? outline.teacherTargets.map((target) => ({
        id: String((target as { id?: unknown }).id || '#visualization'),
        purpose: String((target as { purpose?: unknown }).purpose || '教师动作目标'),
      }))
    : fallback.widgetOutline.teacherTargets;

  return {
    widgetType: preferredType,
    concept: String(outline.concept || fallback.concept),
    visualObjects: arrayOfStrings(outline.visualObjects, fallback.widgetOutline.visualObjects),
    keyVariables: Array.isArray(outline.keyVariables) && outline.keyVariables.length
      ? outline.keyVariables.map((variable, index) => normalizeVariable(variable, index))
      : variables,
    interactionMechanics: arrayOfStrings(outline.interactionMechanics, fallback.widgetOutline.interactionMechanics),
    animationRequirements: arrayOfStrings(outline.animationRequirements, fallback.widgetOutline.animationRequirements),
    teacherTargets,
    presets: Array.isArray(outline.presets) ? outline.presets.slice(0, 4) as WidgetOutline['presets'] : fallback.widgetOutline.presets,
    successCriteria: arrayOfStrings(outline.successCriteria, fallback.widgetOutline.successCriteria),
  };
}

function withWidgetConfig(value: Record<string, unknown>, plan: InteractionPlan): HtmlInteractionWidget['widgetConfig'] {
  const defaultState = value.defaultState && typeof value.defaultState === 'object'
    ? (value.defaultState as Record<string, unknown>)
    : Object.fromEntries(plan.variables.map((variable) => [variable.name, variable.default]));
  const messageTargets = Array.isArray(value.messageTargets) && value.messageTargets.length
    ? (value.messageTargets as Array<Record<string, unknown>>).map((target) => ({
        id: String(target.id || '#visualization'),
        purpose: String(target.purpose || '教师动作目标'),
      }))
    : plan.widgetOutline.teacherTargets;

  return {
    concept: String(value.concept || plan.concept),
    variables: Array.isArray(value.variables)
      ? (value.variables as Array<Record<string, unknown>>)
      : plan.variables.map((variable) => ({ ...variable })),
    defaultState,
    messageTargets,
  };
}

function createFallbackActions(plan: InteractionPlan): InteractionAction[] {
  const first = plan.variables[0];
  return [
    { id: 'intro', type: 'speech', text: `先观察 ${plan.concept} 的整体互动界面。`, durationMs: 1100 },
    { id: 'highlight_controls', type: 'highlight_widget_element', target: '#controls', content: '这里可以调节关键变量。', durationMs: 1100 },
    { id: 'start_widget', type: 'set_widget_state', state: { running: true }, durationMs: 1300 },
    {
      id: 'change_variable',
      type: 'set_widget_state',
      state: first ? { [first.name]: first.max, running: true } : { running: true },
      durationMs: 1300,
    },
    { id: 'annotate_metrics', type: 'annotate_widget_element', target: '#metrics', content: '观察指标如何随着变量变化。', durationMs: 1200 },
    { id: 'show_quiz', type: 'show_quiz', quizId: 'main_quiz', durationMs: 900 },
  ];
}

function normalizeAction(
  action: unknown,
  index: number,
  targets: Array<{ id: string; purpose: string }>,
): InteractionAction {
  const candidate = (action && typeof action === 'object' ? action : {}) as Record<string, unknown>;
  const type = String(candidate.type || (index === 0 ? 'speech' : 'highlight_widget_element'));
  const durationMs = Number(candidate.durationMs ?? candidate.duration ?? 1000);
  const fallbackTarget = targets[index % Math.max(1, targets.length)]?.id ?? '#visualization';
  const target = String(candidate.target || fallbackTarget);

  if (type === 'speech') {
    return { id: String(candidate.id || `speech_${index}`), type, text: String(candidate.text || '请观察这个互动页面的变化。'), durationMs };
  }
  if (type === 'set_widget_state') {
    return { id: String(candidate.id || `state_${index}`), type, state: (candidate.state as Record<string, unknown>) || { running: true }, durationMs };
  }
  if (type === 'annotate_widget_element') {
    return { id: String(candidate.id || `annotate_${index}`), type, target, content: String(candidate.content || '这里是关键观察点。'), durationMs };
  }
  if (type === 'reveal_widget_element') {
    return { id: String(candidate.id || `reveal_${index}`), type, target, durationMs };
  }
  if (type === 'show_quiz') {
    return { id: String(candidate.id || `quiz_${index}`), type, quizId: String(candidate.quizId || 'main_quiz'), durationMs };
  }
  return {
    id: String(candidate.id || `highlight_${index}`),
    type: 'highlight_widget_element',
    target,
    content: candidate.content ? String(candidate.content) : undefined,
    durationMs,
  };
}

function normalizeVariable(value: unknown, index: number): WidgetVariable {
  const variable = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    name: toCamel(String(variable.name || `variable${index + 1}`)),
    label: String(variable.label || variable.name || `变量 ${index + 1}`),
    min: Number(variable.min ?? 0),
    max: Number(variable.max ?? 10),
    default: Number(variable.default ?? variable.value ?? 5),
    step: Number(variable.step ?? 1),
    unit: variable.unit ? String(variable.unit) : undefined,
  };
}

function inferConcept(prompt: string): string {
  if (/酸碱|中和|滴定/.test(prompt)) return '酸碱中和滴定';
  if (/欧姆|电压|电阻|电流|电路/.test(prompt)) return '欧姆定律电路';
  if (/二次函数|抛物线|函数图像/.test(prompt)) return '二次函数图像';
  if (/水分子|分子|晶体|空间|结构/.test(prompt)) return '微观空间结构';
  if (/斜面|小车|摩擦|重力|加速度/.test(prompt)) return '斜面小车运动';
  const cleaned = prompt.trim().replace(/^生成一个?/, '').slice(0, 24);
  return cleaned || 'STEM 探究主题';
}

function inferSubject(prompt: string): InteractionSubject {
  if (/酸碱|中和|滴定|分子|晶体|化学|配平/.test(prompt)) return 'chemistry';
  if (/函数|图像|方程|几何|数学/.test(prompt)) return 'math';
  if (/细胞|生态|生物/.test(prompt)) return 'biology';
  if (/斜面|电路|欧姆|力|速度|加速度|重力|物理/.test(prompt)) return 'physics';
  return 'general';
}

function inferVariables(prompt: string, type: DeepInteractionType): WidgetVariable[] {
  if (/酸碱|中和|滴定/.test(prompt)) {
    return [
      { name: 'acidVolume', label: '酸溶液体积', min: 0, max: 50, default: 20, step: 1, unit: 'mL' },
      { name: 'baseVolume', label: '碱溶液体积', min: 0, max: 50, default: 18, step: 1, unit: 'mL' },
      { name: 'concentration', label: '浓度', min: 0.1, max: 2, default: 1, step: 0.1, unit: 'mol/L' },
    ];
  }
  if (/欧姆|电压|电阻|电流|电路/.test(prompt)) {
    return [
      { name: 'voltage', label: '电压', min: 1, max: 24, default: 12, step: 1, unit: 'V' },
      { name: 'resistance', label: '电阻', min: 1, max: 100, default: 20, step: 1, unit: 'Ω' },
    ];
  }
  if (/二次函数|抛物线|函数图像/.test(prompt)) {
    return [
      { name: 'a', label: '开口系数 a', min: -3, max: 3, default: 1, step: 0.1 },
      { name: 'b', label: '平移系数 b', min: -5, max: 5, default: 0, step: 0.5 },
      { name: 'c', label: '截距 c', min: -5, max: 5, default: 0, step: 0.5 },
    ];
  }
  if (type === 'game') {
    return [
      { name: 'difficulty', label: '难度', min: 1, max: 10, default: 4, step: 1 },
      { name: 'speed', label: '挑战速度', min: 1, max: 10, default: 5, step: 1 },
    ];
  }
  return [
    { name: 'inputValue', label: '关键变量', min: 0, max: 10, default: 5, step: 0.5 },
    { name: 'rate', label: '变化速率', min: 1, max: 10, default: 4, step: 1 },
  ];
}

function normalizeSubject(value: unknown): InteractionSubject | null {
  return value === 'math' || value === 'physics' || value === 'chemistry' || value === 'biology' || value === 'general'
    ? value
    : null;
}

function normalizeGrade(value: unknown): InteractionGradeLevel | null {
  return value === 'primary' || value === 'middle_school' || value === 'high_school' ? value : null;
}

function arrayOfStrings(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.length ? value.map(String).slice(0, 8) : fallback;
}

function toCamel(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[^a-zA-Z]+/, '');
  return cleaned ? cleaned[0].toLowerCase() + cleaned.slice(1) : 'variable';
}

function typeLabel(type: DeepInteractionType): string {
  if (type === '3d_visualization') return '3D 可视化';
  if (type === 'simulation') return '模拟实验';
  if (type === 'game') return '游戏';
  return '思维导图';
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function buildQualityReport(
  result: FeedbackLoopResult,
  iterations: FeedbackIteration[],
  blueprint: LearningBlueprint,
  schemaValidation: SchemaValidationSummary,
  templateMetadata: TemplateMetadata,
  html: string,
): QualityReport {
  const score = result.finalScore;
  const level: QualityReport['level'] =
    score >= 90 ? 'excellent' :
    score >= 80 ? 'good' :
    score >= 70 ? 'usable' :
    score >= 50 ? 'needs_improvement' : 'failed';

  const lastIteration = iterations.at(-1);
  const evaluatorScores: Record<string, number> = {};
  if (lastIteration) {
    for (const e of lastIteration.evaluations) {
      evaluatorScores[e.agentName] = e.score;
    }
  }

  const allIssues = result.finalIssues;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];
  const pedagogy = lastIteration?.evaluations.find((evaluation) => evaluation.agentName === 'Pedagogy Evaluator');

  if (lastIteration) {
    for (const e of lastIteration.evaluations) {
      if (e.score >= 85) strengths.push(`${e.agentName} 评分优秀（${e.score}/100）`);
      if (e.score < 70) weaknesses.push(`${e.agentName} 评分不足（${e.score}/100）`);
    }
  }

  for (const issue of allIssues.filter((i) => i.severity === 'high' || i.severity === 'critical')) {
    suggestions.push(issue.suggestion);
  }

  if (strengths.length === 0) strengths.push('组件通过了基本的安全校验。');

  const report: QualityReport = {
    finalScore: score,
    level,
    summary: result.passed
      ? `组件质量良好（${score}/100），经过 ${iterations.length} 轮评审，可用于课堂演示。`
      : `组件质量${level === 'needs_improvement' ? '需要改进' : '不达标'}（${score}/100），建议人工审核后使用。`,
    strengths,
    weaknesses,
    suggestions: [...new Set(suggestions)],
    evaluatorScores,
    passed: result.passed,
    blueprintSummary: {
      topic: blueprint.topic,
      subjectDomain: blueprint.subjectDomain,
      gradeRange: blueprint.gradeRange,
      bloomLevel: blueprint.bloomLevel,
      expectedInsight: blueprint.expectedInsight,
    },
    schemaValidation,
  };

  if (typeof pedagogy?.blueprintAlignment === 'number') report.blueprintAlignment = pedagogy.blueprintAlignment;
  if (typeof pedagogy?.variableCoverage === 'number') report.variableCoverage = pedagogy.variableCoverage;
  if (typeof pedagogy?.learningObjectiveCoverage === 'number') {
    report.learningObjectiveCoverage = pedagogy.learningObjectiveCoverage;
  }
  if (typeof pedagogy?.knowledgeConstraintSatisfaction === 'number') {
    report.knowledgeConstraintSatisfaction = pedagogy.knowledgeConstraintSatisfaction;
    report.subjectCorrectness = pedagogy.knowledgeConstraintSatisfaction;
  } else if (schemaValidation.schemaKey && schemaValidation.violations.length === 0) {
    report.subjectCorrectness = 100;
  }

  report.qualityExplanation = buildQualityExplanation({
    blueprint,
    schemaValidation,
    pedagogy,
    templateMetadata,
    html,
  });
  const repairTrace = buildRepairTrace(iterations, schemaValidation, templateMetadata);
  if (repairTrace.length > 0) report.repairTrace = repairTrace;

  return report;
}

function buildQualityExplanation({
  blueprint,
  schemaValidation,
  pedagogy,
  templateMetadata,
  html,
}: {
  blueprint: LearningBlueprint;
  schemaValidation: SchemaValidationSummary;
  pedagogy?: AgentEvaluation;
  templateMetadata: TemplateMetadata;
  html: string;
}): NonNullable<QualityReport['qualityExplanation']> {
  const alignment = pedagogy?.blueprintAlignment;
  const constraintScore = pedagogy?.knowledgeConstraintSatisfaction;
  const variableScore = pedagogy?.variableCoverage;
  const expectedStatus =
    typeof alignment !== 'number' ? 'unknown' :
    alignment >= 85 ? 'satisfied' :
    alignment >= 65 ? 'partially_satisfied' : 'not_satisfied';

  const violatedText = schemaValidation.violations.join('\n');

  return {
    expectedInsightCheck: {
      status: expectedStatus,
      evidence: typeof alignment === 'number'
        ? [`Pedagogy Evaluator blueprintAlignment: ${alignment}/100`]
        : ['暂无可靠证据。'],
      issue: expectedStatus === 'not_satisfied' ? 'Expected insight may not be clearly supported.' : undefined,
    },
    variableChecks: blueprint.coreVariables.map((variable) => {
      const symbolPattern = new RegExp(escapeRegExp(variable.symbol), 'i');
      const namePattern = new RegExp(escapeRegExp(variable.name), 'i');
      const appears = symbolPattern.test(html) || namePattern.test(html);
      const status =
        typeof variableScore === 'number' && variableScore >= 85 && appears ? 'covered' :
        appears ? 'partially_covered' :
        typeof variableScore === 'number' && variableScore < 60 ? 'missing' : 'unknown';
      return {
        symbol: variable.symbol,
        role: variable.role,
        status,
        evidence: appears
          ? [`HTML contains "${variable.symbol}" or "${variable.name}".`]
          : ['暂无可靠证据。'],
      };
    }),
    constraintChecks: blueprint.knowledgeConstraints.map((constraint) => {
      const violated = violatedText.includes(constraint.id) || violatedText.includes(constraint.description);
      const status =
        violated ? 'violated' :
        typeof constraintScore === 'number' && constraintScore >= 90 ? 'satisfied' : 'unknown';
      return {
        id: constraint.id,
        description: constraint.description,
        severity: constraint.severity,
        status,
        evidence: violated
          ? schemaValidation.violations.filter((violation) => violation.includes(constraint.id) || violation.includes(constraint.description))
          : status === 'satisfied'
            ? [`Pedagogy Evaluator knowledgeConstraintSatisfaction: ${constraintScore}/100`]
            : ['暂无可靠证据。'],
        repairSuggestion: status === 'violated' ? constraint.mustBeTrue : undefined,
      };
    }),
    teacherControlNotes: [
      'Teacher actions should prefer stable data-role selectors or stable ids.',
      'Main artifact preview layout is unchanged.',
    ],
    templatePreservationNotes: buildTemplatePreservationNotes(templateMetadata),
  };
}

function buildTemplatePreservationNotes(templateMetadata: TemplateMetadata): string[] | undefined {
  if (templateMetadata.generationMode === 'free_generation') {
    return ['未使用 verified template，artifact 来自蓝图驱动自由生成路径。'];
  }
  const notes = [
    `Verified Template: ${templateMetadata.templateTitle ?? templateMetadata.templateId ?? 'unknown'}`,
    `Generation mode: ${templateMetadata.generationMode}`,
  ];
  if (typeof templateMetadata.matchScore === 'number') notes.push(`Match score: ${templateMetadata.matchScore.toFixed(2)}`);
  for (const slot of templateMetadata.appliedSlots ?? []) {
    notes.push(`Applied slot ${slot.key}: ${slot.reason}`);
  }
  for (const warning of templateMetadata.warnings ?? []) {
    notes.push(`Warning: ${warning}`);
  }
  return notes;
}

function buildRepairTrace(
  iterations: FeedbackIteration[],
  schemaValidation: SchemaValidationSummary,
  templateMetadata: TemplateMetadata,
): NonNullable<QualityReport['repairTrace']> {
  const trace: NonNullable<QualityReport['repairTrace']> = [];

  if (templateMetadata.generationMode === 'template_fallback_original') {
    trace.push({
      iteration: 0,
      trigger: 'template',
      issue: templateMetadata.warnings?.join(' ') || 'Template customization fallback.',
      actionTaken: 'Used original verified template.',
      affectedArea: 'html',
    });
  }

  if (schemaValidation.violations.length > 0) {
    trace.push({
      iteration: 0,
      trigger: 'schema',
      issue: schemaValidation.violations.join(' '),
      actionTaken: 'Passed schema validation summary into repair/evaluation context.',
      affectedArea: 'blueprint',
    });
  }

  for (const iteration of iterations) {
    if (iteration.judgeDecision.type !== 'repair') continue;
    for (const issue of iteration.judgeDecision.blockingIssues) {
      trace.push({
        iteration: iteration.iteration,
        trigger: repairTriggerForIssue(issue.category),
        issue: issue.message,
        actionTaken: iteration.changeLog?.join(' ') || iteration.judgeDecision.repairInstruction || 'RepairAgent attempted a targeted fix.',
        affectedArea: issue.target,
      });
    }
  }

  return trace;
}

function repairTriggerForIssue(category: AgentEvaluation['issues'][number]['category']): NonNullable<QualityReport['repairTrace']>[number]['trigger'] {
  if (category === 'safety') return 'safety';
  if (category === 'runtime') return 'runtime';
  if (category === 'pedagogy' || category === 'curriculum' || category === 'schema') return category === 'schema' ? 'schema' : 'pedagogy';
  return 'ux';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toSchemaValidationSummary(result: BlueprintValidationResult): SchemaValidationSummary {
  return {
    passed: result.passed,
    schemaKey: result.schemaKey,
    violations: result.violations,
    warnings: result.warnings,
  };
}

