import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearRagSessionRecords,
  deleteRagSessionRecord,
  MAX_RAG_SESSIONS,
  renameRagSessionRecord,
  upsertRagSessionRecord,
  type RagSessionRecord,
  type RagSessionSnapshot,
} from '../src/features/rag/state/ragSessionStore';
import type { RagAskResult } from '../src/lib/rag/types';

const result: RagAskResult = {
  subject: 'physics_mechanics',
  subject_display_name: '大学物理力学',
  task_type: 'step_solution',
  answer: '使用 \\(v_{0y}=v_0\\sin\\theta\\) 求解。',
  answer_sections: [{ id: 'derivation', title: '分步推导', content: '先分解速度。' }],
  citations: [],
  retrieved_chunks: [],
  source_summary: { local_count: 0, web_count: 0 },
};

function snapshot(id: string, question = `第 ${id} 个问题`): RagSessionSnapshot {
  return {
    id,
    question,
    subject: 'physics_mechanics',
    taskType: 'step_solution',
    useWebSearch: true,
    result,
    now: `2026-05-28T00:00:${id.padStart(2, '0')}Z`,
  };
}

test('RAG session records are upserted with newest session first', () => {
  let sessions: RagSessionRecord[] = [];
  sessions = upsertRagSessionRecord(sessions, snapshot('01', '斜抛运动最大高度如何计算？'));
  sessions = upsertRagSessionRecord(sessions, snapshot('02', '为什么匀速圆周运动仍有加速度？'));
  sessions = upsertRagSessionRecord(sessions, snapshot('01', '更新后的斜抛问题'));

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, '01');
  assert.equal(sessions[0].title, '更新后的斜抛问题');
  assert.equal(sessions[1].id, '02');
});

test('RAG session records are capped to local storage budget', () => {
  let sessions: RagSessionRecord[] = [];
  for (let index = 0; index < MAX_RAG_SESSIONS + 1; index += 1) {
    sessions = upsertRagSessionRecord(sessions, snapshot(String(index).padStart(2, '0')));
  }

  assert.equal(sessions.length, MAX_RAG_SESSIONS);
  assert.equal(sessions[0].id, String(MAX_RAG_SESSIONS).padStart(2, '0'));
  assert.equal(sessions.at(-1)?.id, '01');
});

test('RAG session records can be renamed, deleted, and cleared', () => {
  let sessions: RagSessionRecord[] = [];
  sessions = upsertRagSessionRecord(sessions, snapshot('01'));
  sessions = upsertRagSessionRecord(sessions, snapshot('02'));
  sessions = renameRagSessionRecord(sessions, '01', '课堂演示问题', '2026-05-28T00:01:00Z');

  assert.equal(sessions.find((item) => item.id === '01')?.title, '课堂演示问题');

  sessions = deleteRagSessionRecord(sessions, '02');
  assert.deepEqual(sessions.map((item) => item.id), ['01']);

  assert.deepEqual(clearRagSessionRecords(), []);
});
