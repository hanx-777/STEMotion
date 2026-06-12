import { runAgentWidgetPipeline, type DeepInteractionGenerateInput } from '../../features/deep-interaction/lib/agentWidgetPipeline';
import type { DeepInteractionStreamEvent } from '../../features/deep-interaction/lib/events';
import type { InteractionArtifact } from '../../features/deep-interaction/lib/types';
import { askRag, type RagPipelineEvent } from '../../features/rag/lib/rag_pipeline';
import type { RagAskInput, RagAskResult } from '../../features/rag/lib/types';
import { sanitizeTraceValue } from '../../lib/generation/trace';
import { buildFinalQualityDecision, resolveGenerationMode } from '../../lib/generation/lightweightAgentPipeline';
import { isLegacyAgentPipeline } from '../../lib/generation/multiAgentGenerationPrompt';
import { createLogger } from '../../lib/logger';
import {
  runRagArtifactQualityReview,
  runRagVisualizationAuditPipeline,
  type RagArtifactQualityReviewInput,
  type RagArtifactQualityReviewOptions,
  type RagVisualizationAuditInput,
  type RagVisualizationAuditPipelineOptions,
} from '../../features/rag/lib/visualization/auditPipeline';
import {
  buildRagLightweightVisualizationPlan,
} from '../../features/rag/lib/visualization/lightweight_rag_visualization_agents';
import { mapQualityMode } from '../../features/rag/application/ragAskService';
import {
  toLegacyRagInput,
  toRagV1Response,
  type RagV1AskRequest,
  type RagV1QualityMode,
} from '../../features/rag/contracts';
import type {
  RagSessionGenerationResult,
  RagSessionGenerationQualityReviewStatus,
  RagSessionGenerationVisualizationStatus,
} from '../../shared/api/generationJobs';
import type { GenerationJobRunner, GenerationJobRunnerContext, GenerationJobRunnerMap } from '../jobs/types';

const log = createLogger('rag');

type RagAskRunner = (
  input: RagAskInput,
  options: {
    multiAgentMode?: ReturnType<typeof mapQualityMode>;
    visualizationMode?: 'auto' | 'manual' | 'off';
    signal?: AbortSignal;
    onEvent?: (event: RagPipelineEvent) => void;
  },
) => Promise<RagAskResult>;

type RagVisualizationJobInput = RagVisualizationAuditInput & {
  quality?: {
    mode?: RagV1QualityMode;
  };
  auditMaxIterations?: unknown;
};

export interface GenerationRunnerDeps {
  ragAsk?: RagAskRunner;
  ragVisualization?: (
    input: RagVisualizationAuditInput,
    options: RagVisualizationAuditPipelineOptions & { signal?: AbortSignal },
  ) => Promise<InteractionArtifact>;
  ragArtifactQualityReview?: (
    input: RagArtifactQualityReviewInput,
    options: RagArtifactQualityReviewOptions & { signal?: AbortSignal },
  ) => Promise<InteractionArtifact>;
  deepInteraction?: (
    input: DeepInteractionGenerateInput,
    emit: (event: DeepInteractionStreamEvent) => void,
    options: { isAborted?: () => boolean; signal?: AbortSignal },
  ) => Promise<void>;
}

export function createGenerationJobRunners(deps: GenerationRunnerDeps = {}): Required<GenerationJobRunnerMap> {
  return {
    rag_ask_stream: createRagAskStreamRunner(deps),
    rag_visualization: createRagVisualizationRunner(deps),
    rag_session_generation: createRagSessionGenerationRunner(deps),
    artifact_quality_review: createArtifactQualityReviewRunner(deps),
    deep_interaction: createDeepInteractionRunner(deps),
  };
}

function createRagAskStreamRunner(deps: GenerationRunnerDeps): GenerationJobRunner {
  const ragAsk = deps.ragAsk ?? askRag;
  return async (rawInput, context) => {
    const input = rawInput as RagV1AskRequest;
    const result = await ragAsk(toLegacyRagInput(input), {
      multiAgentMode: mapQualityMode(input.quality?.mode),
      visualizationMode: input.visualization?.mode ?? 'auto',
      signal: context.signal,
      onEvent: (event) => emitRagAskEvent(event, context),
    });

    const response = toRagV1Response(result);
    context.emit({ type: 'final_result', result: response });
    return response;
  };
}

