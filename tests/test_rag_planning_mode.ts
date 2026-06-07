import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRagPlanningDraft,
  composeRagQuestionWithPlanningAnswers,
} from '../src/features/rag/state/ragPlanningMode';

test('RAG planning draft asks clarifying questions before an ambiguous projectile task', () => {
  const draft = buildRagPlanningDraft({
    question: '斜抛运动怎么做？',
    subject: 'physics_mechanics',
    subjectDisplayName: '大学物理力学',
    taskType: 'step_solution',
    taskLabel: '分步解题',
    mode: 'student',
    useWebSearch: true,
    fastMode: false,
    visualizationMode: 'auto',
  });

  assert.equal(draft.requiresConfirmation, true);
  assert.match(draft.title, /规划/);
  assert.ok(draft.steps.some((step) => /检索/.test(step)));
  assert.ok(draft.questions.some((question) => question.id === 'projectile_v0'));
  assert.ok(draft.questions.some((question) => question.id === 'projectile_angle'));
});

test('RAG planning draft can be confirmed without extra questions for a specific task', () => {
  const draft = buildRagPlanningDraft({
    question: '一个小球以 20 m/s 初速度、30 度角斜向上抛出，忽略空气阻力，求最大高度和水平射程。',
    subject: 'physics_mechanics',
    subjectDisplayName: '大学物理力学',
    taskType: 'step_solution',
    taskLabel: '分步解题',
    mode: 'student',
    useWebSearch: false,
    fastMode: true,
    visualizationMode: 'manual',
  });

  assert.equal(draft.requiresConfirmation, true);
  assert.deepEqual(draft.questions, []);
  assert.ok(draft.steps.some((step) => /手动确认/.test(step)));
});

test('RAG planning answers are appended as structured context for the confirmed ask', () => {
  const draft = buildRagPlanningDraft({
    question: '请设计斜抛课堂演示',
    subject: 'physics_mechanics',
    subjectDisplayName: '大学物理力学',
    taskType: 'teacher_prep',
    taskLabel: '课堂备课',
    mode: 'teacher',
    useWebSearch: true,
    fastMode: false,
    visualizationMode: 'auto',
  });

  const composed = composeRagQuestionWithPlanningAnswers('请设计斜抛课堂演示', draft, {
    teaching_context: '面向大一学生，10 分钟课堂演示',
    projectile_v0: '8 m/s',
    projectile_angle: '35 度',
  });

  assert.match(composed, /规划模式补充信息/);
  assert.match(composed, /面向大一学生/);
  assert.match(composed, /8 m\/s/);
  assert.match(composed, /35 度/);
});
