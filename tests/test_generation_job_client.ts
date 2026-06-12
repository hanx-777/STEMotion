import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGenerationJob,
  isArtifactReadyEvent,
  isJobCompletedEvent,
  isJobFailedEvent,
  isRagSessionGenerationResult,
  listGenerationJobs,
  subscribeGenerationJob,
} from '../src/features/generation-jobs/client/generationJobClient';
import { resumeRagRunFromBrowser } from '../src/features/rag/client/ragClient';

function makeRagV1AskResponse(text: string) {
  return {
    subject: {
      id: 'physics_mechanics',
      displayName: '物理力学',
    },
    taskType: 'knowledge_qa',
    answer: {
      protocol: 'json',
      text,
      sections: [],
      formulas: [],
      finalResults: [],
    },
    citations: [],
    evidence: {
      chunks: [],
      sourceSummary: {
        local_count: 0,
        web_count: 0,
      },
    },
    warnings: [],
  };
}

test('generation job client creates jobs through the same-origin BFF route', async () => {
  const seen: Array<{ url: string; method?: string; body?: unknown }> = [];
  const created = await createGenerationJob(
    'deep_interaction',
    { prompt: '斜抛运动', preferredType: 'simulation' },
    {
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), method: init?.method, body: init?.body });
        return Response.json({ jobId: 'job_1', status: 'queued', type: 'deep_interaction' }, { status: 202 });
      },
    },
  );

  assert.equal(created.jobId, 'job_1');
  assert.equal(seen[0].url, '/api/v1/generation-jobs');
  assert.equal(seen[0].method, 'POST');
  assert.match(String(seen[0].body), /deep_interaction/);
});

test('generation job client creates top-level RAG session jobs and lists resumable jobs', async () => {
  const seen: Array<{ url: string; method?: string; body?: unknown }> = [];
  const created = await createGenerationJob(
    'rag_session_generation',
    {
      question: '单调栈怎么理解？',
      subjectId: 'computer_science',
      taskType: 'step_solution',
      clientSessionId: 'client_session_1',
      visualization: { mode: 'auto' },
    },
    {
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), method: init?.method, body: init?.body });
        return Response.json({ jobId: 'job_1', status: 'queued', type: 'rag_session_generation' }, { status: 202 });
      },
    },
  );

  const jobs = await listGenerationJobs(
    { type: 'rag_session_generation', status: 'running', clientSessionId: 'client_session_1', limit: 5 },
    {
      fetchImpl: async (url) => {
        seen.push({ url: String(url), method: 'GET' });
        return Response.json({
          jobs: [{
            id: 'job_1',
            type: 'rag_session_generation',
            status: 'running',
            inputSummary: { clientSessionId: 'client_session_1' },
            createdAt: 'now',
            updatedAt: 'now',
          }],
        });
      },
    },
  );

  assert.equal(created.type, 'rag_session_generation');
  assert.equal(jobs.jobs[0].id, 'job_1');
  assert.equal(seen[0].url, '/api/v1/generation-jobs');
  assert.match(String(seen[0].body), /rag_session_generation/);
  assert.equal(
    seen[1].url,
    '/api/v1/generation-jobs?type=rag_session_generation&status=running&clientSessionId=client_session_1&limit=5',
  );
});

