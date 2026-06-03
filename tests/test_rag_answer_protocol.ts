import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJsonAnswerInstruction, parseRagAnswerDraft } from '../src/lib/rag/answer_protocol';

test('RagAnswerEnvelope JSON is parsed into structured sections and formulas', () => {
  const raw = JSON.stringify({
    sections: [
      { id: 'extract', title: '题目信息提取', content: '已知 v0 = 20 m/s。' },
      { id: 'derivation', title: '分步推导', content: '使用 [L1]。' },
    ],
    formula_blocks: [
      { id: 'height', label: '最大高度', latex: 'H = \\frac{v_{0y}^2}{2g}', citation_refs: ['[L1]'] },
    ],
    final_results: [
      { label: '最大高度', value: '5.10', unit: 'm', citation_refs: ['[L1]'] },
    ],
    disclaimer: 'AI 生成内容，仅供学习参考，请结合课程教材与教师要求核验。',
  });

  const parsed = parseRagAnswerDraft({ raw, taskType: 'step_solution' });
  assert.equal(parsed.protocol, 'json');
  assert.ok(parsed.sections.some((section) => section.id === 'derivation'));
  assert.equal(parsed.formulaBlocks[0].latex, 'H = \\frac{v_{0y}^2}{2g}');
  assert.equal(parsed.finalResults[0].value, '5.10');
});

test('RagAnswerEnvelope parser falls back to markdown when JSON is invalid', () => {
  const parsed = parseRagAnswerDraft({
    raw: '### 分步推导\n使用速度分解。',
    taskType: 'step_solution',
  });

  assert.equal(parsed.protocol, 'markdown_fallback');
  assert.ok(parsed.sections.some((section) => section.id === 'derivation'));
  assert.ok(parsed.answer.includes('分步推导'));
  assert.ok(parsed.parseWarning);
});

test('JSON answer instruction asks for typed sections and formula blocks', () => {
  const instruction = buildJsonAnswerInstruction('step_solution');
  assert.ok(instruction.includes('"sections"'));
  assert.ok(instruction.includes('"formula_blocks"'));
  assert.ok(instruction.includes('[Lx]'));
});
