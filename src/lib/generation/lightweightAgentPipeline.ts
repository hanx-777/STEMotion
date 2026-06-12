import type {
  FinalQualityDecision,
  GenerationMode,
  LightweightReview,
  PlannerOutput,
} from '@/shared/api/lightweightAgentPipeline';

export type {
  FinalQualityDecision,
  GenerationMode,
  LightweightReview,
  PlannerOutput,
} from '@/shared/api/lightweightAgentPipeline';

type OutputForm = PlannerOutput['outputForm'];

interface QualitySignal {
  hasSignal: boolean;
  passed: boolean;
  blockingReasons: string[];
}

export function resolveGenerationMode(input?: unknown): GenerationMode {
  if (input === 'fast') return 'fast';
  if (input === 'highQuality') return 'highQuality';
  return 'balanced';
}

export function getMaxRepairRounds(mode: GenerationMode): number {
  if (mode === 'fast') return 0;
  if (mode === 'highQuality') return 2;
  return 1;
}

export function buildFinalQualityDecision(args: {
  answerQualityReport?: unknown;
  artifactQualityReport?: unknown;
  lightweightReview?: LightweightReview;
  outputForm?: OutputForm;
}): FinalQualityDecision {
  const outputForm = args.outputForm ?? inferOutputForm(args);
  const requiresAnswer = outputForm === 'answer' || outputForm === 'answer_with_artifact';
  const requiresArtifact = outputForm === 'artifact' || outputForm === 'answer_with_artifact';
  const answerSignal = requiresAnswer
    ? evaluateAnswerQuality(args.answerQualityReport)
    : { hasSignal: true, passed: true, blockingReasons: [] };
  const artifactSignal = requiresArtifact
    ? evaluateArtifactQuality(args.artifactQualityReport)
    : undefined;
  const reviewReasons = evaluateLightweightReview(args.lightweightReview);
  const blockingReasons = uniqueReasons([
    ...(requiresAnswer ? answerSignal.blockingReasons : []),
    ...(requiresArtifact && artifactSignal ? artifactSignal.blockingReasons : []),
    ...reviewReasons,
  ]);

  if ((requiresAnswer && !answerSignal.hasSignal) || (requiresArtifact && !artifactSignal?.hasSignal)) {
    blockingReasons.push('insufficient_quality_signal');
  }

  const answerPassed = requiresAnswer ? answerSignal.hasSignal && answerSignal.passed : true;
  const artifactPassed = requiresArtifact
    ? Boolean(artifactSignal?.hasSignal && artifactSignal.passed)
    : undefined;
  const overallPassed = answerPassed && (requiresArtifact ? artifactPassed === true : true) && blockingReasons.length === 0;
  const decision = overallPassed
    ? 'publish'
    : blockingReasons.some((reason) => reason.endsWith('_failed') || reason === 'citation_must_fix')
      ? 'reject'
      : 'revise_once';

  return {
    answerPassed,
    ...(requiresArtifact ? { artifactPassed } : {}),
    overallPassed,
    decision,
    blockingReasons: uniqueReasons(blockingReasons),
  };
}

function inferOutputForm(args: {
  answerQualityReport?: unknown;
  artifactQualityReport?: unknown;
}): OutputForm {
  if (args.answerQualityReport !== undefined && args.artifactQualityReport !== undefined) return 'answer_with_artifact';
  if (args.artifactQualityReport !== undefined) return 'artifact';
  return 'answer';
}

function evaluateAnswerQuality(report: unknown): QualitySignal {
  if (!hasQualitySignal(report)) {
    return { hasSignal: false, passed: false, blockingReasons: [] };
  }

  const reasons: string[] = [];
  const record = asRecord(report);
  const decision = lowerString(record?.decision);
  const status = lowerString(record?.status);
  const explicitPassed = typeof record?.passed === 'boolean' ? record.passed : undefined;

  if (explicitPassed === false || isRejectLike(decision) || isRejectLike(status)) {
    reasons.push('answer_quality_failed');
  } else if (decision === 'revise' || status === 'needs_revision') {
    reasons.push('answer_quality_needs_revision');
  }

  if (hasSevereIssue(report, ['citation'])) {
    reasons.push('citation_must_fix');
  }

  return {
    hasSignal: true,
    passed: reasons.length === 0 && (explicitPassed === true || isAcceptLike(decision) || status === 'reviewed' || hasNumericScore(record)),
    blockingReasons: uniqueReasons(reasons),
  };
}

