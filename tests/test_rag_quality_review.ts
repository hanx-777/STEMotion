import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewRagAnswer } from '../src/features/rag/lib/quality_review';
import type { AnswerSection, Citation } from '../src/features/rag/lib/types';

const stepSections: AnswerSection[] = [
  { id: 'extract', title: '题目信息提取', content: '已知 v0 = 20 m/s，θ = 30°。' },
  { id: 'model', title: '物理模型判断', content: '斜抛运动，忽略空气阻力。' },
  { id: 'derivation', title: '分步推导', content: '先将 v0 分解为水平和竖直方向，使用 v0 sinθ。' },
  { id: 'result', title: '结果', content: 'H = 5.10 m，R = 35.35 m。' },
  { id: 'pitfalls', title: '易错点', content: '注意单位。' },
  { id: 'citations', title: '引用来源', content: '[1] projectile_motion.md' },
];

const localCitation: Citation = {
  source_type: 'local',
  source: 'projectile_motion.md',
  page: undefined,
  chunk_id: 'physics_mechanics_projectile_motion_001',
  subject: 'physics_mechanics',
  file_name: 'projectile_motion.md',
};

test('RAG quality review detects missing citation references', () => {
  const report = reviewRagAnswer({
    question: '斜抛运动最大高度公式是什么？',
    taskType: 'step_solution',
    answer: '根据 [L9] 可知需要分解速度。',
    answerSections: stepSections,
    citations: [localCitation],
    visualizationHint: { type: 'projectile_motion', parameters: { v0: 20, angle_deg: 30, g: 9.8 } },
  });

  assert.equal(report.passed, false);
  assert.ok(report.checks.some((check) => check.name === '引用一致性' && check.severity === 'error'));
});

test('RAG quality review accepts no-source answers with a clear no-evidence notice', () => {
  const report = reviewRagAnswer({
    question: '超出知识库的问题',
    taskType: 'knowledge_qa',
    answer: '当前知识库和网络检索中未找到可靠依据。以下为模型通用知识推理，仅供学习参考。',
    answerSections: [
      { id: 'concept', title: '核心概念', content: '当前知识库和网络检索中未找到可靠依据。' },
      { id: 'evidence', title: '关键依据', content: '无 citation。' },
      { id: 'study_hint', title: '学习建议', content: '建议补充课程资料。' },
      { id: 'citations', title: '引用来源', content: '当前知识库和网络检索中未找到可靠依据。' },
    ],
    citations: [],
  });

  assert.equal(report.checks.find((check) => check.name === '依据不足提示')?.passed, true);
  assert.equal(report.passed, true);
});

test('RAG quality review warns when task sections are incomplete', () => {
  const report = reviewRagAnswer({
    question: '斜抛运动最大高度公式是什么？',
    taskType: 'step_solution',
    answer: '先分解速度。',
    answerSections: [{ id: 'derivation', title: '分步推导', content: '先分解速度。' }],
    citations: [],
  });

  assert.ok(report.checks.some((check) => check.name === '结构完整性' && check.severity === 'warning'));
});

test('RAG quality review detects malformed formulas', () => {
  const report = reviewRagAnswer({
    question: '斜抛运动最大高度公式是什么？',
    taskType: 'step_solution',
    answer: '最大高度公式：\\[ H = \\frac{v_0^2}{ \\]',
    answerSections: stepSections,
    citations: [localCitation],
    visualizationHint: { type: 'projectile_motion', parameters: { v0: 20, angle_deg: 30, g: 9.8 } },
  });

  assert.ok(report.checks.some((check) => check.name === '公式渲染性' && check.severity === 'error'));
});

test('RAG quality review warns when projectile formulas are missing', () => {
  const report = reviewRagAnswer({
    question: '斜抛运动最大高度和射程怎么求？',
    taskType: 'step_solution',
    answer: '先观察运动，再得到结果。',
    answerSections: [
      { id: 'extract', title: '题目信息提取', content: '已知初速度和角度。' },
      { id: 'model', title: '物理模型判断', content: '斜抛运动。' },
      { id: 'derivation', title: '分步推导', content: '先观察运动，再得到结果。' },
      { id: 'result', title: '结果', content: '得到最大高度和射程。' },
      { id: 'pitfalls', title: '易错点', content: '注意单位。' },
      { id: 'citations', title: '引用来源', content: '[1] projectile_motion.md' },
    ],
    citations: [localCitation],
    visualizationHint: { type: 'projectile_motion', parameters: { v0: 20, angle_deg: 30, g: 9.8 } },
  });

  assert.ok(report.checks.some((check) => check.name === '公式渲染性' && check.severity === 'warning'));
});
