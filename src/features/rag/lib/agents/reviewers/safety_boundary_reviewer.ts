import type { RagAgentIssue, RagAgentReview } from '../../types';
import { answerWithSections, buildEvidencePack, findCitationRefs } from '../evidence';
import type { RagAgentGenerator, RagMultiAgentContext } from '../types';
import { reviewerJsonInstruction, runJsonReviewer } from './reviewer_utils';

export async function reviewSafetyBoundary(
  context: RagMultiAgentContext,
  generator: RagAgentGenerator,
): Promise<RagAgentReview> {
  return runJsonReviewer({
    agentName: 'SafetyBoundaryReviewer',
    generator,
    localIssues: deterministicSafetyIssues(context),
    systemPrompt: [
      'You are STEMotion SafetyBoundaryReviewer for educational RAG.',
      'Task: check source integrity, citation boundaries, and the AI-generated learning disclaimer.',
      'The answer must not fabricate sources or overstate web material as authoritative course material.',
      'If no evidence exists, the answer must clearly say that the current knowledge base and web search did not find reliable evidence.',
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

function deterministicSafetyIssues(context: RagMultiAgentContext): RagAgentIssue[] {
  const text = answerWithSections(context);
  const issues: RagAgentIssue[] = [];
  const hasDisclaimer = /AI\s*生成内容|AI-generated|学习参考|learning reference/i.test(text);
  if (!hasDisclaimer) {
    issues.push({
      severity: 'warning',
      message: 'Answer should include the AI-generated learning disclaimer.',
      suggestion: 'Append the standard disclaimer to the final answer.',
    });
  }

  if (context.citations.length === 0) {
    const hasNoEvidenceNotice = /未找到可靠依据|no reliable evidence|知识库.*未找到/i.test(text);
    if (!hasNoEvidenceNotice) {
      issues.push({
        severity: 'error',
        message: 'No evidence was provided, but the answer does not clearly warn about insufficient evidence.',
        suggestion: 'Add the no-evidence notice and do not include [Lx]/[Wx] references.',
      });
    }
    if (findCitationRefs(text).length > 0) {
      issues.push({
        severity: 'critical',
        message: 'No citations are available, but citation markers appear in the answer.',
        suggestion: 'Remove fabricated [Lx]/[Wx] labels.',
      });
    }
  }

  return issues;
}
