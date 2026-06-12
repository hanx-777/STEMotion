import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordGenerationTrace,
  runWithGenerationTraceContext,
  sanitizeTraceValue,
} from '../src/lib/generation/trace';

test('trace sanitizer redacts secrets and summarizes prompt-like fields', () => {
  const prompt = 'Explain projectile motion with detailed HTML requirements. '.repeat(8);
  const html = '<html><body><script>const token = "SHOULD_NOT_LEAK";</script></body></html>';
  const sanitized = sanitizeTraceValue({
    apiKey: 'sk-secret-value',
    authorization: 'Bearer private-token',
    prompt,
    html,
    currentHtml: html,
    nested: {
      cookie: 'session=private',
      model: 'mimo-v2.5-pro',
      longText: 'x'.repeat(260),
    },
  }) as Record<string, unknown>;
  const raw = JSON.stringify(sanitized);

  assert.equal(sanitized.apiKey, '[redacted]');
  assert.equal(sanitized.authorization, '[redacted]');
  assert.equal(raw.includes('sk-secret-value'), false);
  assert.equal(raw.includes('private-token'), false);
  assert.equal(raw.includes('SHOULD_NOT_LEAK'), false);
  assert.match(raw, /promptLength/);
  assert.match(raw, /promptPreview/);
  assert.match(raw, /htmlLength/);
  assert.match(raw, /htmlPreview/);
  assert.match(raw, /currentHtmlLength/);
  assert.match(raw, /mimo-v2\.5-pro/);
  assert.equal(raw.includes('x'.repeat(240)), false);
});

test('generation trace context stamps sanitized entries', async () => {
  const entries: unknown[] = [];

  await runWithGenerationTraceContext(
    {
      jobId: 'job_trace_123456789abc',
      jobType: 'rag_visualization',
      startedAtMs: Date.now() - 25,
      write: (entry) => {
        entries.push(entry);
      },
    },
    async () => {
      recordGenerationTrace({
        event: 'llm_request',
        stage: 'rag_widget_html',
        summary: {
          requestPreset: 'artifact',
          apiKey: 'sk-secret',
          prompt: 'SECRET_PROMPT_SHOULD_NOT_LEAK',
        },
        diagnostics: {
          payloadShape: ['type:string'],
          html: '<html>SECRET_HTML_SHOULD_NOT_LEAK</html>',
        },
      });
    },
  );

  assert.equal(entries.length, 1);
  const entry = entries[0] as Record<string, unknown>;
  const raw = JSON.stringify(entry);
  assert.equal(entry.jobId, 'job_trace_123456789abc');
  assert.equal(entry.jobType, 'rag_visualization');
  assert.equal(entry.event, 'llm_request');
  assert.equal(entry.stage, 'rag_widget_html');
  assert.equal(typeof entry.timestamp, 'string');
  assert.equal(typeof entry.elapsedMs, 'number');
  assert.equal(raw.includes('sk-secret'), false);
  assert.equal(raw.includes('SECRET_PROMPT_SHOULD_NOT_LEAK'), false);
  assert.equal(raw.includes('SECRET_HTML_SHOULD_NOT_LEAK'), false);
  assert.match(raw, /payloadShape/);
});
