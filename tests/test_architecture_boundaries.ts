import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

const v1Routes = [
  'src/app/api/v1/rag/ask/route.ts',
  'src/app/api/v1/subjects/route.ts',
  'src/app/api/v1/subjects/default/route.ts',
  'src/app/api/v1/model-profiles/route.ts',
  'src/app/api/v1/model-profiles/[id]/route.ts',
  'src/app/api/v1/model-profiles/models/route.ts',
  'src/app/api/v1/deep-interaction/generate/route.ts',
  'src/app/api/v1/deep-interaction/planning/route.ts',
  'src/app/api/v1/deep-interaction/follow-up/route.ts',
];

test('v1 route handlers exist and delegate to feature application services', async () => {
  for (const route of v1Routes) {
    const source = await readFile(join(root, route), 'utf-8');
    assert.match(source, /@\/features\/.+\/application\//, `${route} should import a feature application service`);
    assert.doesNotMatch(source, /@\/lib\//, `${route} must not import legacy lib modules directly`);
  }
});

test('client feature UI does not import server infrastructure', async () => {
  const source = await readFile(join(root, 'src/features/rag/ui/RagWorkbench.tsx'), 'utf-8');
  assert.match(source, /^'use client';/);
  assert.doesNotMatch(source, /@\/features\/rag\/infrastructure|@\/platform\/env|process\.env|fs\/promises|node:fs/);
});
