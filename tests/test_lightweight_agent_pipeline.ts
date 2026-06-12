import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinalQualityDecision,
  getMaxRepairRounds,
  resolveGenerationMode,
} from '../src/lib/generation/lightweightAgentPipeline';

test('resolveGenerationMode maps public quality modes to internal generation modes', () => {
  assert.equal(resolveGenerationMode(undefined), 'balanced');
  assert.equal(resolveGenerationMode(null), 'balanced');
  assert.equal(resolveGenerationMode('review'), 'balanced');
  assert.equal(resolveGenerationMode('unknown'), 'balanced');
  assert.equal(resolveGenerationMode('fast'), 'fast');
  assert.equal(resolveGenerationMode('highQuality'), 'highQuality');
});

test('getMaxRepairRounds caps repair loops by generation mode', () => {
  assert.equal(getMaxRepairRounds('fast'), 0);
  assert.equal(getMaxRepairRounds('balanced'), 1);
  assert.equal(getMaxRepairRounds('highQuality'), 2);
});

test('buildFinalQualityDecision publishes a passed answer without artifact', () => {
  const decision = buildFinalQualityDecision({
    outputForm: 'answer',
    answerQualityReport: { passed: true, score: 92, decision: 'accept', checks: [] },
  });

  assert.equal(decision.answerPassed, true);
  assert.equal(decision.artifactPassed, undefined);
  assert.equal(decision.overallPassed, true);
  assert.equal(decision.decision, 'publish');
  assert.deepEqual(decision.blockingReasons, []);
});

test('buildFinalQualityDecision does not let excellent artifact override rejected answer', () => {
  const decision = buildFinalQualityDecision({
    outputForm: 'answer_with_artifact',
    answerQualityReport: { passed: false, score: 45, decision: 'reject', checks: [] },
    artifactQualityReport: {
      passed: true,
      finalScore: 96,
      level: 'excellent',
      status: 'reviewed',
      issues: [],
    },
  });

  assert.equal(decision.answerPassed, false);
  assert.equal(decision.artifactPassed, true);
  assert.equal(decision.overallPassed, false);
  assert.notEqual(decision.decision, 'publish');
  assert.ok(decision.blockingReasons.includes('answer_quality_failed'));
});

test('buildFinalQualityDecision blocks high citation must-fix issues', () => {
  const decision = buildFinalQualityDecision({
    outputForm: 'answer',
    answerQualityReport: { passed: true, score: 90, decision: 'accept', checks: [] },
    lightweightReview: {
      status: 'revise',
      score: 80,
      mustFix: [{
        area: 'citation',
        severity: 'high',
        problem: '引用 [L9] 不存在',
        fix: '移除或替换为真实引用',
      }],
      niceToHave: [],
      finalDecision: 'revise_once',
    },
  });

  assert.equal(decision.overallPassed, false);
  assert.notEqual(decision.decision, 'publish');
  assert.ok(decision.blockingReasons.includes('citation_must_fix'));
});

test('buildFinalQualityDecision blocks artifact runtime and safety failures', () => {
  const runtimeDecision = buildFinalQualityDecision({
    outputForm: 'answer_with_artifact',
    answerQualityReport: { passed: true, score: 91, decision: 'accept', checks: [] },
    artifactQualityReport: {
      passed: false,
      finalScore: 82,
      issues: [{ category: 'runtime', severity: 'high', message: 'Runtime Evaluator failed' }],
    },
  });
  const safetyDecision = buildFinalQualityDecision({
    outputForm: 'artifact',
    artifactQualityReport: {
      passed: false,
      finalScore: 88,
      issues: [{ category: 'safety', severity: 'critical', message: 'unsafe API' }],
    },
  });

  assert.equal(runtimeDecision.answerPassed, true);
  assert.equal(runtimeDecision.artifactPassed, false);
  assert.equal(runtimeDecision.overallPassed, false);
  assert.ok(runtimeDecision.blockingReasons.includes('artifact_runtime_failed'));
  assert.equal(safetyDecision.artifactPassed, false);
  assert.equal(safetyDecision.overallPassed, false);
  assert.ok(safetyDecision.blockingReasons.includes('artifact_safety_failed'));
});

test('buildFinalQualityDecision is not optimistic when quality signals are missing', () => {
  const decision = buildFinalQualityDecision({ outputForm: 'answer_with_artifact' });

  assert.equal(decision.answerPassed, false);
  assert.equal(decision.artifactPassed, false);
  assert.equal(decision.overallPassed, false);
  assert.equal(decision.decision, 'revise_once');
  assert.ok(decision.blockingReasons.includes('insufficient_quality_signal'));
});
