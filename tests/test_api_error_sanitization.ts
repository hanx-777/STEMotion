import assert from 'node:assert/strict';
import test from 'node:test';
import { POST as askPost } from '../src/app/api/v1/rag/ask/route';
import { POST as ragVisualizationPost } from '../src/app/api/v1/rag/visualization/generate/route';
import { jsonError } from '../src/platform/api/http';
import { AppError } from '../src/platform/errors';

test('jsonError returns route fallback for unknown errors without leaking raw messages', async () => {
  const response = jsonError(new Error('provider failed with sk-secret-value'), 'Safe fallback');
  const payload = await response.json() as { error: string; code: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Safe fallback');
  assert.equal(payload.code, 'REQUEST_FAILED');
  assert.equal(JSON.stringify(payload).includes('sk-secret-value'), false);
});

test('jsonError preserves public AppError messages and codes', async () => {
  const response = jsonError(
    new AppError('question is required', { status: 400, code: 'VALIDATION_ERROR' }),
    'Safe fallback',
  );
  const payload = await response.json() as { error: string; code: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'question is required');
  assert.equal(payload.code, 'VALIDATION_ERROR');
});

test('RAG route validation errors are public AppErrors', async () => {
  const response = await askPost(new Request('http://localhost/api/v1/rag/ask', {
    method: 'POST',
    body: JSON.stringify({ question: '' }),
  }));
  const payload = await response.json() as { error: string; code: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'question is required');
  assert.equal(payload.code, 'VALIDATION_ERROR');
});

test('RAG visualization route validation errors are public AppErrors', async () => {
  const response = await ragVisualizationPost(new Request('http://localhost/api/v1/rag/visualization/generate', {
    method: 'POST',
    body: JSON.stringify({ question: '题目', subject: '', taskType: 'step_solution' }),
  }));
  const payload = await response.json() as { error: string; code: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'subject is required');
  assert.equal(payload.code, 'VALIDATION_ERROR');
});
