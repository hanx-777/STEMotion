import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/features/rag/ui/SubjectRagConsole.tsx');

test('RAG workbench uses Codex-style layout regions', async () => {
  const source = await readFile(sourcePath, 'utf-8');

  assert.match(source, /advancedControlsOpen/, 'RAG UI should track collapsed advanced controls');
  assert.match(source, /rightPanelOpen/, 'RAG UI should track the collapsible right panel');
  assert.match(source, /composerExpanded/, 'RAG UI should track the bottom composer expansion');
  assert.match(source, /composerVisible/, 'RAG UI should allow the floating composer to be hidden');
  assert.match(source, /data-rag-status-bar/, 'RAG UI should expose a compact top status bar');
  assert.match(
    source,
    /data-rag-status-bar[^>]*className="[^"]*relative[^"]*z-(?:30|40|50|\[)/,
    'RAG status bar should create a higher stacking layer so model menus render above the workspace',
  );
  assert.match(source, /data-rag-advanced-controls/, 'RAG UI should group secondary controls in one panel');
  assert.match(source, /hidden={!advancedControlsOpen}/, 'advanced controls should be hidden by default');
  assert.match(source, /data-rag-bottom-composer/, 'RAG UI should move question input into a bottom composer');
  assert.match(source, /data-rag-composer-overlay/, 'RAG composer should float over the workspace instead of occupying layout height');
  assert.match(source, /data-rag-composer-restore/, 'RAG UI should expose a restore affordance when the composer is hidden');
  assert.match(source, /data-rag-save-intent-label/, 'RAG composer should explain whether submit will update or create a session');
  assert.match(source, /data-rag-save-confirmation/, 'RAG composer should include a lightweight save intent confirmation bar');
  assert.match(source, /pendingSessionSaveConfirmation &&/, 'save confirmation should stay hidden until intent is ambiguous');
  assert.match(source, /更新当前会话/, 'save confirmation should offer updating the current session');
  assert.match(source, /保存为新会话/, 'save confirmation should offer saving as a new session');
  assert.match(source, /planningModeEnabled/, 'RAG UI should expose Codex-style planning mode state');
  assert.match(source, /pendingRagPlan/, 'RAG UI should keep a pending plan before asking');
  assert.match(source, /data-rag-planning-mode-toggle/, 'RAG UI should expose a planning mode toggle');
  assert.match(source, /data-rag-planning-confirmation/, 'RAG composer should show a plan confirmation panel');
  assert.match(source, /data-rag-planning-question/, 'RAG plan confirmation should ask clarifying questions');
  assert.match(source, /确认并开始/, 'RAG plan confirmation should require explicit confirmation before asking');
  assert.match(source, /data-rag-right-panel-toggle/, 'RAG UI should expose a right-panel toggle');
  assert.match(source, /data-rag-mobile-info-panel/, 'RAG UI should expose a mobile-friendly info panel');
  assert.match(source, /data-rag-main-progress/, 'RAG progress should appear above the main answer stream');
  assert.doesNotMatch(
    source,
    /renderSidePanelContent[\s\S]{0,900}<RealisticProgressPanel/,
    'RAG progress should not stay in the right info panel after moving above the answer stream',
  );
});
