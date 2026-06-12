import assert from 'node:assert/strict';
import test from 'node:test';
import type { InteractionArtifact } from '../src/features/deep-interaction/lib/types';
import {
  MAX_ARTIFACTS_PER_SESSION,
  MAX_INTERACTION_SESSIONS,
  MAX_TOTAL_ARTIFACTS,
  persistWithSingleRetry,
  repairInteractionPersistence,
  trimArtifactsByCapacity,
} from '../src/lib/stores/interactionPersistence';

function makeArtifact(sessionId: string, index: number, nowBase = Date.now()): InteractionArtifact {
  const updatedAt = new Date(nowBase + index * 1000).toISOString();
  return {
    id: `artifact_${sessionId}_${index}`,
    sessionId,
    type: 'rag_visualization',
    title: `artifact-${index}`,
    description: 'test',
    schema: {
      type: 'rag_visualization',
      title: `artifact-${index}`,
      description: 'test',
      learningGoals: ['goal'],
      explanationSteps: [{ id: 'step_1', title: 'step', narration: 'n' }],
      visualizationSpec: {
        type: 'algorithm_trace',
        title: 'trace',
        description: 'trace',
        algorithmName: 'mono_stack',
        dataStructure: 'stack',
        inputExample: '[2,1,2,4,3]',
        steps: [
          { stepIndex: 1, operation: 'init', state: { stack: [] }, explanation: 'init' },
          { stepIndex: 2, operation: 'push', state: { stack: [2] }, explanation: 'push' },
        ],
      },
      ragMetadata: {
        source: 'student',
        subject: 'computer_science',
        originalQuestion: 'q',
        taskType: 'step_solution',
      },
    },
    status: 'ready',
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

test('repairs artifact-only persistence data into openable sessions', () => {
  const artifact = makeArtifact('session_artifact_only', 1);
  const repaired = repairInteractionPersistence({
    sessions: [],
    currentSessionId: null,
    artifactsBySession: {
      [artifact.sessionId]: [artifact],
    },
  });

  assert.equal(repaired.sessions.length, 1);
  assert.equal(repaired.sessions[0].id, artifact.sessionId);
  assert.equal(repaired.sessions[0].currentArtifactId, artifact.id);
  assert.equal(repaired.currentSessionId, artifact.sessionId);
});

test('artifact capacity trimming keeps newest while enforcing limits', () => {
  const nowBase = Date.parse('2026-05-31T00:00:00.000Z');
  const artifactsBySession: Record<string, InteractionArtifact[]> = {};

  for (let session = 0; session < 30; session += 1) {
    const sessionId = `session_${session}`;
    artifactsBySession[sessionId] = [];
    for (let i = 0; i < 8; i += 1) {
      artifactsBySession[sessionId].push(makeArtifact(sessionId, session * 10 + i, nowBase));
    }
  }

  const trimmed = trimArtifactsByCapacity(artifactsBySession);
  const flattened = Object.values(trimmed).flat();

  assert.equal(flattened.length <= MAX_TOTAL_ARTIFACTS, true);
  for (const artifacts of Object.values(trimmed)) {
    assert.equal(artifacts.length <= MAX_ARTIFACTS_PER_SESSION, true);
  }
  assert.equal(Object.keys(trimmed).length <= MAX_INTERACTION_SESSIONS, true);
});

test('persistWithSingleRetry triggers retry path when first verification fails', () => {
  let verifyCount = 0;
  let retried = false;

  const result = persistWithSingleRetry({
    commit: () => {
      // noop
    },
    verify: () => {
      verifyCount += 1;
      return verifyCount >= 2;
    },
    repairAndRetry: () => {
      retried = true;
    },
  });

  assert.equal(retried, true);
  assert.equal(result, 'saved_after_retry');
});
