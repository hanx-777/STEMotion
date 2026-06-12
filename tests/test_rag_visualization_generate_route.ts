import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createRagVisualizationGenerateResponse } from '../src/features/rag/application/ragVisualizationService';
import type { InteractionArtifact } from '../src/features/deep-interaction/lib/types';
import type { RagVisualizationAuditInput } from '../src/features/rag/lib/visualization/auditPipeline';

const root = process.cwd();

test('RAG visualization generate route treats deterministic spec as generation context', async () => {
  const routeSource = await readFile(join(root, 'src/app/api/v1/rag/visualization/generate/route.ts'), 'utf8');
  const serviceSource = await readFile(join(root, 'src/features/rag/application/ragVisualizationService.ts'), 'utf8');
  const consoleSource = await readFile(join(root, 'src/features/rag/ui/SubjectRagConsole.tsx'), 'utf8');

  assert.match(routeSource, /toRagVisualizationAuditInput\(body\)/);
  assert.match(serviceSource, /visualizationSpec:\s*body\.visualizationSpec/);
  assert.doesNotMatch(serviceSource, /visualizationQuality:\s*body\.visualizationQuality/);
  assert.match(consoleSource, /visualizationSpec:\s*ragResult\.visualization_spec/);
  assert.doesNotMatch(consoleSource, /visualizationQuality:\s*ragResult\.visualization_spec/);
  assert.doesNotMatch(consoleSource, /passed:\s*true,\s*score:\s*ragResult\.quality_report/);
});

test('RAG visualization route propagates request abort signal into stream orchestration', async () => {
  const source = await readFile(join(root, 'src/app/api/v1/rag/visualization/generate/route.ts'), 'utf8');
  const serviceSource = await readFile(join(root, 'src/features/rag/application/ragVisualizationService.ts'), 'utf8');

  assert.match(source, /createRagVisualizationGenerateResponse\([\s\S]*request\.signal/);
  assert.match(serviceSource, /signal\.addEventListener\(\s*['"]abort['"]/);
  assert.match(serviceSource, /isAborted:\s*\(\)\s*=>\s*aborted\s*\|\|\s*signal\.aborted/);
  assert.match(serviceSource, /signal,\s*\n\s*\}\)/);
});

test('RAG visualization response passes spec context into injectable pipeline without quality bypass field', async () => {
  const controller = new AbortController();
  let capturedInput: RagVisualizationAuditInput | undefined;
  let capturedAbortState: boolean | undefined;
  let capturedSignal: AbortSignal | undefined;

  const response = createRagVisualizationGenerateResponse(
    {
      question: '用单调栈求下一个更大元素',
      answerText: '维护一个递减下标栈。',
      subject: 'computer_science',
      taskType: 'step_solution',
      source: 'student',
      visualizationSpec: {
        type: 'algorithm_trace',
        title: '单调栈过程',
        description: '保留输入数组和栈状态。',
        algorithmName: 'next_greater_element',
        dataStructure: 'stack',
        inputExample: '[2,1,2,4,3]',
        steps: [
          {
            stepIndex: 0,
            operation: '初始化',
            explanation: '创建空栈和输出数组。',
            state: { stack: [], output: [-1, -1, -1, -1, -1] },
          },
        ],
      },
      visualizationQuality: { passed: true, score: 99, issues: [] },
    } as RagVisualizationAuditInput & { visualizationQuality: unknown },
    controller.signal,
    {
      pipeline: async (input, options) => {
        const pipelineOptions = options ?? {};
        capturedInput = input;
        capturedAbortState = pipelineOptions.isAborted?.();
        capturedSignal = pipelineOptions.signal;
        pipelineOptions.emit?.({ type: 'progress', stage: 'planning', message: 'ok', progress: 1 });
        return {
          id: 'artifact_1',
          sessionId: 'session_1',
          type: 'rag_visualization',
          title: 'Mock artifact',
          description: 'Mock artifact',
          schema: {
            type: 'rag_visualization',
            title: 'Mock artifact',
            description: 'Mock artifact',
            learningGoals: [],
            explanationSteps: [],
            visualizationSpec: {
              type: 'interactive_html',
              title: 'Mock artifact',
              description: 'Mock artifact',
              html: '<!doctype html><html><body></body></html>',
              interactionType: 'custom',
              parameters: {},
            },
            htmlWidget: {
              html: '<!doctype html><html><body></body></html>',
              widgetType: 'rag_visualization',
              widgetConfig: { concept: 'mock', variables: [], defaultState: {}, messageTargets: [] },
              allowedMessageTypes: [],
            },
            ragMetadata: {
              source: 'student',
              subject: 'computer_science',
              originalQuestion: '用单调栈求下一个更大元素',
              taskType: 'step_solution',
            },
          },
          status: 'ready',
          version: 1,
          createdAt: '2026-06-08T00:00:00.000Z',
          updatedAt: '2026-06-08T00:00:00.000Z',
        } as InteractionArtifact;
      },
    },
  );

  const text = await response.text();

  assert.equal(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
  assert.match(text, /"type":"progress"/);
  assert.equal(capturedInput?.visualizationSpec?.type, 'algorithm_trace');
  assert.equal('visualizationQuality' in (capturedInput ?? {}), false);
  assert.equal(capturedAbortState, false);
  assert.equal(capturedSignal, controller.signal);
});
