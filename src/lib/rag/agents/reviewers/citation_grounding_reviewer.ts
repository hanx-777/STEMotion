import type { RagAgentIssue, RagAgentReview } from '../../types';
import { answerWithSections, buildEvidencePack, findMissingCitationRefs } from '../evidence';
import type { RagAgentGenerator, RagMultiAgentContext } from '../types';
import { reviewerJsonInstruction, runJsonReviewer } from './reviewer_utils';

export async function reviewCitationGrounding(
  context: RagMultiAgentContext,
  generator: RagAgentGenerator,
): Promise<RagAgentReview> {
  const text = answerWithSections(context);
  const missingRefs = findMissingCitationRefs(text, context.citations);
  const localIssues: RagAgentIssue[] = missingRefs.length > 0
    ? [{
        severity: 'critical',
        message: `Answer references unavailable citations: ${[...new Set(missingRefs.map((ref) => ref.label))].join(', ')}`,
        suggestion: 'Remove invented citation labels or map the claim to an existing citation.',
      }]
    : [];

  return runJsonReviewer({
    agentName: 'CitationGroundingReviewer',
    generator,
    localIssues,
    systemPrompt: [
      'You are a citation grounding reviewer for a subject-specific RAG tutoring system.',
      'Check whether every key claim is grounded in locked [Lx] or [Wx] citations when evidence exists.',
      'Local [Lx] citations are course materials and should be treated as primary trusted sources.',
      'Web [Wx] citations are supplementary references only and must not be described as course materials.',
      reviewerJsonInstruction(),
    ].join('\n'),
    userPrompt: [
      'Evidence pack:',
      buildEvidencePack(context),
      'Answer to review:',
      text,
      'Review focus: fabricated citations, unsupported key claims, and local/web source boundary.',
    ].join('\n\n'),
  });
}