test('generation job client subscribes to SSE and yields original pipeline events', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  await subscribeGenerationJob(
    'job_1',
    (event) => events.push(event),
    {
      fetchImpl: async (url) => {
        assert.equal(String(url), '/api/v1/generation-jobs/job_1/events');
        return new Response([
          'data: {"type":"job_created","jobId":"job_1","status":"queued"}',
          '',
          'data: {"type":"answer_delta","delta":"hello"}',
          '',
          'data: {"type":"final_result","result":{"answer":{"text":"done"}}}',
          '',
          'data: {"type":"job_completed","jobId":"job_1","sequence":4,"createdAt":"now","status":"completed","result":{"answer":{"text":"done"}}}',
          '',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      },
    },
  );

  assert.deepEqual(events.map((event) => event.type), ['job_created', 'answer_delta', 'final_result', 'job_completed']);
  assert.equal(events[1].delta, 'hello');
});

test('generation job client exposes typed terminal and artifact event helpers', () => {
  assert.equal(isArtifactReadyEvent({ type: 'artifact_ready', artifact: { id: 'artifact_1' } }), true);
  assert.equal(isJobCompletedEvent({ type: 'job_completed', status: 'completed', result: { ok: true } }), true);
  assert.equal(isJobFailedEvent({ type: 'job_failed', status: 'failed', message: 'failed' }), true);
  assert.equal(isArtifactReadyEvent({ type: 'progress' }), false);
  assert.equal(isJobCompletedEvent({ type: 'artifact_ready' }), false);
  assert.equal(isJobFailedEvent({ type: 'job_completed' }), false);
  assert.equal(
    isRagSessionGenerationResult({
      type: 'rag_session_generation_result',
      answer: { answer: { text: 'done' } },
      visualizationStatus: 'ready',
    }),
    true,
  );
});

test('generation job client compensates with completed snapshot when SSE ends before artifact_ready', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const seenUrls: string[] = [];

  await subscribeGenerationJob(
    'job_1',
    (event) => events.push(event),
    {
      fetchImpl: async (url) => {
        seenUrls.push(String(url));
        if (String(url).endsWith('/events')) {
          return new Response('data: {"type":"progress","jobId":"job_1","sequence":1,"createdAt":"now","progress":42}\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          });
        }
        return Response.json({
          id: 'job_1',
          type: 'rag_visualization',
          status: 'completed',
          result: { id: 'artifact_1', type: 'rag_visualization' },
          inputSummary: {},
          createdAt: 'now',
          updatedAt: 'now',
          completedAt: 'now',
        });
      },
    },
  );

  assert.deepEqual(events.map((event) => event.type), ['progress', 'job_completed']);
  assert.deepEqual((events[1] as { result?: unknown }).result, { id: 'artifact_1', type: 'rag_visualization' });
  assert.deepEqual(seenUrls, ['/api/v1/generation-jobs/job_1/events', '/api/v1/generation-jobs/job_1']);
});

test('generation job client reconnects running jobs and deduplicates replayed events', async () => {
  const events: Array<{ type: string; sequence?: number; [key: string]: unknown }> = [];
  let eventReads = 0;

  await subscribeGenerationJob(
    'job_1',
    (event) => events.push(event),
    {
      reconnectDelayMs: 0,
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.endsWith('/events')) {
          eventReads += 1;
          if (eventReads === 1) {
            return new Response('data: {"type":"progress","jobId":"job_1","sequence":1,"createdAt":"now","progress":20}\n\n', {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
            });
          }
          return new Response([
            'data: {"type":"progress","jobId":"job_1","sequence":1,"createdAt":"now","progress":20}',
            '',
            'data: {"type":"artifact_ready","jobId":"job_1","sequence":2,"createdAt":"now","artifact":{"id":"artifact_1"}}',
            '',
            'data: {"type":"job_completed","jobId":"job_1","sequence":3,"createdAt":"now","status":"completed","result":{"id":"artifact_1"}}',
            '',
          ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          });
        }

        return Response.json({
          id: 'job_1',
          type: 'rag_visualization',
          status: eventReads === 1 ? 'running' : 'completed',
          result: eventReads === 1 ? undefined : { id: 'artifact_1' },
          inputSummary: {},
          createdAt: 'now',
          updatedAt: 'now',
        });
      },
    },
  );

  assert.deepEqual(events.map((event) => `${event.sequence}:${event.type}`), [
    '1:progress',
    '2:artifact_ready',
    '3:job_completed',
  ]);
  assert.equal(eventReads, 2);
});

test('generation job client reports failed snapshot as terminal failure', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  await assert.rejects(
    subscribeGenerationJob(
      'job_1',
      (event) => events.push(event),
      {
        fetchImpl: async (url) => {
          if (String(url).endsWith('/events')) {
            return new Response('data: {"type":"progress","jobId":"job_1","sequence":1,"createdAt":"now","progress":50}\n\n', {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
            });
          }
          return Response.json({
            id: 'job_1',
            type: 'rag_visualization',
            status: 'failed',
            error: 'artifact failed',
            errorDiagnostics: { stage: 'rag_widget_html' },
            inputSummary: {},
            createdAt: 'now',
            updatedAt: 'now',
          });
        },
      },
    ),
    /artifact failed/,
  );

  assert.deepEqual(events.map((event) => event.type), ['progress', 'job_failed']);
  assert.deepEqual((events[1] as { diagnostics?: unknown }).diagnostics, { stage: 'rag_widget_html' });
});

