import assert from 'node:assert/strict';
import test from 'node:test';
import { MockWebSearchProvider } from '../src/lib/rag/web_search';

test('MockWebSearchProvider returns structured web results', async () => {
  const provider = new MockWebSearchProvider();
  const results = await provider.search('斜抛运动', 'physics_mechanics', 2);

  assert.equal(results.length, 2);
  assert.equal(results[0].source_type, 'web');
  assert.ok(results[0].title);
  assert.ok(results[0].url.startsWith('https://'));
  assert.ok(results[0].snippet.includes('斜抛运动'));
});
