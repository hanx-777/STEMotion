import type {
  RagAgentIssue,
  RagQualityDecision,
  RagQualityReport,
  RagQualitySeverity,
} from '../types';

export interface RagJudgeResult {
  decision: RagQualityDecision;
  score: number;
  passed: boolean;
  reason: string;
}

export function judgeRagQuality(report: RagQualityReport): RagJudgeResult {
  const issues = collectIssues(report);
  const hasCritical = issues.some((issue) => issue.severity === 'critical');
  const hasError = issues.some((issue) => issue.severity === 'error');
  const hasWarning = issues.some((issue) => issue.severity === 'warning');
  const hasFabricatedCitation = issues
    .filter((issue) => issue.severity === 'error' || issue.severity === 'critical')
    .some((issue) => /citation|\[L\d+\]|\[W\d+\]|引用|伪造/i.test(issue.message));
  const score = combinedScore(report);

  if (hasCritical || (hasError && hasFabricatedCitation)) {
    return { decision: 'reject', score, passed: false, reason: 'Critical citation or safety issue detected.' };
  }
  if (hasError || score < 70) {
    return { decision: 'revise', score, passed: false, reason: 'Fixable quality issue detected.' };
  }
  if (score >= 85 && !hasWarning) {
    return { decision: 'accept', score, passed: true, reason: 'All reviewers passed without warnings.' };
  }
  return { decision: 'accept_with_warnings', score, passed: true, reason: 'Answer is usable with reviewer warnings.' };
}

export function applyJudgeResult(report: RagQualityReport, judge: RagJudgeResult): RagQualityReport {
  return {
    ...report,
    score: judge.score,
    passed: judge.passed,
    decision: judge.decision,
  };
}

function collectIssues(report: RagQualityReport): Array<{ severity: RagQualitySeverity; message: string }> {
  const checkIssues = report.checks.map((check) => ({
    severity: check.severity,
    message: `${check.name}: ${check.message}`,
  }));
  const agentIssues = (report.agent_reviews ?? []).flatMap((review) => (
    review.issues.map((issue: RagAgentIssue) => ({
      severity: issue.severity,
      message: `${review.agent_name}: ${issue.message}`,
    }))
  ));
  return [...checkIssues, ...agentIssues];
}

function combinedScore(report: RagQualityReport): number {
  const scores = [report.score];
  if (report.agent_reviews?.length) {
    const agentAverage = report.agent_reviews.reduce((total, review) => total + review.score, 0) / report.agent_reviews.length;
    scores.push(agentAverage);
  }
  return Math.max(0, Math.min(100, Math.round(Math.min(...scores))));
}
