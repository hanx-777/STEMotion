import type { RagAgentIssue, RagAgentReview } from '../../types';
import { answerWithSections, buildEvidencePack } from '../evidence';
import { extractLatexFormulas, findBareLatexArtifacts, validateLatexFormula } from '../../math_render';
import type { RagAgentGenerator, RagMultiAgentContext } from '../types';
import { reviewerJsonInstruction, runJsonReviewer } from './reviewer_utils';

export async function reviewFormulaRenderability(
  context: RagMultiAgentContext,
  generator: RagAgentGenerator,
): Promise<RagAgentReview> {
  return runJsonReviewer({
    agentName: 'FormulaRenderabilityReviewer',
    generator,
    localIssues: deterministicFormulaIssues(context),
    systemPrompt: [
      'You are STEMotion FormulaRenderabilityReviewer.',
      'Task: check whether formulas are present, KaTeX-renderable, free of visible LaTeX artifacts, and complete for the task.',
      'For projectile motion, key formulas must be present when relevant.',
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

function deterministicFormulaIssues(context: RagMultiAgentContext): RagAgentIssue[] {
  const text = answerWithSections(context);
  const formulas = extractLatexFormulas(text);
  const invalid = formulas.filter((formula) => !validateLatexFormula(formula).ok);
  const artifacts = findBareLatexArtifacts(text);
  const issues: RagAgentIssue[] = [];
  if (invalid.length > 0) {
    issues.push({
      severity: 'error',
      message: `Found ${invalid.length} invalid LaTeX formula(s).`,
      suggestion: 'Rewrite formulas using valid KaTeX-compatible LaTeX.',
    });
  }
  if (artifacts.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Found bare LaTeX artifacts: ${artifacts.slice(0, 4).join(', ')}.`,
      suggestion: 'Use structured math rendering instead of raw LaTeX text.',
    });
  }
  return issues;
}
