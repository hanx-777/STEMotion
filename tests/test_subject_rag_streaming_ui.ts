import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/features/rag/ui/SubjectRagConsole.tsx');

test('SubjectRagConsole renders streamed answer deltas before answer_ready', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const deltaIndex = source.indexOf('onAnswerDelta');
  const readyIndex = source.indexOf('onAnswerReady');

  assert.ok(deltaIndex > 0, 'RAG console should subscribe to answer_delta events');
  assert.ok(readyIndex > deltaIndex, 'answer_delta handling should run before answer_ready handling');

  const deltaHandler = source.slice(deltaIndex, readyIndex);
  assert.doesNotMatch(deltaHandler, /setResult\(/, 'answer_delta should not rebuild the full result tree on every token');
  assert.doesNotMatch(deltaHandler, /createRagVisualizationDraftResult/, 'answer_delta should not create a draft RagResult per token');
  assert.match(deltaHandler, /scheduleStreamingAnswerPreviewUpdate/, 'answer_delta should use a throttled streaming preview updater');
  assert.match(deltaHandler, /正在生成回答/, 'progress copy should make the pre-audit streaming state explicit');

  const readyHandler = source.slice(readyIndex, source.indexOf('onQualityReady'));
  assert.match(readyHandler, /commitResult\(/, 'answer_ready should still install the structured result');
  assert.match(readyHandler, /clearStreamingAnswerPreview/, 'answer_ready should clear the streaming preview before showing final content');
});

test('SubjectRagConsole keeps streaming answer in a stable non-motion panel', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const panelIndex = source.indexOf('data-rag-streaming-answer');
  assert.ok(panelIndex > 0, 'RAG console should expose a stable streaming answer panel marker');

  const panelSource = source.slice(panelIndex - 600, panelIndex + 1200);
  assert.match(panelSource, /min-h-\[/, 'streaming panel should reserve vertical space to avoid layout jump');
  assert.match(panelSource, /whitespace-pre-wrap/, 'streaming preview should preserve streamed text without remounting sections');
  assert.match(panelSource, /overflow-anchor-none/, 'streaming panel should opt out of scroll anchoring jitter');
  assert.doesNotMatch(panelSource, /data-result-motion/, 'streaming panel should not trigger result reveal animation per token');
});

test('SubjectRagConsole renders backend-owned visualization instead of starting a dependent job from answer_ready', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const clientSource = await readFile(join(root, 'src/features/rag/client/ragClient.ts'), 'utf-8');
  const askCallIndex = source.indexOf('await askRagFromBrowserStream');
  const readyIndex = source.indexOf('onAnswerReady', askCallIndex);
  const qualityIndex = source.indexOf('onQualityReady', readyIndex);
  const finalIndex = source.indexOf('const ragResult = data as unknown as RagResult', askCallIndex);
  const catchIndex = source.indexOf('} catch (err)', finalIndex);

  assert.ok(readyIndex > 0 && qualityIndex > readyIndex, 'expected answer_ready handler before quality handler');
  assert.ok(finalIndex > qualityIndex && catchIndex > finalIndex, 'expected final result block after stream handlers');

  const readyHandler = source.slice(readyIndex, qualityIndex);
  const finalResultBlock = source.slice(finalIndex, catchIndex);

  assert.doesNotMatch(readyHandler, /startVisualizationGeneration/, 'answer_ready should not start a second visualization job');
  assert.doesNotMatch(finalResultBlock, /startVisualizationGeneration/, 'final_result should not start a second visualization job');
  assert.match(clientSource, /createRagRun\(/, 'RAG ask should create a GPT-style public run');
  assert.match(clientSource, /rootJobId/, 'RAG ask should subscribe to the root job for the public run');
  assert.doesNotMatch(clientSource, /createGenerationJob\(\s*['"]rag_ask_stream['"]/, 'new RAG UI path should not default to the legacy answer-only job');
  assert.doesNotMatch(source, /auditMaxIterations/, 'audit iteration count must not be exposed in UI code');
});

test('SubjectRagConsole creates shareable run URLs for backend-owned RAG generation', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const clientSource = await readFile(join(root, 'src/features/rag/client/ragClient.ts'), 'utf-8');
  const runPageSource = await readFile(join(root, 'src/app/learn/r/[runId]/page.tsx'), 'utf-8');

  assert.match(clientSource, /POST[\s\S]*\/api\/v1\/rag\/runs/, 'RAG client should create runs through the run API');
  assert.match(clientSource, /resumeRagRunFromBrowser/, 'RAG client should resume runs by run id');
  assert.match(source, /initialRunId/, 'RAG console should accept an initial run id from the route');
  assert.match(source, /history\.(pushState|replaceState)\([^)]*\/learn\/r\/\$\{/, 'submitting a question should update the public run URL without remounting');
  assert.doesNotMatch(source, /router\.push\(`\/learn\/r\/\$\{/, 'submitting a question must not remount the RAG console');
  assert.match(runPageSource, /params: Promise<\{ runId: string \}>/);
  assert.match(runPageSource, /RagSurfacePage[\s\S]*initialRunId=\{runId\}/);
});

test('SubjectRagConsole uses a single run recovery path for public run routes', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const runResumeIndex = source.indexOf('resumeRagRunFromBrowser');
  const legacyResumeIndex = source.indexOf('readActiveRagSessionGenerationJob');

  assert.ok(runResumeIndex > 0, 'expected run resume path');
  assert.ok(legacyResumeIndex > runResumeIndex, 'legacy resume path should be after run resume');
  assert.match(source, /if\s*\(initialRunId\)\s*return;/, 'public run route should not also run legacy active job restore');
  assert.match(source, /handleRagSessionGenerationEvent/, 'new and resumed runs should share the same session event reducer');
  assert.match(
    source,
    /onJobEvent:\s*\(event\)\s*=>\s*\{\s*handleRagSessionGenerationEvent/,
    'RAG job events should be routed through the shared reducer instead of per-path ad hoc handlers',
  );
});

test('SubjectRagConsole never saves sessions from inside a React result updater', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const updaterPattern = /setResult\s*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?saveSession\s*\(/;

  assert.doesNotMatch(
    source,
    updaterPattern,
    'saveSession updates zustand and must not run inside setResult updater functions',
  );

  const artifactReadyIndex = source.indexOf("event.type === 'artifact_ready'");
  const artifactReadyBlock = source.slice(artifactReadyIndex, source.indexOf("if (event.type === 'error')"));
  assert.ok(artifactReadyIndex > 0, 'expected artifact_ready handler');
  assert.match(artifactReadyBlock, /commitResult\(/, 'artifact_ready should commit the successful visualization result');
  assert.match(artifactReadyBlock, /saveSession\(/, 'artifact_ready should still save the updated session');
});

test('SubjectRagConsole recovers visualization artifact from job_completed result', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const handlerIndex = source.indexOf('const handleRagVisualizationEvent');
  const resetIndex = source.indexOf('const resetPlanningState');
  const handlerSource = source.slice(handlerIndex, resetIndex);

  assert.match(handlerSource, /isJobCompletedEvent/);
  assert.match(handlerSource, /event\.result/);
  assert.match(handlerSource, /extractCompletedRagVisualizationArtifact/);
  assert.match(handlerSource, /acceptRagVisualizationArtifact/);
});

test('SubjectRagConsole merges artifact quality updates without replacing HTML', async () => {
  const source = await readFile(sourcePath, 'utf-8');
  const handlerIndex = source.indexOf('const handleRagVisualizationEvent');
  const resetIndex = source.indexOf('const resetPlanningState');
  const handlerSource = source.slice(handlerIndex, resetIndex);

  assert.match(handlerSource, /artifact_quality_updated/);
  assert.match(handlerSource, /mergeRagVisualizationQualityUpdate/);
  assert.match(handlerSource, /qualityReport/);
  assert.match(handlerSource, /feedbackLoop/);
  assert.doesNotMatch(
    handlerSource,
    /artifact_quality_updated[\s\S]{0,900}setGeneratedVisualizationArtifact/,
    'quality updates should not replace the rendered HTML artifact',
  );
});

test('SubjectRagConsole subscribes to background artifact quality review jobs', async () => {
  const source = await readFile(sourcePath, 'utf-8');

  assert.match(source, /subscribeRagArtifactQualityReviewFromBrowser/);
  assert.match(source, /artifact_quality_review_started/);
  assert.match(source, /qualityReviewJobId/);
  assert.match(source, /subscribeArtifactQualityReviewJob/);
  assert.match(source, /artifact_quality_updated[\s\S]{0,900}mergeRagVisualizationQualityUpdate/);
});

test('SubjectRagConsole labels legacy repair attempts as diagnostics instead of current workflow', async () => {
  const source = await readFile(sourcePath, 'utf-8');

  assert.doesNotMatch(source, /已尝试\s*\{?repairAttempts\}?\s*轮修复/);
  assert.doesNotMatch(source, /审计与修复流程/);
  assert.doesNotMatch(source, /Pedagogy \/ UX \/ Safety \/ Runtime/);
  assert.match(source, /历史修复诊断|质量诊断/);
});
