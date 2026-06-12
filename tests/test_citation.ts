import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCitations, summarizeSources } from '../src/features/rag/lib/citation';
import type { RetrievedChunk, WebSearchResult } from '../src/features/rag/lib/types';

test('citations distinguish local and web sources', () => {
  const local: RetrievedChunk[] = [{
    content: '斜抛运动最大高度公式',
    score: 0.8,
    metadata: {
      source: 'projectile_motion.md',
      subject: 'physics_mechanics',
      file_name: 'projectile_motion.md',
      chunk_id: 'physics_mechanics_projectile_motion_001',
      created_at: new Date().toISOString(),
      source_type: 'local',
    },
  }];
  const web: WebSearchResult[] = [{
    title: 'Projectile motion',
    url: 'https://example.edu/projectile',
    snippet: 'Projectile motion reference',
    source_type: 'web',
  }];

  const citations = buildCitations(local, web);
  const summary = summarizeSources(citations);

  assert.equal(citations.length, 2);
  assert.equal(citations[0].source_type, 'local');
  assert.equal(citations[1].source_type, 'web');
  assert.deepEqual(summary, { local_count: 1, web_count: 1 });
});
