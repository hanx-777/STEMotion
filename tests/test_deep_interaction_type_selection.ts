import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('Lab generation exposes interaction type selection outside the 2xl sidebar', async () => {
  const rightPanel = await readProjectFile('src/components/deep-interaction/DeepInteractionRightPanel.tsx');
  const shell = await readProjectFile('src/components/deep-interaction/DeepInteractionShell.tsx');
  const stage = await readProjectFile('src/components/deep-interaction/DeepInteractionStage.tsx');
  const registry = await readProjectFile('src/lib/deep-interaction/rendererRegistry.ts');
  const cards = await readProjectFile('src/components/deep-interaction/InteractionTypeCards.tsx');

  assert.match(registry, /labGenerationTypeOrder/, 'registry should expose Lab-safe generation types');
  assert.doesNotMatch(
    registry,
    /labGenerationTypeOrder[\s\S]{0,240}rag_visualization/,
    'Lab-safe generation types should not include rag_visualization',
  );
  assert.match(cards, /types\s*=\s*interactionTypeOrder/, 'InteractionTypeCards should support an explicit type list');
  assert.match(rightPanel, /data-deep-generation-type-selector/, 'right panel should show a generation type selector');
  assert.match(rightPanel, /<InteractionTypeCards[\s\S]*labGenerationTypeOrder/, 'right panel should render Lab-safe type cards');
  assert.match(stage, /<InteractionTypeCards[\s\S]*labGenerationTypeOrder/, 'empty Lab stage should render Lab-safe type cards');
  assert.match(shell, /data-deep-mobile-panel[\s\S]*<DeepInteractionRightPanel/, 'mobile panel should reuse the right panel with the selector');
});

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), 'utf-8');
}
