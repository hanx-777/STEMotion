import type { RagAgentIssue, RagAgentReview } from '../../types';
import { answerWithSections, buildEvidencePack } from '../evidence';
import type { RagAgentGenerator, RagMultiAgentContext } from '../types';
import { reviewerJsonInstruction, runJsonReviewer } from './reviewer_utils';

export async function reviewPhysicsReasoning(
  context: RagMultiAgentContext,
  generator: RagAgentGenerator,
): Promise<RagAgentReview> {
  return runJsonReviewer({
    agentName: 'PhysicsReasoningReviewer',
    generator,
    localIssues: deterministicPhysicsIssues(context),
    systemPrompt: [
      'You are STEMotion PhysicsReasoningReviewer for university mechanics.',
      'Task: check physical model, formula applicability, derivation steps, numerical results, units, and assumptions.',
      'For projectile motion, check velocity decomposition, maximum height, flight time/range, gravity direction, and unit consistency.',
      reviewerJsonInstruction(),
    ].join('\n'),
    userPrompt: [
      'Evidence pack:',
      buildEvidencePack(context),
      'Answer to review:',
      answerWithSections(context),
      'Return review JSON only.',
    ].join('\n\n'),
  });
}

function deterministicPhysicsIssues(context: RagMultiAgentContext): RagAgentIssue[] {
  const text = answerWithSections(context).replace(/\s+/g, ' ').toLowerCase();
  const isProjectile = context.visualizationHint?.type === 'projectile_motion'
    || /projectile|斜抛|抛体/.test(context.question);
  if (!isProjectile) return [];

  const issues: RagAgentIssue[] = [];
  if (!/(v_?\{?0y\}?|v0y|v_0\s*\\sin|v0\s*sin|sin\s*\\theta|sinθ|竖直分速度|速度分解)/i.test(text)) {
    issues.push({
      severity: 'warning',
      message: 'Projectile answer should explicitly decompose the initial velocity into vertical and horizontal components.',
      suggestion: 'Add v0x = v0 cos(theta) and v0y = v0 sin(theta).',
    });
  }
  if (!/(h|最大高度).{0,80}(2g|2\\?g|2\s*\*\s*g)/i.test(text)) {
    issues.push({
      severity: 'warning',
      message: 'Projectile answer appears to miss the maximum-height formula.',
      suggestion: 'Include H = v0y^2 / (2g) or an equivalent expression.',
    });
  }
  if (!/(r|射程|水平射程).{0,120}(sin\s*2|sin\\?\(?2|2\\theta|2θ|v_?\{?0x\}?|v0x)/i.test(text)) {
    issues.push({
      severity: 'warning',
      message: 'Projectile answer appears to miss the horizontal range derivation or formula.',
      suggestion: 'Include R = v0^2 sin(2theta) / g for equal-height landing or derive from v0x * T.',
    });
  }
  if (!/(m\/s|m\/s\^2|m\/s²|米每秒|单位|unit)/i.test(text)) {
    issues.push({
      severity: 'warning',
      message: 'Physics answer should include unit checks.',
      suggestion: 'State velocity, acceleration, height/range, and time units explicitly.',
    });
  }
  return issues;
}
