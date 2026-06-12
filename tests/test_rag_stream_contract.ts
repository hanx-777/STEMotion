import assert from 'node:assert/strict';
import test from 'node:test';
import { createRagAskStreamResponse } from '../src/features/rag/application/ragAskStreamService';
import type { RagAskResult } from '../src/features/rag/lib/types';

const finalResult: RagAskResult = {
  subject: 'physics_mechanics',
  subject_display_name: '大学物理力学',
  task_type: 'step_solution',
  answer_protocol: 'json',
  answer: '最终审计后的回答 [L1]',
  answer_sections: [{ id: 'model', title: '物理模型判断', content: '最终审计后的回答 [L1]' }],
  formula_blocks: [],
  final_results: [],
  citations: [{
    source_type: 'local',
    source: 'projectile.md',
    chunk_id: 'chunk-1',
    subject: 'physics_mechanics',
    file_name: 'projectile.md',
  }],
  retrieved_chunks: [{
    content: '斜抛运动材料',
    score: 0.9,
    metadata: {
      source: 'projectile.md',
      subject: 'physics_mechanics',
      file_name: 'projectile.md',
      chunk_id: 'chunk-1',
      created_at: '2026-06-08T00:00:00.000Z',
      source_type: 'local',
    },
  }],
  source_summary: { local_count: 1, web_count: 0 },
  quality_report: {
    passed: true,
    score: 94,
    checks: [],
    decision: 'accept',
  },
};

test('RAG ask stream emits progress, answer_ready, quality_ready, and final_result in order', async () => {
  const response = createRagAskStreamResponse(
    { question: '斜抛运动最大高度怎么算？', quality: { mode: 'highQuality' } },
    new AbortController().signal,
    {
      askStream: async (_input, emit) => {
        emit({ type: 'progress', stage: 'retrieve_local', message: '检索完成', progress: 20 });
        emit({ type: 'answer_ready', result: finalResult });
        emit({ type: 'quality_ready', qualityReport: finalResult.quality_report! });
        return finalResult;
      },
    },
  );

  assert.equal(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
  const events = await collectSseEvents(response);
  assert.deepEqual(events.map((event) => event.type), [
    'progress',
    'answer_ready',
    'quality_ready',
    'final_result',
  ]);
  const finalEvent = events[3];
  assert.ok(finalEvent);
  assert.equal(finalEvent.result?.answer?.text, finalResult.answer);
  assert.equal(finalEvent.result?.qualityReport?.score, 94);
});

type ParsedSseEvent = {
  type: string;
  result?: {
    answer?: { text?: string };
    qualityReport?: { score?: number };
  };
};

async function collectSseEvents(response: Response): Promise<ParsedSseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)) as ParsedSseEvent);
}
