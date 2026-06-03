import { decideVisualization } from './decision_agent';
import { generateInteractiveHtml, type HtmlGenerationInput } from './htmlGenerator';
import { generateAlgorithmTraceSpecFromText, normalizeAlgorithmTraceSpec } from './algorithmTraceSpec';
import { checkVisualizationSpec } from './quality_checker';
import { generateVisualizationSpec } from './spec_generator';
import { createRagVisualizationBrief } from './briefAgent';
import type {
  RagVisualizationBrief,
  VisualizationDecision,
  VisualizationQualityCheck,
  VisualizationSpec,
  VisualizationType,
} from './types';

type RagVisualizationEngine = 'deterministic_spec' | 'interactive_html_agent' | 'none';

export interface RagVisualizationPlan {
  shouldVisualize: boolean;
  engine: RagVisualizationEngine;
  visualizationType?: VisualizationType;
  confidence: number;
  reason: string;
  repaired: boolean;
}

export interface RagVisualizationOrchestratorInput {
  question: string;
  answerText?: string;
  subject: string;
  taskType: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  initialDecision?: VisualizationDecision;
  initialSpec?: VisualizationSpec;
  brief?: RagVisualizationBrief;
  htmlGenerator?: (input: HtmlGenerationInput) => Promise<string>;
}

export interface RagVisualizationOrchestratorResult {
  decision: VisualizationDecision;
  plan: RagVisualizationPlan;
  spec?: VisualizationSpec;
  quality?: VisualizationQualityCheck;
}

export async function orchestrateRagVisualization(
  input: RagVisualizationOrchestratorInput,
): Promise<RagVisualizationOrchestratorResult> {
  const decision = input.initialDecision ?? decideVisualization({
    question: input.question,
    answerText: input.answerText,
  });
  const brief = input.brief ?? createRagVisualizationBrief({
    question: input.question,
    answerText: input.answerText,
    subject: input.subject,
    taskType: input.taskType,
    recommendedType: decision.visualizationType,
  });

  const visualizationType = brief.recommendedType ?? decision.visualizationType;
  if (!decision.shouldVisualize && brief.confidence < 0.6) {
    return {
      decision,
      plan: {
        shouldVisualize: false,
        engine: 'none',
        confidence: decision.confidence,
        reason: decision.reason,
        repaired: false,
      },
    };
  }

  const effectiveDecision: VisualizationDecision = {
    ...decision,
    shouldVisualize: true,
    visualizationType,
    confidence: Math.max(decision.confidence, brief.confidence),
    reason: `${decision.reason}; ${brief.knowledgePoint}: ${brief.visualGoal}`,
  };

  if (effectiveDecision.visualizationType === 'interactive_html') {
    return createInteractiveHtmlResult(input, effectiveDecision, effectiveDecision.reason, brief);
  }

  let spec = input.initialSpec ?? await generateVisualizationSpec({
    decision: effectiveDecision,
    question: input.question,
    answerText: input.answerText,
    formulaBlocks: input.formulaBlocks,
    finalResults: input.finalResults,
    brief,
  });
  let repaired = false;
  let reason = effectiveDecision.reason;

  if (!spec && effectiveDecision.visualizationType === 'algorithm_trace') {
    spec = generateAlgorithmTraceSpecFromText(input.question, input.answerText ?? '', brief);
    repaired = true;
    reason = `${effectiveDecision.reason}；fallback 补全算法过程演示。`;
  }

  if (spec?.type === 'algorithm_trace') {
    const quality = checkVisualizationSpec(spec);
    if (!quality.passed) {
      const normalized = normalizeAlgorithmTraceSpec(spec);
      const normalizedQuality = checkVisualizationSpec(normalized);
      if (normalizedQuality.passed) {
        spec = normalized;
        repaired = true;
        reason = `${effectiveDecision.reason}；质量检查发现演示过于含糊，已修复并补全状态转移。`;
      }
    }
  }

  if (!spec) {
    return createInteractiveHtmlResult(
      input,
      effectiveDecision,
      `${effectiveDecision.reason}；确定性可视化无法生成，改用交互式 HTML 模块。`,
      brief,
    );
  }

  const quality = checkVisualizationSpec(spec);
  if (!quality.passed) {
    return createInteractiveHtmlResult(
      input,
      effectiveDecision,
      `${effectiveDecision.reason}；确定性可视化质量未通过，改用交互式 HTML 模块。`,
      brief,
    );
  }

  return {
    decision: effectiveDecision,
    plan: {
      shouldVisualize: true,
      engine: 'deterministic_spec',
      visualizationType: spec.type,
      confidence: effectiveDecision.confidence,
      reason,
      repaired,
    },
    spec,
    quality,
  };
}

async function createInteractiveHtmlResult(
  input: RagVisualizationOrchestratorInput,
  decision: VisualizationDecision,
  reason: string,
  brief: RagVisualizationBrief,
): Promise<RagVisualizationOrchestratorResult> {
  const htmlInput: HtmlGenerationInput = {
    question: input.question,
    answerText: input.answerText ?? '',
    visualizationType: decision.visualizationType ?? 'interactive_html',
    extractedParameters: decision.extractedParameters,
    formulaBlocks: input.formulaBlocks,
    finalResults: input.finalResults,
    brief,
  };
  const html = await (input.htmlGenerator ?? generateInteractiveHtml)(htmlInput);
  const spec: VisualizationSpec = {
    type: 'interactive_html',
    title: `${visualizationTypeLabel(decision.visualizationType)}演示`,
    description: brief.visualGoal || reason,
    contextTitle: brief.knowledgePoint,
    knowledgePoint: brief.knowledgePoint,
    scenario: brief.scenario,
    variables: brief.variables,
    visualGoal: brief.visualGoal,
    brief,
    html,
    interactionType: mapToInteractionType(decision.visualizationType),
    parameters: decision.extractedParameters,
  };
  const quality = checkVisualizationSpec(spec);

  return {
    decision,
    plan: {
      shouldVisualize: true,
      engine: 'interactive_html_agent',
      visualizationType: spec.type,
      confidence: decision.confidence,
      reason,
      repaired: false,
    },
    spec,
    quality,
  };
}

function mapToInteractionType(type: VisualizationType | undefined): Extract<VisualizationSpec, { type: 'interactive_html' }>['interactionType'] {
  if (type === 'projectile_motion' || type === 'force_diagram') return 'physics_simulation';
  if (type === 'function_graph') return 'math_visualization';
  if (type === 'algorithm_trace') return 'algorithm_demo';
  return 'custom';
}

function visualizationTypeLabel(type: VisualizationType | undefined): string {
  const labels: Record<VisualizationType, string> = {
    function_graph: '函数图像',
    force_diagram: '受力分析',
    algorithm_trace: '算法过程',
    projectile_motion: '抛体运动',
    interactive_html: '交互式可视化',
  };
  return type ? labels[type] : '交互式可视化';
}
