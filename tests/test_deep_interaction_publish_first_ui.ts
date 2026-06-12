import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/components/deep-interaction/DeepInteractionShell.tsx');

test('DeepInteractionShell merges artifact quality updates without replacing HTML schema', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const updateIndex = source.indexOf("event.type === 'artifact_quality_updated'");
  const errorIndex = source.indexOf("if (event.type === 'error')", updateIndex);
  const updateBlock = source.slice(updateIndex, errorIndex);

  assert.ok(updateIndex > 0, 'expected artifact_quality_updated handler');
  assert.match(updateBlock, /qualityReport:\s*event\.qualityReport/);
  assert.match(updateBlock, /feedbackLoop:\s*event\.feedbackLoop/);
  assert.match(updateBlock, /finalScore:\s*event\.finalScore/);
  assert.match(updateBlock, /changeLog:\s*event\.changeLog/);
  assert.match(updateBlock, /artifactStore\.updateArtifact/);
  assert.match(updateBlock, /sessionStore\.updateArtifact/);
  assert.doesNotMatch(updateBlock, /schema:\s*event/);
  assert.doesNotMatch(updateBlock, /html:\s*event/);
});
