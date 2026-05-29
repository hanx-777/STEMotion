import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewFinalPresentation } from '../src/lib/rag/presentation_review';
import type { Citation } from '../src/lib/rag/types';

const localCitation: Citation = {
  source_type: 'local',
  source: 'projectile_motion.md',
  page: undefined,
  chunk_id: 'physics_mechanics_projectile_motion_001',
  subject: 'physics_mechanics',
  file_name: 'projectile_motion.md',
};

test('presentation reviewer accepts renderable formulas and resolved citation chips', () => {
  const review = reviewFinalPresentation({
    answer: '使用 \\(v_{0y}=v_0\\sin\\theta\\) 分解速度 [L1]。',
    answerSections: [
      {
        id: 'derivation',
        title: '分步推导',
        content: '公式为：\n\\[\nH = \\frac{v_{0y}^2}{2g}\n\\]\n引用 [L1]。',
      },
    ],
    formulaBlocks: [{ id: 'height', latex: 'H = \\frac{v_{0y}^2}{2g}' }],
    citations: [localCitation],
  });

  assert.equal(review.check.passed, true);
  assert.equal(review.agentReview.agent_name, 'PresentationReviewer');
  assert.equal(review.agentReview.passed, true);
});

test('presentation reviewer catches raw LaTeX and unresolved citation markers', () => {
  const review = reviewFinalPresentation({
    answer: '最大高度公式裸露为 \\frac{v_0^2}{2g}，并错误引用 [L9]。',
    answerSections: [
      { id: 'result', title: '结果', content: '这里还有未闭合的 **重点说明。' },
    ],
    citations: [localCitation],
  });

  assert.equal(review.check.name, '最终呈现质量');
  assert.equal(review.check.passed, false);
  assert.equal(review.check.severity, 'error');
  assert.ok(review.agentReview.issues.some((issue) => issue.message.includes('裸露 LaTeX')));
  assert.ok(review.agentReview.issues.some((issue) => issue.message.includes('[L9]')));
  assert.ok(review.agentReview.issues.some((issue) => issue.message.includes('Markdown')));
});

test('presentation reviewer requires no-evidence notice when citations are empty', () => {
  const review = reviewFinalPresentation({
    answer: '这是一个通用知识回答。',
    answerSections: [{ id: 'concept', title: '概念解释', content: '没有提供依据。' }],
    citations: [],
    noEvidenceRequired: true,
  });

  assert.equal(review.check.passed, false);
  assert.ok(review.agentReview.issues.some((issue) => issue.message.includes('未找到可靠依据')));
});