function evaluateArtifactQuality(report: unknown): QualitySignal {
  if (!hasQualitySignal(report)) {
    return { hasSignal: false, passed: false, blockingReasons: [] };
  }

  const reasons: string[] = [];
  const record = asRecord(report);
  const decision = lowerString(record?.decision);
  const status = lowerString(record?.status);
  const level = lowerString(record?.level);
  const explicitPassed = typeof record?.passed === 'boolean' ? record.passed : undefined;

  if (isRejectLike(decision) || isRejectLike(status) || level === 'failed') {
    reasons.push('artifact_quality_failed');
  }
  if (hasSevereIssue(report, ['runtime']) || hasFailureText(report, ['runtime'])) {
    reasons.push('artifact_runtime_failed');
  }
  if (hasSevereIssue(report, ['safety']) || hasFailureText(report, ['safety'])) {
    reasons.push('artifact_safety_failed');
  }
  if (explicitPassed === false && reasons.length === 0) {
    reasons.push('artifact_quality_failed');
  }

  return {
    hasSignal: true,
    passed: reasons.length === 0 && (explicitPassed === true || isAcceptLike(decision) || status === 'reviewed' || hasNumericScore(record)),
    blockingReasons: uniqueReasons(reasons),
  };
}

function evaluateLightweightReview(review?: LightweightReview): string[] {
  if (!review) return [];
  const reasons: string[] = [];

  if (review.status === 'fail' || review.finalDecision === 'reject') {
    reasons.push('lightweight_review_failed');
  }

  for (const issue of review.mustFix) {
    if (issue.severity !== 'critical' && issue.severity !== 'high') continue;
    if (issue.area === 'citation') {
      reasons.push('citation_must_fix');
      continue;
    }
    if (issue.area === 'runtime') {
      reasons.push('artifact_runtime_failed');
      continue;
    }
    if (issue.area === 'safety') {
      reasons.push('artifact_safety_failed');
      continue;
    }
    if ((issue.area === 'ui' || issue.area === 'ux') && isBlockingUiUxIssue(issue.problem)) {
      reasons.push('artifact_ui_ux_blocking');
    }
  }

  return uniqueReasons(reasons);
}

function hasQualitySignal(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  return [
    'passed',
    'score',
    'decision',
    'checks',
    'agent_reviews',
    'finalScore',
    'level',
    'status',
    'issues',
    'finalIssues',
  ].some((key) => key in record);
}

function hasSevereIssue(value: unknown, categories: string[]): boolean {
  return collectIssues(value).some((issue) => {
    const severity = lowerString(issue.severity);
    if (severity !== 'critical' && severity !== 'high' && severity !== 'error') return false;
    const haystack = [
      lowerString(issue.area),
      lowerString(issue.category),
      lowerString(issue.name),
      lowerString(issue.message),
      lowerString(issue.problem),
      lowerString(issue.summary),
    ].join(' ');
    return categories.some((category) => haystack.includes(category));
  });
}

function hasFailureText(value: unknown, categories: string[]): boolean {
  const text = JSON.stringify(value ?? '').toLowerCase();
  if (!/(fail|failed|reject|critical|严重|失败|未通过)/.test(text)) return false;
  return categories.some((category) => text.includes(category));
}

function collectIssues(value: unknown): Array<Record<string, unknown>> {
  const record = asRecord(value);
  if (!record) return [];
  const issues: Array<Record<string, unknown>> = [];
  appendRecordArray(issues, record.checks);
  appendRecordArray(issues, record.issues);
  appendRecordArray(issues, record.finalIssues);
  appendRecordArray(issues, record.blockingIssues);
  appendRecordArray(issues, record.mustFix);

  if (Array.isArray(record.agent_reviews)) {
    for (const review of record.agent_reviews) {
      const reviewRecord = asRecord(review);
      if (!reviewRecord) continue;
      appendRecordArray(issues, reviewRecord.issues);
    }
  }

  if (Array.isArray(record.iterations)) {
    for (const iteration of record.iterations) {
      const iterationRecord = asRecord(iteration);
      if (!iterationRecord) continue;
      appendRecordArray(issues, asRecord(iterationRecord.judgeDecision)?.blockingIssues);
      if (Array.isArray(iterationRecord.evaluations)) {
        for (const evaluation of iterationRecord.evaluations) {
          appendRecordArray(issues, asRecord(evaluation)?.issues);
        }
      }
    }
  }

  return issues;
}

function appendRecordArray(target: Array<Record<string, unknown>>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const record = asRecord(item);
    if (record) target.push(record);
  }
}

function isBlockingUiUxIssue(problem: string): boolean {
  return /(首屏|first.?screen|above.?the.?fold|主内容|主舞台|main.?stage|不可见|看不见|not visible|unusable|不可用|不能运行|does not run|runtime)/i
    .test(problem);
}

function isRejectLike(value: string): boolean {
  return value === 'reject'
    || value === 'rejected'
    || value === 'fail'
    || value === 'failed'
    || value === 'error'
    || value === 'critical'
    || value === 'review_failed';
}

function isAcceptLike(value: string): boolean {
  return value === 'accept'
    || value === 'accepted'
    || value === 'accept_with_warnings'
    || value === 'pass'
    || value === 'passed'
    || value === 'publish'
    || value === 'excellent'
    || value === 'good'
    || value === 'usable';
}

function hasNumericScore(record: Record<string, unknown> | undefined): boolean {
  if (!record) return false;
  return typeof record.score === 'number' || typeof record.finalScore === 'number';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function lowerString(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function uniqueReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}
