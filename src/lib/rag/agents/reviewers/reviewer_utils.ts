import { parseJsonResponse } from '@/lib/generation/jsonParser';
import type { LlmGenerateOptions } from '@/lib/generation/llmClient';
import type { RagAgentIssue, RagAgentReview, RagQualitySeverity } from '../../types';
import type { RagAgentGenerator } from '../types';

interface ReviewerJsonShape {
  score?: unknown;
  passed?: unknown;
  summary?: unknown;
  issues?: unknown;
}

interface RunJsonReviewerInput {
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  generator: RagAgentGenerator;
  localIssues?: RagAgentIssue[];
}

export async function runJsonReviewer(input: RunJsonReviewerInput): Promise<RagAgentReview> {
  try {
    const raw = await input.generator(createReviewerOptions(input.systemPrompt, input.userPrompt));
    const parsed = parseJsonResponse(raw) as ReviewerJsonShape;
    return normalizeReview(input.agentName, parsed, input.localIssues ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      agent_name: input.agentName,
      score: 70,
      passed: false,
      summary: `${input.agentName} unavailable; base RAG answer is preserved.`,
      issues: [
        {
          severity: 'warning',
          message: `Reviewer failed: ${message}`,
          suggestion: 'Check model configuration if LLM multi-agent review is required.',
        },
        ...(input.localIssues ?? []),
      ],
    };
  }
}

export function normalizeReview(
  agentName: string,
  parsed: ReviewerJsonShape,
  localIssues: RagAgentIssue[] = [],
): RagAgentReview {
  const modelIssues = normalizeIssues(parsed.issues);
  const issues = [...localIssues, ...modelIssues];
  const hasBlockingIssue = issues.some((issue) => issue.severity === 'error' || issue.severity === 'critical');
  const score = adjustScore(clampScore(parsed.score), issues);
  return {
    agent_name: agentName,
    score,
    passed: typeof parsed.passed === 'boolean' ? parsed.passed && !hasBlockingIssue : !hasBlockingIssue,
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : `${agentName} completed.`,
    issues,
  };
}

export function reviewerJsonInstruction(): string {
  return [
    'Return JSON only. Do not return Markdown or prose.',
    'JSON schema:',
    '{"score": number between 0 and 100, "passed": boolean, "summary": string, "issues": [{"severity": "info|warning|error|critical", "message": string, "suggestion"?: string}]}',
    'Do not use external knowledge beyond the supplied evidence pack and answer.',
  ].join('\n');
}

function createReviewerOptions(systemPrompt: string, userPrompt: string): LlmGenerateOptions {
  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    maxTokens: 8192,
    stream: false,
  };
}

function normalizeIssues(value: unknown): RagAgentIssue[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      return { severity: 'warning' as const, message: 'Reviewer returned an invalid issue item.' };
    }
    const issue = item as Record<string, unknown>;
    return {
      severity: normalizeSeverity(issue.severity),
      message: typeof issue.message === 'string' && issue.message.trim()
        ? issue.message.trim()
        : 'Reviewer returned an issue without a message.',
      suggestion: typeof issue.suggestion === 'string' && issue.suggestion.trim()
        ? issue.suggestion.trim()
        : undefined,
    };
  });
}

function normalizeSeverity(value: unknown): RagQualitySeverity {
  if (value === 'info' || value === 'warning' || value === 'error' || value === 'critical') return value;
  return 'warning';
}

function clampScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function adjustScore(score: number, issues: RagAgentIssue[]): number {
  if (issues.some((issue) => issue.severity === 'critical')) return Math.min(score, 35);
  if (issues.some((issue) => issue.severity === 'error')) return Math.min(score, 58);
  if (issues.some((issue) => issue.severity === 'warning')) return Math.min(score, 82);
  return score;
}
