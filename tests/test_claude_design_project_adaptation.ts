import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), 'utf-8');
}

const forbiddenExternalProtocol = /done\(|fork_verifier_agent|window\.claude|copy_starter_component|questions_v2|asset review pane|technical details of your environment|artifact_tool|str_replace_editor/i;

test('STEMotion design kit centralizes Claude-design-adapted UI primitives', async () => {
  const source = await readProjectFile('src/components/ui/stemotion.tsx');

  assert.match(source, /StemotionPageShell/, 'shared design kit should expose a page shell');
  assert.match(source, /StemotionToolbar/, 'shared design kit should expose a compact toolbar');
  assert.match(source, /StemotionPanel/, 'shared design kit should expose a panel primitive');
  assert.match(source, /StemotionMetricCard/, 'shared design kit should expose metric cards');
  assert.match(source, /StemotionEmptyState/, 'shared design kit should expose empty states');
  assert.match(source, /StemotionFilterPill/, 'shared design kit should expose filter pills');
  assert.match(source, /data-stemotion-page-shell/, 'page shell should expose a stable layout marker');
  assert.doesNotMatch(source, forbiddenExternalProtocol, 'design kit must not copy external artifact/tool protocol text');
});

test('priority product pages expose shared STEMotion layout regions', async () => {
  const pages = [
    {
      label: 'assets',
      path: 'src/features/assets/ui/AssetsWorkbench.tsx',
      marker: /data-assets-workbench/,
      shared: /StemotionPageShell|StemotionToolbar|StemotionPanel|StemotionFilterPill/,
    },
    {
      label: 'knowledge',
      path: 'src/app/knowledge/page.tsx',
      marker: /data-knowledge-workbench/,
      shared: /StemotionPageShell|StemotionMetricCard|StemotionPanel/,
    },
    {
      label: 'settings',
      path: 'src/components/settings/ModelSettingsConsole.tsx',
      marker: /data-settings-workbench/,
      shared: /StemotionPageShell|StemotionPanel|StemotionEmptyState/,
    },
    {
      label: 'lab',
      path: 'src/components/deep-interaction/DeepInteractionShell.tsx',
      marker: /data-lab-workbench/,
      shared: /stemotion-page|var\(--stemotion-|data-deep-main-stage/,
    },
    {
      label: 'rag',
      path: 'src/features/rag/ui/SubjectRagConsole.tsx',
      marker: /data-rag-console/,
      shared: /data-rag-status-bar|data-rag-bottom-composer|var\(--stemotion-/,
    },
  ];

  for (const page of pages) {
    const source = await readProjectFile(page.path);
    assert.match(source, page.marker, `${page.label} should expose a stable workbench marker`);
    assert.match(source, page.shared, `${page.label} should use the shared STEMotion layout language`);
    assert.doesNotMatch(source, forbiddenExternalProtocol, `${page.label} must not copy external artifact/tool protocol text`);
  }

  const assetsSource = await readProjectFile('src/features/assets/ui/AssetsWorkbench.tsx');
  assert.doesNotMatch(assetsSource, /bg-blue-600|text-blue-700|bg-slate-50 p-6/, 'assets should no longer use the old blue/slate standalone visual system');
});

test('artifact prompts adapt Claude-design principles without leaking external protocol', async () => {
  const files = [
    'src/lib/generation/artifactDesignContract.ts',
    'src/lib/deep-interaction/agents/designReviewRubric.ts',
    'src/lib/deep-interaction/prompts/diagram-content/system.md',
    'src/lib/deep-interaction/prompts/game-content/system.md',
    'src/lib/deep-interaction/prompts/rag-visualization-content/system.md',
    'src/lib/deep-interaction/prompts/simulation-content/system.md',
    'src/lib/deep-interaction/prompts/visualization3d-content/system.md',
  ];

  for (const path of files) {
    const source = await readProjectFile(path);
    assert.match(source, /existing (STEMotion )?visual vocabulary|design context|设计上下文/i, `${path} should require existing design context reuse`);
    assert.match(source, /anti-filler|filler|泛化|无意义/i, `${path} should reject filler UI/content`);
    assert.match(source, /data-screen-label|stable.*screen|high-level screen/i, `${path} should require stable screen-level labels for review context`);
    assert.match(source, /375px|44px|first-screen|1366x768/i, `${path} should keep viewport and touch usability constraints`);
    assert.doesNotMatch(source, forbiddenExternalProtocol, `${path} must not copy external artifact/tool protocol text`);
  }
});
