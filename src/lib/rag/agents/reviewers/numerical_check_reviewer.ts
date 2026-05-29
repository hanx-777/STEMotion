import type { RagAgentIssue, RagAgentReview } from '../../types';
import { answerWithSections, buildEvidencePack } from '../evidence';
import type { RagAgentGenerator, RagMultiAgentContext } from '../types';
import { reviewerJsonInstruction, runJsonReviewer } from './reviewer_utils';

export async function reviewNumericalCheck(
  context: RagMultiAgentContext,
  generator: RagAgentGenerator,
): Promise<RagAgentReview> {
  return runJsonReviewer({
    agentName: 'NumericalCheckReviewer',
    generator,
    localIssues: deterministicNumericalIssues(context),
    systemPrompt: [
      'You are a numerical consistency reviewer.',
      'Check whether numeric substitutions, units, and final results are internally consistent.',
      'For projectile motion, check v0 decomposition, H, T, and R consistency with g and angle.',
      reviewerJsonInstruction(),
    ].join('\n'),
    userPrompt: [
      'Evidence pack:',
      buildEvidencePack(context),
      'Answer to review:',
      answerWithSections(context),
    ].join('\n\n'),
  });
}

function deterministicNumericalIssues(context: RagMultiAgentContext): RagAgentIssue[] {
  const text = answerWithSections(context).replace(/\s+/g, ' ');
  const issues: RagAgentIssue[] = [];
  if (!/m\/s|m\/s²|m\/s\^2|米每秒/.test(text)) {
    issues.push({
      severity: 'warning',
      message: 'Numeric answer should show units alongside values.',
      suggestion: 'State units for velocity, height, range, and time explicitly.',
    });
  }
  return issues;
}
