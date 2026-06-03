import assert from 'node:assert/strict';
import test from 'node:test';
import { toLegacyRagInput, toLegacyRagResult, toRagV1Response } from '../src/features/rag/contracts';
import type { RagAskResult } from '../src/lib/rag/types';

test('RAG v1 request maps to the legacy pipeline input without losing compatibility fields', () => {
  const legacy = toLegacyRagInput({
    question: '斜抛运动最大高度怎么算？',
    subjectId: 'physics_mechanics',
    taskType: 'step_solution',
    retrieval: { useWebSearch: true },
    quality: { mode: 'highQuality' },
  });

  assert.deepEqual(legacy, {
    question: '斜抛运动最大高度怎么算？',
    subject: 'physics_mechanics',
    task_type: 'step_solution',
    use_web_search: true,
  });
});

test('RAG v1 response groups answer, evidence, retrieval and quality fields', () => {
  const legacy: RagAskResult = {
    subject: 'physics_mechanics',
    subject_display_name: '大学物理力学',
    task_type: 'step_solution',
    answer_protocol: 'json',
    answer: '结构化回答',
    answer_sections: [{ id: 'model', title: '物理模型判断', content: '斜抛运动 [L1]' }],
    formula_blocks: [{ id: 'h', label: '最大高度', latex: 'H=\\frac{v_0^2\\sin^2\\theta}{2g}' }],
    final_results: [{ label: '最大高度', value: '5.10', unit: 'm' }],
    citations: [{
      source_type: 'local',
      source: 'projectile_motion.md',
      chunk_id: 'physics_mechanics_projectile_motion_md_001',
      subject: 'physics_mechanics',
      file_name: 'projectile_motion.md',
    }],
    retrieved_chunks: [{
      content: '斜抛运动资料',
      score: 0.8,
      metadata: {
        source: 'projectile_motion.md',
        subject: 'physics_mechanics',
        file_name: 'projectile_motion.md',
        chunk_id: 'physics_mechanics_projectile_motion_md_001',
        created_at: '2026-05-28T00:00:00.000Z',
        source_type: 'local',
      },
    }],
    source_summary: { local_count: 1, web_count: 0 },
    retrieval_report: {
      local_candidate_count: 1,
      local_reliable_count: 1,
      web_count: 0,
      top_local_score: 0.8,
      lexical_top_k: 8,
      embedding_top_k: 0,
      rerank_top_k: 4,
      evidence_threshold: 0.18,
      used_embedding: false,
      triggered_web_search: false,
      low_evidence: false,
      rewritten_queries: ['斜抛运动最大高度怎么算？'],
      keywords: ['斜抛', '最大高度'],
    },
    evidence_pack: {
      subject: 'physics_mechanics',
      question: '斜抛运动最大高度怎么算？',
      task_type: 'step_solution',
      no_evidence: false,
      local_blocks: [{ ref: 'L1', source_type: 'local', source: 'projectile_motion.md', content: '斜抛运动资料', score: 0.8 }],
      web_blocks: [],
      guidance: 'Use local evidence first.',
    },
    quality_report: {
      passed: true,
      score: 92,
      checks: [],
      decision: 'accept',
    },
  };

  const v1 = toRagV1Response(legacy);
  assert.equal(v1.subject.id, 'physics_mechanics');
  assert.equal(v1.answer.protocol, 'json');
  assert.equal(v1.answer.sections[0].title, '物理模型判断');
  assert.equal(v1.answer.formulas[0].id, 'h');
  assert.equal(v1.evidence.pack?.local_blocks[0].ref, 'L1');
  assert.equal(v1.retrievalReport?.localReliableCount, 1);
  assert.equal(v1.qualityReport?.decision, 'accept');

  const roundTrip = toLegacyRagResult(v1);
  assert.equal(roundTrip.subject, legacy.subject);
  assert.equal(roundTrip.answer_sections?.[0].content, '斜抛运动 [L1]');
  assert.equal(roundTrip.retrieval_report?.local_reliable_count, 1);
});
