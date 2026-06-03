import type { RagAgentReview } from '../../types';
import { answerWithSections, buildEvidencePack } from '../evidence';
import type { RagAgentGenerator, RagMultiAgentContext } from '../types';
import { reviewerJsonInstruction, runJsonReviewer } from './reviewer_utils';

export async function reviewPedagogy(
  context: RagMultiAgentContext,
  generator: RagAgentGenerator,
): Promise<RagAgentReview> {
  return runJsonReviewer({
    agentName: 'PedagogyReviewer',
    generator,
    systemPrompt: [
      'You are STEMotion PedagogyReviewer.',
      'Task: check whether the answer is understandable for students and useful for the selected task type.',
      'For step_solution, check step-by-step reasoning, known/unknown quantities, final results, and common pitfalls.',
      'For teacher_prep, check teaching objectives, class introduction, board work, interaction prompts, visualization, and practice.',
      reviewerJsonInstruction(),
    ].join('\n'),
    userPrompt: [
      'Evidence pack:',
      buildEvidencePack(context),
      'Answer to review:',
      answerWithSections(context),
      'Task type:',
      context.taskType,
    ].join('\n\n'),
  });
}
