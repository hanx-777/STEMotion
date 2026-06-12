import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGenerationCache,
  stableGenerationCacheKey,
} from '../src/lib/generation/generationCache';

test('generation cache reuses entries until TTL expires', () => {
  let now = 1_000;
  const cache = createGenerationCache<string>({ ttlMs: 100, now: () => now });
  const key = stableGenerationCacheKey({
    provider: 'anthropic',
    model: 'mimo-v2.5-pro',
    preset: 'reviewer',
    promptVersion: 'rag-review-v1',
    inputHash: 'abc123',
  });

  assert.equal(cache.get(key), undefined);
  cache.set(key, 'cached-review');
  assert.equal(cache.get(key), 'cached-review');

  now += 101;
  assert.equal(cache.get(key), undefined);
});

test('generation cache key changes when model or prompt version changes', () => {
  const base = {
    provider: 'anthropic',
    model: 'mimo-v2.5-pro',
    preset: 'artifact',
    promptVersion: 'rag-html-v1',
    inputHash: 'same-input',
  };

  assert.notEqual(
    stableGenerationCacheKey(base),
    stableGenerationCacheKey({ ...base, model: 'mimo-v2.5-fast' }),
  );
  assert.notEqual(
    stableGenerationCacheKey(base),
    stableGenerationCacheKey({ ...base, promptVersion: 'rag-html-v2' }),
  );
});
