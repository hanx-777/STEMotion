import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeRagQuality } from '../src/features/rag/lib/agents/judge_agent';
import type { RagQualityReport } from '../src/features/rag/lib/types';

function report(overrides: Partial<RagQualityReport>): RagQualityReport {
  return {
    passed: true,
    score: 95,
    checks: [],
    ...overrides,
  };
}

test('JudgeAgent accepts high-score reports without warnings', () => {
  const result = judgeRagQuality(report({ score: 92 }));
  assert.equal(result.decision, 'accept');
  assert.equal(result.passed, true);
});

test('JudgeAgent accepts with warnings when quality is usable', () => {
  const result = judgeRagQuality(report({
    score: 82,
    checks: [{ name: 'structure', passed: false, severity: 'warning', message: 'missing optional detail' }],
  }));
  assert.equal(result.decision, 'accept_with_warnings');
  assert.equal(result.passed, true);
});

test('JudgeAgent requests revision for fixable errors', () => {
  const result = judgeRagQuality(report({
    score: 66,
    passed: false,
    checks: [
      { name: 'citation', passed: true, severity: 'info', message: 'citation refs are valid' },
      { name: 'formula', passed: false, severity: 'error', message: 'formula render failed' },
    ],
  }));
  assert.equal(result.decision, 'revise');
  assert.equal(result.passed, false);
});

test('JudgeAgent rejects fabricated citation issues', () => {
  const result = judgeRagQuality(report({
    score: 58,
    passed: false,
    checks: [{ name: 'citation', passed: false, severity: 'error', message: 'fabricated citation [L9]' }],
  }));
  assert.equal(result.decision, 'reject');
  assert.equal(result.passed, false);
});
