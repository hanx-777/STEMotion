import type { AgentEvaluation, AgentIssue } from '../types';

const DEFAULT_EVALUATOR_TIMEOUT_MS = 45_000;
const FALLBACK_SCORE = 78;

export function resolveEvaluatorTimeoutMs(value = process.env.STEMOTION_EVALUATOR_TIMEOUT_MS): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  return DEFAULT_EVALUATOR_TIMEOUT_MS;
}

export function createNonBlockingEvaluatorFallback(input: {
  agentName: string;
  issueId: string;
  category: AgentIssue['category'];
  target: AgentIssue['target'];
  message: string;
  suggestion: string;
  startTime: number;
  error: unknown;
}): AgentEvaluation {
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);

  return {
    agentName: input.agentName,
    score: FALLBACK_SCORE,
    passed: true,
    summary: `${input.agentName} 未能完成，已按非阻塞 fallback 降级，主流程继续。`,
    issues: [{
      id: input.issueId,
      severity: 'warning',
      category: input.category,
      message: input.message,
      evidence: errorMessage,
      suggestion: input.suggestion,
      target: input.target,
    }],
    durationMs: Date.now() - input.startTime,
  };
}
