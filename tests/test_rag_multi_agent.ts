import assert from 'node:assert/strict';
import test from 'node:test';
import type { LlmGenerateOptions } from '../src/lib/generation/llmClient';
import { runRagMultiAgentOrchestrator } from '../src/lib/rag/agents/rag_multi_agent_orchestrator';
import { reviseRagAnswer } from '../src/lib/rag/agents/revision_agent';
import { reviewCitationGrounding } from '../src/lib/rag/agents/reviewers/citation_grounding_reviewer';
import { reviewPhysicsReasoning } from '../src/lib/rag/agents/reviewers/physics_reasoning_reviewer';
import type { RagMultiAgentContext } from '../src/lib/rag/agents/types';
import type { AnswerSection, Citation, RagEvidencePack, RagQualityReport, RagRetrievalReport, RetrievedChunk } from '../src/lib/rag/types';

const citation: Citation = {
  source_type: 'local',
  source: 'projectile_motion.md',
  page: undefined,
  chunk_id: 'physics_mechanics_projectile_motion_001',
  subject: 'physics_mechanics',
  file_name: 'projectile_motion.md',
};

const sections: AnswerSection[] = [
  { id: 'extract', title: 'Problem', content: 'v0 = 20 m/s, theta = 30 deg' },
  { id: 'model', title: 'Model', content: 'Projectile motion without air resistance.' },
  { id: 'derivation', title: 'Derivation', content: 'Use \\[ H = \\frac{v_{0y}^2}{2g} \\] [L1]' },
  { id: 'result', title: 'Result', content: 'H = 5.10 m, R = 35.35 m.' },
  { id: 'pitfalls', title: 'Pitfalls', content: 'Check units.' },
  { id: 'citations', title: 'Citations', content: '[L1] projectile_motion.md' },
];

const chunk: RetrievedChunk = {
  content: 'Projectile motion uses v0x = v0 cos theta and v0y = v0 sin theta.',
  score: 0.92,
  metadata: {
    source: 'projectile_motion.md',
    subject: 'physics_mechanics',
    file_name: 'projectile_motion.md',
    chunk_id: 'physics_mechanics_projectile_motion_001',
    created_at: '2026-01-01T00:00:00.000Z',
  },
};

function baseReport(overrides: Partial<RagQualityReport> = {}): RagQualityReport {
  return {
    passed: true,
    score: 92,
    checks: [{ name: 'citation', passed: true, severity: 'info', message: 'ok' }],
    ...overrides,
  };
}

function baseRetrievalReport(): RagRetrievalReport {
  return {
    local_candidate_count: 1,
    local_reliable_count: 1,
    web_count: 0,
    top_local_score: 0.92,
    lexical_top_k: 8,
    embedding_top_k: 8,
    rerank_top_k: 4,
    evidence_threshold: 0.18,
    used_embedding: false,
    triggered_web_search: false,
    low_evidence: false,
    rewritten_queries: ['A ball is launched at 20 m/s and 30 degrees. Find maximum height and range.'],
    keywords: ['ball', 'launched', 'maximum', 'height', 'range'],
  };
}

function baseEvidencePack(): RagEvidencePack {
  return {
    subject: 'physics_mechanics',
    question: 'A ball is launched at 20 m/s and 30 degrees. Find maximum height and range.',
    task_type: 'step_solution',
    no_evidence: false,
    local_blocks: [{
      ref: '[L1]',
      source_type: 'local',
      source: 'projectile_motion.md',
      content: 'Projectile motion uses v0x = v0 cos theta and v0y = v0 sin theta.',
      score: 0.92,
      metadata: {},
    }],
    web_blocks: [],
    guidance: 'Local course evidence [Lx] is primary. Web evidence [Wx] is supplementary. Do not invent citations.',
  };
}

function baseContext(overrides: Partial<RagMultiAgentContext> = {}): RagMultiAgentContext {
  return {
    question: 'A ball is launched at 20 m/s and 30 degrees. Find maximum height and range.',
    subject: 'physics_mechanics',
    subjectDisplayName: '大学物理力学',
    taskType: 'step_solution',
    answer: 'Use \\(v_{0y}=v_0\\sin\\theta\\), then \\[ H = \\frac{v_{0y}^2}{2g} \\] [L1]',
    answerSections: sections,
    answerProtocol: 'json',
    formulaBlocks: [{ id: 'f1', latex: 'H = \\frac{v_{0y}^2}{2g}' }],
    finalResults: [{ label: 'H', value: '5.10', unit: 'm' }],
    citations: [citation],
    retrievedChunks: [chunk],
    visualizationHint: { type: 'projectile_motion', parameters: { v0: 20, angle_deg: 30, g: 9.8 } },
    retrievalReport: baseRetrievalReport(),
    evidencePack: baseEvidencePack(),
    deterministicReport: baseReport(),
    ...overrides,
  };
}

function jsonGenerator(
  state?: { calls: number },
  response: Record<string, unknown> = { score: 92, passed: true, summary: 'ok', issues: [] },
) {
  return async (_options?: LlmGenerateOptions) => {
    void _options;
    if (state) state.calls += 1;
    return JSON.stringify(response);
  };
}

