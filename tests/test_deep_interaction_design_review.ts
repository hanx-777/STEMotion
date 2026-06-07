import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDesignRepairInstruction,
  collectDesignQualityBlockers,
  DESIGN_REVIEW_RUBRIC_MARKER,
  RAG_ANSWER_QUALITY_REVIEW_BOUNDARY,
} from '../src/lib/deep-interaction/agents/designReviewRubric';
import { judgeEvaluations } from '../src/lib/deep-interaction/agents/judgeAgent';
import type { AgentEvaluation, AgentIssue } from '../src/lib/deep-interaction/types';

function evaluation(
  agentName: string,
  score: number,
  passed: boolean,
  issues: AgentIssue[] = [],
): AgentEvaluation {
  return {
    agentName,
    score,
    passed,
    summary: `${agentName} result`,
    issues,
  };
}

test('design rubric classifies serious UI layout issues as blockers', () => {
  const issue: AgentIssue = {
    id: 'ux_stage_ratio',
    severity: 'high',
    category: 'ux',
    message: 'At 1366x768 the first-screen hides the main stage because the right sidebar consumes 52% width.',
    evidence: '#side-panel width: 52%; #visualization height: 220px',
    suggestion: 'Change the desktop grid to 72/28, collapse long notes into details, and keep #visualization visible above the fold.',
    target: 'html',
  };

  const blockers = collectDesignQualityBlockers([issue]);
  const instruction = buildDesignRepairInstruction(blockers);

  assert.deepEqual(blockers, [issue]);
  assert.match(instruction, new RegExp(DESIGN_REVIEW_RUBRIC_MARKER));
  assert.match(instruction, /first-screen|first screen/i);
  assert.match(instruction, /65%-75%/);
  assert.match(instruction, /nested scrolling/i);
  assert.match(instruction, /44px/);
  assert.match(instruction, /target=html/);
  assert.match(instruction, /#side-panel/);
  assert.match(instruction, /72\/28/);
});

test('judge repairs high-risk design blockers before accepting stagnated iterations', () => {
  const designIssue: AgentIssue = {
    id: 'ux_first_screen',
    severity: 'high',
    category: 'ux',
    message: 'First-screen usability fails: the main-stage is too small and nested scroll hides controls on mobile.',
    evidence: '#visualization is 38% width; two nested overflow containers; controls below fold at 1440x900.',
    suggestion: 'Use a 72/28 grid, remove the inner scroll container, move long explanation into details, and keep controls at 44px.',
    target: 'html',
  };

  const decision = judgeEvaluations(
    [
      evaluation('Pedagogy Evaluator', 92, true),
      evaluation('UX Evaluator', 88, false, [designIssue]),
      evaluation('Safety Evaluator', 95, true),
      evaluation('Runtime Evaluator', 95, true),
    ],
    {
      iteration: 1,
      evaluations: [],
      judgeDecision: {
        type: 'repair',
        finalScore: 87,
        blockingIssues: [],
        reason: 'previous repair',
      },
      scoreAfter: 87,
      createdAt: '2026-06-07T00:00:00.000Z',
    },
  );

  assert.equal(decision.type, 'repair');
  assert.equal(decision.target, 'html');
  assert.deepEqual(decision.blockingIssues, [designIssue]);
  assert.match(decision.reason, /设计质量阻断问题/);
  assert.match(decision.repairInstruction ?? '', /first-screen|first screen/i);
  assert.match(decision.repairInstruction ?? '', /main-stage|65%-75%/i);
  assert.match(decision.repairInstruction ?? '', /nested scrolling/i);
  assert.match(decision.repairInstruction ?? '', /44px/);
  assert.match(decision.repairInstruction ?? '', /#visualization/);
  assert.match(decision.repairInstruction ?? '', /72\/28/);
});

test('judge gives low UX scores a concrete design repair instruction even without model issues', () => {
  const decision = judgeEvaluations([
    evaluation('Pedagogy Evaluator', 86, true),
    evaluation('UX Evaluator', 62, false),
    evaluation('Safety Evaluator', 95, true),
    evaluation('Runtime Evaluator', 95, true),
  ]);

  assert.equal(decision.type, 'repair');
  assert.equal(decision.target, 'html');
  assert.match(decision.repairInstruction ?? '', /Design-quality repair is required/);
  assert.match(decision.repairInstruction ?? '', /first-screen|first screen/i);
  assert.match(decision.repairInstruction ?? '', /responsive\/mobile/i);
  assert.match(decision.repairInstruction ?? '', /anti-filler/i);
});

test('RAG answer quality boundary stays separate from artifact UI review', () => {
  assert.match(RAG_ANSWER_QUALITY_REVIEW_BOUNDARY, /evidence/);
  assert.match(RAG_ANSWER_QUALITY_REVIEW_BOUNDARY, /citation/);
  assert.match(RAG_ANSWER_QUALITY_REVIEW_BOUNDARY, /artifact UI reviewers/);
  assert.match(RAG_ANSWER_QUALITY_REVIEW_BOUNDARY, /visual, interaction, and layout quality/);
});
