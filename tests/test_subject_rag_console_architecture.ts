import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('SubjectRagConsole delegates generation jobs to focused clients and keeps automatic RAG backend-owned', async () => {
  const consoleSource = await readProjectFile('src/features/rag/ui/SubjectRagConsole.tsx');
  const hookSource = await readProjectFile('src/features/rag/ui/hooks/useRagVisualizationJobSubscription.ts');
  const ragClientSource = await readProjectFile('src/features/rag/client/ragClient.ts');

  assert.match(consoleSource, /useRagVisualizationJobSubscription/);
  assert.doesNotMatch(consoleSource, /createGenerationJob/);
  assert.doesNotMatch(consoleSource, /subscribeGenerationJob/);

  assert.match(ragClientSource, /createRagRun\(/);
  assert.match(ragClientSource, /rootJobId/);
  assert.doesNotMatch(ragClientSource, /createGenerationJob\(\s*['"]rag_ask_stream['"]/);
  assert.match(ragClientSource, /readActiveRagSessionGenerationJob/);
  assert.match(ragClientSource, /readActiveRagRun/);
  assert.match(ragClientSource, /resumeRagSessionGenerationFromBrowser/);
  assert.match(ragClientSource, /resumeRagRunFromBrowser/);
  assert.match(consoleSource, /readActiveRagSessionGenerationJob/);
  assert.match(consoleSource, /initialRunId/);
  assert.match(consoleSource, /resumeRagSessionGenerationFromBrowser/);

  assert.match(hookSource, /createGenerationJob\(\s*['"]rag_visualization['"]/);
  assert.match(hookSource, /subscribeGenerationJob/);
  assert.match(hookSource, /rememberVisualizationJob/);
  assert.match(hookSource, /forgetVisualizationJob/);
  assert.match(hookSource, /resume/);
  assert.match(hookSource, /readActiveVisualizationJob/);
});

test('RAG run client does not write legacy active job markers for new runs', async () => {
  const ragClientSource = await readProjectFile('src/features/rag/client/ragClient.ts');
  const askStart = ragClientSource.indexOf('export async function askRagFromBrowserStream');
  const resumeStart = ragClientSource.indexOf('export async function resumeRagRunFromBrowser');
  assert.ok(askStart > 0 && resumeStart > askStart, 'expected ask and resume client functions');

  const askSource = ragClientSource.slice(askStart, resumeStart);
  assert.match(askSource, /rememberActiveRagRun/);
  assert.doesNotMatch(
    askSource,
    /rememberActiveRagSessionJob/,
    'new public run asks should not also persist a legacy active job marker',
  );
});

test('SubjectRagConsole accepts visualization artifacts from artifact_ready and job_completed', async () => {
  const consoleSource = await readProjectFile('src/features/rag/ui/SubjectRagConsole.tsx');
  const acceptIndex = consoleSource.indexOf('const acceptRagVisualizationArtifact');
  const eventHandlerIndex = consoleSource.indexOf('const handleRagVisualizationEvent');
  assert.ok(acceptIndex > 0, 'expected a shared artifact accept helper');
  assert.ok(eventHandlerIndex > acceptIndex, 'event handler should reuse the accept helper');

  const eventHandler = consoleSource.slice(eventHandlerIndex, consoleSource.indexOf('const resetPlanningState'));
  assert.match(eventHandler, /isArtifactReadyEvent/);
  assert.match(eventHandler, /isJobCompletedEvent/);
  assert.match(eventHandler, /acceptRagVisualizationArtifact/);
  assert.match(eventHandler, /extractCompletedRagVisualizationArtifact/);
});

test('SubjectRagConsole treats subscription interruptions as recoverable until job_failed', async () => {
  const consoleSource = await readProjectFile('src/features/rag/ui/SubjectRagConsole.tsx');
  const startIndex = consoleSource.indexOf('const startVisualizationGeneration');
  const manualIndex = consoleSource.indexOf('const triggerManualVisualization');
  const startBlock = consoleSource.slice(startIndex, manualIndex);

  assert.match(startBlock, /terminalEventHandled/);
  assert.match(startBlock, /isJobFailedEvent/);
  assert.match(startBlock, /正在恢复可视化任务/);
  assert.doesNotMatch(startBlock, /catch\s*\([^)]*\)\s*\{[\s\S]{0,800}completeRagVisualizationFailure/);
});

test('SubjectRagConsole defaults normal generation quality to review instead of highQuality', async () => {
  const consoleSource = await readProjectFile('src/features/rag/ui/SubjectRagConsole.tsx');

  assert.doesNotMatch(consoleSource, /fastMode \? ['"]fast['"] : ['"]highQuality['"]/);
  assert.match(consoleSource, /fastMode \? ['"]fast['"] : ['"]review['"]/);
  assert.match(consoleSource, /value === ['"]highQuality['"]/);
});

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), 'utf-8');
}