test('multi-agent mode off returns only deterministic review', async () => {
  const state = { calls: 0 };
  const context = baseContext();
  const result = await runRagMultiAgentOrchestrator(context, {
    mode: 'off',
    reviewGenerator: jsonGenerator(state),
    revisionGenerator: jsonGenerator(),
    rebuildAnswerSections: () => sections,
    rerunDeterministicReview: () => baseReport(),
  });

  assert.equal(state.calls, 0);
  assert.equal(result.answer, context.answer);
  assert.equal(result.qualityReport.agent_reviews, undefined);
  assert.equal(result.qualityReport.decision, 'accept');
});

test('review mode calls reviewers and does not revise', async () => {
  const state = { calls: 0 };
  const result = await runRagMultiAgentOrchestrator(baseContext(), {
    mode: 'review',
    reviewGenerator: jsonGenerator(state),
    revisionGenerator: async () => {
      throw new Error('revision should not run');
    },
    rebuildAnswerSections: () => sections,
    rerunDeterministicReview: () => baseReport(),
  });

  assert.equal(state.calls, 6);
  assert.equal(result.qualityReport.agent_reviews?.length, 6);
  assert.equal(result.qualityReport.revision_trace, undefined);
});

test('review_and_revise executes one targeted revision when judge requests revise', async () => {
  const reviewState = { calls: 0 };
  const revisionState = { calls: 0 };
  const context = baseContext({
    deterministicReport: baseReport({
      passed: false,
      score: 64,
      checks: [{ name: 'formula', passed: false, severity: 'error', message: 'formula issue' }],
    }),
  });
  const result = await runRagMultiAgentOrchestrator(context, {
    mode: 'review_and_revise',
    reviewGenerator: jsonGenerator(reviewState),
    revisionGenerator: jsonGenerator(revisionState, {
      answer: 'Revised answer with \\(v_{0y}=v_0\\sin\\theta\\) and [L1].',
      changes: ['fixed formula formatting'],
    }),
    rebuildAnswerSections: (answer) => [{ id: 'derivation', title: 'Derivation', content: answer }],
    rerunDeterministicReview: () => baseReport({ score: 90 }),
  });

  assert.equal(reviewState.calls, 6);
  assert.equal(revisionState.calls, 1);
  assert.match(result.answer, /Revised answer/);
  assert.equal(result.qualityReport.revision_trace?.[0]?.applied, true);
});

test('high_quality mode can run a second revision round', async () => {
  const reviewState = { calls: 0 };
  const revisionState = { calls: 0 };
  let rerunCount = 0;
  const context = baseContext({
    deterministicReport: baseReport({
      passed: false,
      score: 60,
      checks: [{ name: 'formula', passed: false, severity: 'error', message: 'formula issue' }],
    }),
  });
  const result = await runRagMultiAgentOrchestrator(context, {
    mode: 'high_quality',
    reviewGenerator: jsonGenerator(reviewState),
    revisionGenerator: jsonGenerator(revisionState, {
      answer: 'Round 1 answer with \\(v_{0y}=v_0\\sin\\theta\\).',
      changes: ['round 1 fix'],
    }),
    rebuildAnswerSections: (answer) => [{ id: 'derivation', title: 'Derivation', content: answer }],
    rerunDeterministicReview: (answer) => {
      void answer;
      rerunCount += 1;
      return rerunCount === 1
        ? baseReport({
            passed: false,
            score: 68,
            checks: [{ name: 'formula', passed: false, severity: 'error', message: 'still needs polish' }],
          })
        : baseReport({ passed: true, score: 90 });
    },
  });

  assert.ok(reviewState.calls >= 6);
  assert.ok(revisionState.calls <= 2);
  assert.ok(result.qualityReport.revision_trace && result.qualityReport.revision_trace.length >= 1);
});

test('RevisionAgent rejects unavailable citation labels', async () => {
  const result = await reviseRagAnswer({
    context: baseContext(),
    reviews: [],
    reason: 'test',
    generator: jsonGenerator(undefined, { answer: 'Bad revised answer [L9].', changes: ['added bad citation'] }),
    round: 1,
  });

  assert.equal(result.trace.applied, false);
  assert.match(result.trace.reason, /L9/);
});

test('CitationGroundingReviewer detects fabricated citations', async () => {
  const review = await reviewCitationGrounding(
    baseContext({ answer: 'This answer cites a missing source [L9].' }),
    jsonGenerator(undefined, { score: 100, passed: true, summary: 'model pass', issues: [] }),
  );

  assert.equal(review.passed, false);
  assert.ok(review.issues.some((issue) => issue.severity === 'critical' && issue.message.includes('[L9]')));
});

test('PhysicsReasoningReviewer warns on missing projectile formula details', async () => {
  const review = await reviewPhysicsReasoning(
    baseContext({ answer: 'Projectile motion is solved by observing the curve.' }),
    jsonGenerator(undefined, { score: 100, passed: true, summary: 'model pass', issues: [] }),
  );

  assert.equal(review.passed, true);
  assert.ok(review.issues.some((issue) => issue.severity === 'warning'));
});
