import { parseJsonResponse } from '@/lib/generation/jsonParser';
import type { RagAgentReview, RagRevisionTrace } from '../types';
import { answerWithSections, buildEvidencePack, findMissingCitationRefs } from './evidence';
import type { RagAgentGenerator, RagMultiAgentContext } from './types';

interface RevisionJsonShape {
  answer?: unknown;
  changes?: unknown;
}

export interface RevisionAgentResult {
  answer: string;
  trace: RagRevisionTrace;
}

export async function reviseRagAnswer(input: {
  context: RagMultiAgentContext;
  reviews: RagAgentReview[];
  reason: string;
  generator: RagAgentGenerator;
  round: number;
}): Promise<RevisionAgentResult> {
  try {
    const raw = await input.generator({
      messages: [
        {
          role: 'system',
          content: [
            'You are STEMotion RevisionAgent for subject RAG tutoring answers.',
            'Task: revise the current answer using reviewer issues while preserving evidence boundaries.',
            'Return JSON only: {"answer": string, "changes": string[]}.',
            'The answer string may be a full RagAnswerEnvelope JSON string, or structured Markdown if the previous answer was fallback Markdown.',
            'Use only the locked evidence pack and the current answer.',
            'Do not add new [Lx] or [Wx] citations. Do not invent sources.',
            'If no evidence exists, keep the no-evidence warning.',
            input.round >= 2
              ? 'Round 2 is restricted to formatting, citation marker, disclaimer, and formula renderability fixes.'
              : 'Round 1 may fix structure, formulas, reasoning, citation binding, and pedagogy.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            'Evidence pack:',
            buildEvidencePack(input.context),
            'Current answer:',
            input.context.answer,
            'Current structured sections:',
            answerWithSections(input.context),
            'Reviewer issues:',
            JSON.stringify(input.reviews, null, 2),
            `Judge reason: ${input.reason}`,
          ].join('\n\n'),
        },
      ],
      temperature: 0.1,
      maxTokens: 16384,
      stream: false,
    });

    const parsed = parseJsonResponse(raw) as RevisionJsonShape;
    const revisedAnswer = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
    const changes = normalizeChanges(parsed.changes);
    if (!revisedAnswer) {
      return failedTrace(input.context.answer, input.round, 'RevisionAgent did not return an answer.');
    }

    const missingRefs = findMissingCitationRefs(revisedAnswer, input.context.citations);
    if (missingRefs.length > 0) {
      return failedTrace(
        input.context.answer,
        input.round,
        `Revision rejected because it introduced unavailable citations: ${[...new Set(missingRefs.map((ref) => ref.label))].join(', ')}`,
      );
    }

    if (input.context.citations.length === 0 && !hasNoEvidenceNotice(revisedAnswer)) {
      return failedTrace(input.context.answer, input.round, 'Revision rejected because it removed the no-evidence warning.');
    }

    return {
      answer: revisedAnswer,
      trace: {
        round: input.round,
        reason: input.reason,
        applied: true,
        changes: changes.length > 0 ? changes : ['Applied one targeted quality revision.'],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedTrace(input.context.answer, input.round, `RevisionAgent failed: ${message}`);
  }
}

function failedTrace(answer: string, round: number, reason: string): RevisionAgentResult {
  return {
    answer,
    trace: {
      round,
      reason,
      applied: false,
      changes: [],
    },
  };
}

function hasNoEvidenceNotice(value: string): boolean {
  return /(未找到可靠依据|no reliable evidence|知识库.*未找到|当前知识库和网络检索中未找到可靠依据)/i.test(value);
}

function normalizeChanges(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 8);
}
