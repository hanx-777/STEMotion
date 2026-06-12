import { createLogger } from '@/lib/logger';
import type { AgentEvaluation, AgentIssue, FeedbackIteration, JudgeDecision } from '../types';
import {
  buildDesignRepairInstruction,
  collectDesignQualityBlockers,
} from './designReviewRubric';

const log = createLogger('judge');

export function judgeEvaluations(evaluations: AgentEvaluation[], prevIteration?: FeedbackIteration): JudgeDecision {
  const allIssues = evaluations.flatMap((e) => e.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === 'critical');
  const highIssues = allIssues.filter((i) => i.severity === 'high');
  const blockingIssues = [...criticalIssues, ...highIssues];
  const designBlockingIssues = collectDesignQualityBlockers(allIssues);

  const avgScore = evaluations.length > 0
    ? Math.round(evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length)
    : 0;

  // Rule 1: Safety failed → repair html
  const safetyEval = evaluations.find((e) => e.agentName === 'Safety Evaluator');
  if (safetyEval && !safetyEval.passed) {
    const decision: JudgeDecision = {
      type: 'repair',
      finalScore: avgScore,
      blockingIssues,
      repairInstruction: 'HTML 存在安全违规，必须修复。',
      target: 'html',
      reason: `安全校验未通过（${safetyEval.score}/100），发现 ${criticalIssues.length} 个关键问题。`,
    };
    log.info('Judge: safety failed', { score: avgScore, critical: criticalIssues.length });
    return decision;
  }

  // Rule 2: Runtime failed → repair html
  const runtimeEval = evaluations.find((e) => e.agentName === 'Runtime Evaluator');
  if (runtimeEval && !runtimeEval.passed) {
    const decision: JudgeDecision = {
      type: 'repair',
      finalScore: avgScore,
      blockingIssues,
      repairInstruction: '运行时检查未通过，需要修复 HTML 结构。',
      target: 'html',
      reason: `运行时评估未通过（${runtimeEval.score}/100）。`,
    };
    log.info('Judge: runtime failed', { score: avgScore });
    return decision;
  }

  // Rule 2b: Active interaction failed -> repair html before any stagnation accept
  const activeInteractionEval = evaluations.find((e) => e.agentName === 'Active Interaction Evaluator');
  if (activeInteractionEval && !activeInteractionEval.passed) {
    const decision: JudgeDecision = {
      type: 'repair',
      finalScore: avgScore,
      blockingIssues,
      repairInstruction: '主动交互验收未通过：必须修复 start/reset/slider 的真实状态机和可见反馈。',
      target: 'html',
      reason: `主动交互评估未通过（${activeInteractionEval.score}/100）。`,
    };
    log.info('Judge: active interaction failed', { score: avgScore });
    return decision;
  }

  // Rule 3: Serious design-quality blockers → repair html
  if (designBlockingIssues.length > 0) {
    const decision: JudgeDecision = {
      type: 'repair',
      finalScore: avgScore,
      blockingIssues: designBlockingIssues,
      repairInstruction: buildDesignRepairInstruction(designBlockingIssues),
      target: 'html',
      reason: `发现 ${designBlockingIssues.length} 个会影响首屏、主舞台、响应式、滚动或交互可用性的设计质量阻断问题。`,
    };
    log.info('Judge: design-quality blockers', { score: avgScore, designBlockers: designBlockingIssues.length });
    return decision;
  }

  // Rule 4: Critical issues → repair
  if (criticalIssues.length > 0) {
    const target = detectRepairTarget(criticalIssues, evaluations);
    const decision: JudgeDecision = {
      type: 'repair',
      finalScore: avgScore,
      blockingIssues,
      repairInstruction: `存在 ${criticalIssues.length} 个关键问题需要修复。`,
      target,
      reason: `发现 ${criticalIssues.length} 个关键问题。`,
    };
    log.info('Judge: critical issues', { score: avgScore, target });
    return decision;
  }

  // Rule 5: Check improvement stagnation
  if (prevIteration) {
    const prevScore = prevIteration.scoreAfter ?? 0;
    const improvement = avgScore - prevScore;
    if (improvement < 5 && prevScore > 0) {
      const decision: JudgeDecision = {
        type: 'accept',
        finalScore: avgScore,
        blockingIssues: [],
        reason: `连续轮次提升不足 5 分（${prevScore} → ${avgScore}），停止迭代。`,
      };
      log.info('Judge: stagnation, accepting', { prevScore, currentScore: avgScore, improvement });
      return decision;
    }
  }

  const pedagogyEval = evaluations.find((e) => e.agentName === 'Pedagogy Evaluator');
  const uxEval = evaluations.find((e) => e.agentName === 'UX Evaluator');

  // Rule 6: Low UX score means design quality needs HTML repair even if the average is high
  if (uxEval && uxEval.score < 75) {
    const decision: JudgeDecision = {
      type: 'repair',
      finalScore: avgScore,
      blockingIssues,
      repairInstruction: buildDesignRepairInstruction(
        uxEval.issues,
        'UX score is below 75; repair the HTML for first-screen usability, main-stage priority, responsive behavior, scroll discipline, visual hierarchy, control density, hit targets, interaction feedback, and anti-filler quality.',
      ),
      target: 'html',
      reason: `UX 评分 ${uxEval.score}/100，设计质量低于通过阈值。`,
    };
    log.info('Judge: low UX score', { score: avgScore, uxScore: uxEval.score });
    return decision;
  }

  // Rule 7: Score >= 85 and no high/critical → accept
  if (avgScore >= 85 && highIssues.length === 0) {
    const decision: JudgeDecision = {
      type: 'accept',
      finalScore: avgScore,
      blockingIssues: [],
      reason: `综合评分 ${avgScore}/100，无高风险问题，通过评审。`,
    };
    log.info('Judge: accepted', { score: avgScore });
    return decision;
  }

  // Rule 8: Determine repair target
  let target: JudgeDecision['target'] = 'html';
  let instruction = '';

  if (pedagogyEval && pedagogyEval.score < 70) {
    target = 'teacherActions';
    instruction = '教学评估分数较低，需要改进教师讲解和学生任务设计。';
  } else if (uxEval && uxEval.score < 75) {
    target = 'html';
    instruction = buildDesignRepairInstruction(
      uxEval.issues,
      'UX score is below 75; repair the HTML for first-screen usability, main-stage priority, responsive behavior, scroll discipline, visual hierarchy, control density, hit targets, interaction feedback, and anti-filler quality.',
    );
  } else if (highIssues.length > 0) {
    target = detectRepairTarget(highIssues, evaluations);
    instruction = `存在 ${highIssues.length} 个高风险问题需要修复。`;
  } else {
    instruction = '综合评分未达标，需要全面改进。';
  }

  const decision: JudgeDecision = {
    type: 'repair',
    finalScore: avgScore,
    blockingIssues,
    repairInstruction: instruction,
    target,
    reason: `综合评分 ${avgScore}/100，未达到通过标准（85 分）。`,
  };
  log.info('Judge: repair needed', { score: avgScore, target, highIssues: highIssues.length });
  return decision;
}

function detectRepairTarget(issues: AgentIssue[], evaluations: AgentEvaluation[]): JudgeDecision['target'] {
  const categories = new Set(issues.map((i) => i.category));
  if (categories.has('safety')) return 'html';
  if (categories.has('runtime')) return 'html';
  if (categories.has('pedagogy') || categories.has('curriculum')) return 'teacherActions';
  if (categories.has('ux') || categories.has('accessibility')) return 'html';
  if (categories.has('schema')) return 'schema';

  // Check which evaluator has the most issues
  const evalIssueCounts = evaluations.map((e) => ({ name: e.agentName, count: e.issues.length }));
  const worst = evalIssueCounts.sort((a, b) => b.count - a.count)[0];
  if (worst?.name === 'Pedagogy Evaluator') return 'teacherActions';
  return 'html';
}
