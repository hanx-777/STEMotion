import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('AppShell exposes a draggable desktop sidebar splitter', async () => {
  const source = await readFile(join(root, 'src/components/layout/AppShell.tsx'), 'utf-8');

  assert.match(source, /data-sidebar-resizer/, 'AppShell should render a stable sidebar resize handle');
  assert.match(source, /role=["']separator["']/, 'sidebar resize handle should use separator semantics');
  assert.match(source, /aria-orientation=["']vertical["']/, 'sidebar resize handle should announce vertical resizing');
  assert.match(source, /aria-label=["']调整侧边栏宽度["']/, 'sidebar resize handle should have a clear Chinese label');
  assert.match(source, /onPointerDown=\{handleSidebarResizeStart\}/, 'sidebar resize handle should start resizing on pointer down');
  assert.match(source, /setPointerCapture/, 'sidebar resize should capture the pointer while dragging');
});

test('AppShell keeps language switching in the sidebar and lets RAG own a single top bar', async () => {
  const source = await readFile(join(root, 'src/components/layout/AppShell.tsx'), 'utf-8');

  assert.match(source, /data-sidebar-language-toggle/, 'language toggle should live in the sidebar controls');
  assert.match(source, /isRagSurface/, 'AppShell should detect RAG surfaces that provide their own compact top bar');
  assert.match(source, /\{!isRagSurface && \(/, 'AppShell should not render a second header above RAG surfaces');
});
