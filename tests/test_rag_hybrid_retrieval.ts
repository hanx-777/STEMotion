import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HashEmbeddingProvider } from '../src/features/rag/lib/embeddings';
import { LocalVectorStore } from '../src/features/rag/lib/vector_store';
import type { RagChunk } from '../src/features/rag/lib/types';

function chunk(id: string, content: string): RagChunk {
  return {
    content,
    metadata: {
      source: `${id}.md`,
      subject: 'physics_mechanics',
      file_name: `${id}.md`,
      chunk_id: id,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

test('LocalVectorStore hybrid search merges lexical and optional embedding scores', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-rag-'));
  try {
    const store = new LocalVectorStore(join(dir, 'physics_mechanics.json'));
    const embeddingProvider = new HashEmbeddingProvider(64);
    await store.save('physics_mechanics', [
      chunk('projectile', '斜抛运动 最大高度 水平射程 速度分解'),
      chunk('circular', '匀速圆周运动 向心加速度 速度方向'),
    ], { embeddingProvider });

    const results = await store.searchHybrid('斜抛运动最大高度公式', {
      lexicalTopK: 4,
      embeddingTopK: 4,
      rerankTopK: 2,
      embeddingProvider,
    });

    assert.equal(results[0].metadata.chunk_id, 'projectile');
    assert.ok(results[0].score > 0);
    assert.ok((results[0].metadata.embedding_score ?? 0) > 0);
    assert.ok(['lexical', 'embedding', 'hybrid'].includes(results[0].metadata.retrieval_method as string));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
