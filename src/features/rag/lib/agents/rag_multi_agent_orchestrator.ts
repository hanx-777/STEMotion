import type { RagAgentReview, RagQualityReport, RagRevisionTrace } from '../types';
import { applyJudgeResult, judgeRagQuality } from './judge_agent';
import { reviseRagAnswer } from './revision_agent';
import { reviewCitationGrounding } from './reviewers/citation_grounding_reviewer';
import { reviewEvidenceSufficiency } from './reviewers/evidence_sufficiency_reviewer';
import { reviewFormulaRenderability } from './reviewers/formula_renderability_reviewer';
import { reviewNumericalCheck } from './reviewers/numerical_check_reviewer';
import { reviewPedagogy } from './reviewers/pedagogy_reviewer';
import { reviewPhysicsReasoning } from './reviewers/physics_reasoning_reviewer';
import { reviewSafetyBoundary } from './reviewers/safety_boundary_reviewer';
import type { RagMultiAgentMode, RagMultiAgentContext, RagMultiAgentOptions, RagMultiAgentResult } from './types';

export function getRagMultiAgentMode(value = process.env.STEMOTION_RAG_MULTI_AGENT_MODE): RagMultiAgentMode {
  if (value === 'review' || value === 'review_and_revise' || value === 'high_quality' || value === 'off') return value;
  return 'off';
}

export async function runRagMultiAgentOrchestrator(
  context: RagMultiAgentContext,
  options: RagMultiAgentOptions,
): Promise<RagMultiAgentResult> {
  const mode = options.mode ?? getRagMultiAgentMode();
  let answer = context.answer;
  let answerSections = context.answerSections;
  let report = withDecision(context.deterministicReport);
  const revisionTrace: RagRevisionTrace[] = [];

  if (mode === 'off') {
    return result(context, answer, answerSections, report);
  }

  let workingContext = { ...context, answer, answerSections, deterministicReport: report };
  let agentReviews = [
    ...(report.agent_reviews ?? []),
    ...await runAgentReviews(workingContext, options, mode),
  ];
  report = withDecision({
    ...report,
    agent_reviews: agentReviews,
  });

  const maxRevisionRounds = mode === 'high_quality' ? 2 : mode === 'review_and_revise' ? 1 : 0;
  for (let round = 1; round <= maxRevisionRounds && report.decision === 'revise'; round++) {
    const revision = await reviseRagAnswer({
      context: workingContext,
      reviews: agentReviews,
      reason: round === 1
        ? 'Judge requested a targeted quality revision.'
        : 'Second pass is limited to formatting, citation markers, disclaimer, and formula renderability.',
      generator: options.revisionGenerator,
      round,
    });
    revisionTrace.push(revision.trace);
    if (!revision.trace.applied) break;

    answer = options.finalizeAnswer ? options.finalizeAnswer(revision.answer) : revision.answer;
    answerSections = options.rebuildAnswerSections(answer);
    const deterministicReport = options.rerunDeterministicReview(answer, answerSections);
    workingContext = {
      ...workingContext,
      answer,
      answerSections,
      deterministicReport,
    };
    const previousLlmReviews = agentReviews.filter((review) => review.agent_name !== 'PresentationReviewer');
    agentReviews = mode === 'high_quality'
      ? [
          ...(deterministicReport.agent_reviews ?? []),
          ...await runAgentReviews(workingContext, options, mode),
        ]
      : [
          ...(deterministicReport.agent_reviews ?? []),
          ...previousLlmReviews,
        ];
    report = withDecision({
      ...deterministicReport,
      agent_reviews: agentReviews,
      revision_trace: [...revisionTrace],
    });
  }

  if (revisionTrace.length > 0 && !report.revision_trace) {
    report = withDecision({
      ...report,
      revision_trace: [...revisionTrace],
    });
  }

  return result(context, answer, answerSections, report);
}

async function runAgentReviews(
  context: RagMultiAgentContext,
  options: RagMultiAgentOptions,
  mode: RagMultiAgentMode,
): Promise<RagAgentReview[]> {
  const baseReviews = [
    reviewCitationGrounding(context, options.reviewGenerator),
    reviewEvidenceSufficiency(context, options.reviewGenerator),
    reviewFormulaRenderability(context, options.reviewGenerator),
    reviewPhysicsReasoning(context, options.reviewGenerator),
    reviewPedagogy(context, options.reviewGenerator),
    reviewSafetyBoundary(context, options.reviewGenerator),
  ];
  if (mode === 'high_quality') {
    baseReviews.splice(4, 0, reviewNumericalCheck(context, options.reviewGenerator));
  }
  return Promise.all(baseReviews);
}

function withDecision(report: RagQualityReport): RagQualityReport {
  return applyJudgeResult(report, judgeRagQuality(report));
}

function result(
  context: RagMultiAgentContext,
  answer: string,
  answerSections: RagMultiAgentContext['answerSections'],
  qualityReport: RagQualityReport,
): RagMultiAgentResult {
  return {
    answer,
    answerSections,
    answerProtocol: context.answerProtocol,
    formulaBlocks: context.formulaBlocks,
    finalResults: context.finalResults,
    qualityReport,
  };
}