test('rag run client replays run snapshot events and skips SSE for completed root job', async () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];
  const seenEvents: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seenUrls.push(url);
      if (url.endsWith('/events')) {
        throw new Error('completed run resume should not open SSE');
      }
      assert.equal(url, '/api/v1/rag/runs/run_1');
      return Response.json({
        run: {
          runId: 'run_1',
          rootJobId: 'job_1',
          status: 'completed',
          createdAt: 'now',
          updatedAt: 'now',
          childJobIds: [],
          lastResult: {
            type: 'rag_session_generation_result',
            request: { question: '动量守恒' },
            answer: makeRagV1AskResponse('完成'),
            visualizationStatus: 'ready',
            artifact: { id: 'artifact_1', type: 'rag_visualization', title: 'artifact' },
          },
        },
        rootJob: {
          id: 'job_1',
          runId: 'run_1',
          type: 'rag_session_generation',
          status: 'completed',
          inputSummary: {},
          createdAt: 'now',
          updatedAt: 'now',
          completedAt: 'now',
          result: {
            type: 'rag_session_generation_result',
            request: { question: '动量守恒' },
            answer: makeRagV1AskResponse('完成'),
            visualizationStatus: 'ready',
            artifact: { id: 'artifact_1', type: 'rag_visualization', title: 'artifact' },
          },
        },
        events: [
          {
            type: 'answer_ready',
            jobId: 'job_1',
            runId: 'run_1',
            sequence: 1,
            createdAt: 'now',
            result: makeRagV1AskResponse('草稿'),
          },
          {
            type: 'artifact_ready',
            jobId: 'job_1',
            runId: 'run_1',
            sequence: 2,
            createdAt: 'now',
            artifact: { id: 'artifact_1', type: 'rag_visualization', title: 'artifact' },
          },
          {
            type: 'job_completed',
            jobId: 'job_1',
            runId: 'run_1',
            sequence: 3,
            createdAt: 'now',
            status: 'completed',
            result: {
              type: 'rag_session_generation_result',
              request: { question: '动量守恒' },
              answer: makeRagV1AskResponse('完成'),
              visualizationStatus: 'ready',
              artifact: { id: 'artifact_1', type: 'rag_visualization', title: 'artifact' },
            },
          },
        ],
      });
    }) as typeof fetch;

    const result = await resumeRagRunFromBrowser('run_1', {
      onAnswerReady: () => seenEvents.push('answer_ready'),
      onJobEvent: (event) => seenEvents.push(event.type),
    });

    assert.deepEqual(seenUrls, ['/api/v1/rag/runs/run_1']);
    assert.deepEqual(seenEvents, ['answer_ready', 'answer_ready', 'artifact_ready', 'job_completed']);
    const restored = result as typeof result & { visualization_status?: string; visualization_artifact?: unknown };
    assert.equal(restored.visualization_status, 'ready');
    assert.deepEqual(restored.visualization_artifact, { id: 'artifact_1', type: 'rag_visualization', title: 'artifact' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rag run client replays snapshot events before subscribing to a running root job', async () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];
  const seenEvents: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seenUrls.push(url);
      if (url === '/api/v1/rag/runs/run_1') {
        return Response.json({
          run: {
            runId: 'run_1',
            rootJobId: 'job_1',
            status: 'running',
            createdAt: 'now',
            updatedAt: 'now',
            childJobIds: [],
          },
          rootJob: {
            id: 'job_1',
            runId: 'run_1',
            type: 'rag_session_generation',
            status: 'running',
            inputSummary: {},
            createdAt: 'now',
            updatedAt: 'now',
          },
          events: [
            {
              type: 'answer_ready',
              jobId: 'job_1',
              runId: 'run_1',
              sequence: 1,
              createdAt: 'now',
              result: makeRagV1AskResponse('草稿'),
            },
          ],
        });
      }
      if (url === '/api/v1/generation-jobs/job_1/events') {
        const completedResult = JSON.stringify({
          type: 'rag_session_generation_result',
          request: { question: '动量守恒' },
          answer: makeRagV1AskResponse('完成'),
          visualizationStatus: 'ready',
          artifact: { id: 'artifact_1', type: 'rag_visualization', title: 'artifact' },
        });
        return new Response([
          'data: {"type":"artifact_ready","jobId":"job_1","runId":"run_1","sequence":2,"createdAt":"now","artifact":{"id":"artifact_1","type":"rag_visualization","title":"artifact"}}',
          '',
          `data: {"type":"job_completed","jobId":"job_1","runId":"run_1","sequence":3,"createdAt":"now","status":"completed","result":${completedResult}}`,
          '',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const result = await resumeRagRunFromBrowser('run_1', {
      onAnswerReady: () => seenEvents.push('answer_ready_callback'),
      onJobEvent: (event) => seenEvents.push(event.type),
    });

    assert.deepEqual(seenUrls, ['/api/v1/rag/runs/run_1', '/api/v1/generation-jobs/job_1/events']);
    assert.deepEqual(seenEvents, ['answer_ready', 'answer_ready_callback', 'artifact_ready', 'job_completed']);
    const restored = result as typeof result & { visualization_status?: string };
    assert.equal(restored.visualization_status, 'ready');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
