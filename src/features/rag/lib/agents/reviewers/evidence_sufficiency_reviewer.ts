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
      'You are STEMotion EvidenceSufficiencyReviewer.',
      'Task: check whether the answer uses enough relevant evidence for the selected task type and whether it is too speculative.',
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