function createRagVisualizationRunner(deps: GenerationRunnerDeps): GenerationJobRunner {
  const ragVisualization = deps.ragVisualization ?? runRagVisualizationAuditPipeline;
  return async (rawInput, context) => {
    const input = rawInput as unknown as RagVisualizationJobInput;
    const auditInput = sanitizeRagVisualizationInput(input);
    const policy = resolveRagVisualizationModePolicy(input.quality?.mode);
    return ragVisualization(auditInput, {
      emit: (event) => context.emit(event as unknown as Record<string, unknown>),
      isAborted: () => context.signal.aborted,
      maxIterations: policy.maxIterations,
      allowRepair: policy.allowRepair,
      reviewerProfile: policy.reviewerProfile,
      signal: context.signal,
    });
  };
}

function createArtifactQualityReviewRunner(deps: GenerationRunnerDeps): GenerationJobRunner {
  const reviewArtifact = deps.ragArtifactQualityReview ?? runRagArtifactQualityReview;
  return async (rawInput, context) => {
    const input = rawInput as unknown as RagArtifactQualityReviewInput;
    const artifactId = typeof input.artifact?.id === 'string' ? input.artifact.id : undefined;
    context.emit({
      type: 'artifact_quality_review_started',
      status: 'running',
      ...(artifactId ? { artifactId } : {}),
    });

    try {
      const result = await reviewArtifact(input, {
        emit: (event) => context.emit(event as unknown as Record<string, unknown>),
        isAborted: () => context.signal.aborted,
        signal: context.signal,
      });
      context.emit({
        type: 'artifact_quality_review_completed',
        status: 'completed',
        artifactId: result.id,
        result,
      });
      return result;
    } catch (error) {
      if (context.signal.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const diagnostics = extractSafeDiagnostics(error);
      context.emit({
        type: 'artifact_quality_review_failed',
        status: 'failed',
        ...(artifactId ? { artifactId } : {}),
        message,
        ...(diagnostics !== undefined ? { diagnostics } : {}),
      });
      throw error;
    }
  };
}

function createRagSessionGenerationRunner(deps: GenerationRunnerDeps): GenerationJobRunner {
  const ragAsk = deps.ragAsk ?? askRag;
  const ragVisualization = deps.ragVisualization ?? runRagVisualizationAuditPipeline;
  return async (rawInput, context) => {
    const input = rawInput as RagV1AskRequest;
    const ragResult = await ragAsk(toLegacyRagInput(input), {
      multiAgentMode: mapQualityMode(input.quality?.mode),
      visualizationMode: input.visualization?.mode ?? 'auto',
      signal: context.signal,
      onEvent: (event) => emitRagAskEvent(event, context),
    });

    const answer = toRagV1Response(ragResult);
    const visualizationMode = input.visualization?.mode ?? 'auto';
    let artifact: InteractionArtifact | undefined;
    let visualizationStatus: RagSessionGenerationVisualizationStatus = shouldGenerateRagSessionVisualization(input, ragResult)
      ? 'generating'
      : 'disabled';
    let qualityReviewJobId: string | undefined;
    let qualityReviewStatus: RagSessionGenerationQualityReviewStatus | undefined;
    let visualizationError: string | undefined;
    let errorDiagnostics: unknown;

    if (visualizationStatus === 'generating') {
      try {
        const policy = resolveRagVisualizationModePolicy(input.quality?.mode);
        const generationMode = resolveGenerationMode(input.quality?.mode);
        const pipelineKind = isLegacyAgentPipeline() ? 'legacy' : 'lightweight';

        // Round 002B: Build lightweight intermediate plan (pure, no LLM call)
        // In legacy mode, skip so the old audit pipeline runs unmodified.
        const lightweightPlan = pipelineKind === 'lightweight'
          ? buildRagLightweightVisualizationPlan(
              {
                question: input.question ?? '',
                subject: input.subjectId ?? ragResult.subject ?? '',
                taskType: input.taskType ?? ragResult.task_type ?? 'step_solution',
                answerText: ragResult.answer,
                formulaBlocks: ragResult.formula_blocks,
                finalResults: ragResult.final_results,
              },
              generationMode,
            )
          : undefined;

        const taskPlan = lightweightPlan?.taskPlan;
        log.info(
          `[rag:agents] mode=${generationMode} pipeline=${pipelineKind} ` +
          `agents=TaskPlanner,DomainModeler,VisualizationMapper,UIBuilder,LightweightReviewer ` +
          `specialist=${taskPlan?.needsSpecialist ?? false} ` +
          `reason=${taskPlan?.specialistReason ?? 'n/a'}`,
        );

        artifact = await ragVisualization(buildRagSessionVisualizationInput(input, ragResult), {
          emit: (event) => context.emit(event as unknown as Record<string, unknown>),
          isAborted: () => context.signal.aborted,
          maxIterations: policy.maxIterations,
          allowRepair: policy.allowRepair,
          reviewerProfile: policy.reviewerProfile,
          postPublishReviewMode: 'skip',
          signal: context.signal,
          // Pass lightweight plan to auditPipeline options (for htmlGenerator injection)
          lightweightPlan,
        });
        visualizationStatus = 'ready';
        if (shouldQueueArtifactQualityReview(policy, artifact)) {
          try {
            const reviewJob = await context.enqueueJob?.('artifact_quality_review', {
              artifact,
              parentJobType: 'rag_session_generation',
              clientSessionId: input.clientSessionId,
              qualityMode: input.quality?.mode,
            });
            if (reviewJob) {
              qualityReviewJobId = reviewJob.id;
              qualityReviewStatus = 'queued';
              context.emit({
                type: 'artifact_quality_review_started',
                status: 'queued',
                reviewJobId: qualityReviewJobId,
                artifactId: artifact.id,
              });
            }
          } catch (error) {
            qualityReviewStatus = 'failed';
            const message = error instanceof Error ? error.message : String(error);
            context.emit({
              type: 'artifact_quality_review_failed',
              status: 'failed',
              artifactId: artifact.id,
              message,
            });
          }
        }
      } catch (error) {
        if (context.signal.aborted) throw error;
        visualizationStatus = 'failed';
        visualizationError = error instanceof Error ? error.message : String(error);
        errorDiagnostics = extractSafeDiagnostics(error);
        context.emit({
          type: 'visualization_failed',
          status: 'failed',
          message: visualizationError,
          ...(errorDiagnostics !== undefined ? { diagnostics: errorDiagnostics } : {}),
        });
      }
    }

    const result = buildRagSessionGenerationResult(input, {
      answer,
      visualizationMode,
      visualizationStatus,
      artifact,
      qualityReviewJobId,
      qualityReviewStatus,
      visualizationError,
      errorDiagnostics,
    });
    context.emit({ type: 'final_result', result });
    return result;
  };
}

export function resolveRagVisualizationMaxIterations(mode?: RagV1QualityMode): number {
  return resolveRagVisualizationModePolicy(mode).maxIterations;
}

export function resolveRagVisualizationModePolicy(mode?: RagV1QualityMode): {
  maxIterations: number;
  allowRepair: boolean;
  reviewerProfile: 'full' | 'lightweight';
} {
  if (resolveGenerationMode(mode) !== 'highQuality') {
    return {
      maxIterations: 1,
      allowRepair: false,
      reviewerProfile: 'lightweight',
    };
  }

  return {
    maxIterations: 1,
    allowRepair: false,
    reviewerProfile: 'full',
  };
}

function shouldQueueArtifactQualityReview(
  policy: ReturnType<typeof resolveRagVisualizationModePolicy>,
  artifact: InteractionArtifact | undefined,
): boolean {
  return Boolean(artifact) && policy.reviewerProfile === 'full';
}

function sanitizeRagVisualizationInput(input: RagVisualizationJobInput): RagVisualizationAuditInput {
  const auditInput = { ...input } as Record<string, unknown>;
  delete auditInput.quality;
  delete auditInput.auditMaxIterations;
  return auditInput as unknown as RagVisualizationAuditInput;
}

function shouldGenerateRagSessionVisualization(input: RagV1AskRequest, ragResult: RagAskResult): boolean {
  if ((input.visualization?.mode ?? 'auto') !== 'auto') return false;
  if (ragResult.should_generate_visualization === false) return false;
  return true;
}

function buildRagSessionVisualizationInput(
  input: RagV1AskRequest,
  result: RagAskResult,
): RagVisualizationAuditInput {
  return {
    question: input.question ?? '',
    answerText: result.answer,
    answerSections: result.answer_sections,
    formulaBlocks: result.formula_blocks,
    finalResults: result.final_results,
    citations: result.citations,
    subject: input.subjectId ?? result.subject,
    taskType: input.taskType ?? result.task_type,
    source: input.source ?? 'student',
    visualizationSpec: result.visualization_spec,
  } as unknown as RagVisualizationAuditInput;
}

function buildRagSessionGenerationResult(
  input: RagV1AskRequest,
  options: {
    answer: ReturnType<typeof toRagV1Response>;
    visualizationMode: string;
    visualizationStatus: RagSessionGenerationVisualizationStatus;
    artifact?: InteractionArtifact;
    qualityReviewJobId?: string;
    qualityReviewStatus?: RagSessionGenerationQualityReviewStatus;
    visualizationError?: string;
    errorDiagnostics?: unknown;
  },
): RagSessionGenerationResult {
  const generationMode = resolveGenerationMode(input.quality?.mode);
  const finalQualityDecision = buildFinalQualityDecision({
    answerQualityReport: options.answer.qualityReport,
    artifactQualityReport: options.artifact?.qualityReport,
    outputForm: options.artifact ? 'answer_with_artifact' : 'answer',
  });
  const pipelineKind = isLegacyAgentPipeline() ? 'legacy' : 'lightweight';
  log.info(
    `[rag:quality] mode=${generationMode} pipeline=${pipelineKind} ` +
    `answerPassed=${finalQualityDecision.answerPassed} ` +
    `artifactPassed=${finalQualityDecision.artifactPassed ?? 'n/a'} ` +
    `overallPassed=${finalQualityDecision.overallPassed} decision=${finalQualityDecision.decision} ` +
    `blockingReasons=${finalQualityDecision.blockingReasons.length}`,
  );

  return {
    type: 'rag_session_generation_result',
    request: {
      question: input.question ?? '',
      subjectId: input.subjectId,
      taskType: input.taskType,
      useWebSearch: input.retrieval?.useWebSearch,
      qualityMode: input.quality?.mode,
      visualizationMode: options.visualizationMode,
      source: input.source,
      clientSessionId: input.clientSessionId,
    },
    answer: options.answer,
    visualizationStatus: options.visualizationStatus,
    ...(options.artifact ? { artifact: options.artifact } : {}),
    ...(options.qualityReviewJobId ? { qualityReviewJobId: options.qualityReviewJobId } : {}),
    ...(options.qualityReviewStatus ? { qualityReviewStatus: options.qualityReviewStatus } : {}),
    ...(options.visualizationError ? { visualizationError: options.visualizationError } : {}),
    ...(options.errorDiagnostics !== undefined ? { errorDiagnostics: options.errorDiagnostics } : {}),
    finalQualityDecision,
  };
}

function extractSafeDiagnostics(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
  if (diagnostics === undefined) return undefined;
  return sanitizeTraceValue(diagnostics);
}

function createDeepInteractionRunner(deps: GenerationRunnerDeps): GenerationJobRunner {
  const deepInteraction = deps.deepInteraction ?? runAgentWidgetPipeline;
  return async (rawInput, context) => {
    await deepInteraction(
      rawInput as unknown as DeepInteractionGenerateInput,
      (event) => context.emit(event as unknown as Record<string, unknown>),
      {
        isAborted: () => context.signal.aborted,
        signal: context.signal,
      },
    );
    return { completed: true };
  };
}

function emitRagAskEvent(event: RagPipelineEvent, context: GenerationJobRunnerContext): void {
  if (event.type === 'answer_ready') {
    context.emit({ ...event, result: toRagV1Response(event.result) });
    return;
  }
  if (event.type === 'quality_ready') {
    if (event.qualityReport) context.emit({ ...event, qualityReport: event.qualityReport });
    return;
  }
  context.emit(event);
}
