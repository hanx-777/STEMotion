import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { attributeAskError } from '../src/features/rag/state/ragAskErrorAttribution';

test('LlmTruncationError is attributed to the visualization stage', () => {
  const err = Object.assign(new Error('模型输出被截断'), {
    name: 'LlmTruncationError',
    outputTokens: 4000,
    maxTokens: 4000,
    partialContent: '<html>partial',
  });
  const result = attributeAskError(err);
  assert.equal(result.stageId, 'visualization');
  assert.ok(result.userMessage.includes('可视化'), `expected "可视化" in: ${result.userMessage}`);
});

test('plain network errors stay attributed to the running stage', () => {
  const err = new TypeError('Failed to fetch');
  const result = attributeAskError(err);
  assert.equal(result.stageId, null);
  assert.equal(result.userMessage, 'Failed to fetch');
});

test('non-Error values fall back to a generic message', () => {
  const result = attributeAskError('boom');
  assert.equal(result.stageId, null);
  assert.equal(result.userMessage, '问答请求失败');
});

test('error attribution helper stays client-safe and does not import the server LLM client', async () => {
  const source = await readFile(join(process.cwd(), 'src/features/rag/state/ragAskErrorAttribution.ts'), 'utf-8');
  assert.doesNotMatch(source, /@\/lib\/generation\/llmClient/);
  assert.doesNotMatch(source, /\bfrom\s+['"]fs(?:\/promises)?['"]/);
});
