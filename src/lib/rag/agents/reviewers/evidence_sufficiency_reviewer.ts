import type { RagAgentReview } from '../../types';
import { answerWithSections, buildEvidencePack } from '../evidence';
import type { RagAgentGenerator, RagMultiAgentContext } from '../types';
import { reviewerJsonInstruction, runJsonReviewer } from './reviewer_utils';

export async function reviewEvidenceSufficiency(
  context: RagMultiAgentContext,
  generator: RagAgentGenerator,
): Promise<RagAgentReview> {
  return runJsonReviewer({
    agentName: 'EvidenceSufficiencyReviewer',
    generator,
    systemPrompt: [
      'You are an evidence sufficiency reviewer for a subject RAG tutoring system.',
      'Check whether the answer uses enough evidence for the chosen task type, whether the cited evidence is relevant, and whether the answer is too speculative.',
      'Local course materials are primary. Web citations are supplementary only.',
      reviewerJsonInstruction(),
    ].join('\n'),
    userPrompt: [
      'Evidence pack:',
      buildEvidencePack(context),
      'Answer to review:',
      answerWithSections(context),
      'Return JSON only.',
    ].join('\n\n'),
  });
}
