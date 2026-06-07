import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LLM_REQUEST_PRESETS,
  buildAnthropicMessagesRequest,
  buildOpenAIChatRequest,
  resolveLlmRequestConfig,
} from '../src/lib/generation/llmRequestBuilder';

test('LLM request presets centralize default generation policy', () => {
  const defaults = resolveLlmRequestConfig();
  const reviewer = resolveLlmRequestConfig('reviewer');
  const artifact = resolveLlmRequestConfig('artifact');

  assert.equal(defaults.stream, true);
  assert.equal(defaults.thinking, true);
  assert.equal(defaults.maxTokens, 24000);
  assert.equal(reviewer.maxTokens, 16000);
  assert.equal(reviewer.stream, true);
  assert.equal(reviewer.thinking, true);
  assert.notEqual(reviewer.maxTokens, 8192);
  assert.equal(artifact.maxTokens, 32768);
  assert.notEqual(artifact.maxTokens, 8192);
  assert.equal(LLM_REQUEST_PRESETS.reviewer.maxTokens, 16000);
});

test('Anthropic adapter maps the single internal request shape to Messages API fields', () => {
  const config = resolveLlmRequestConfig('reviewer');
  const request = buildAnthropicMessagesRequest({
    model: 'mimo-v2.5-pro',
    messages: [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'student question' },
    ],
    temperature: 0.2,
    config,
  });

  assert.equal(request.body.model, 'mimo-v2.5-pro');
  assert.equal(request.body.max_tokens, 16000);
  assert.equal(request.body.stream, true);
  assert.deepEqual(request.body.thinking, { type: 'enabled', budget_tokens: config.thinkingBudgetTokens });
  assert.equal(request.body.system, 'system rules');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'student question' }]);
  assert.equal('maxTokens' in request.body, false);
  assert.equal(request.logPayload.requestStage, 'initial');
  assert.equal(request.logPayload.requestBodyFormat, 'anthropic-messages');
  assert.equal(request.logPayload.providerMaxTokensField, 'max_tokens');
  assert.equal(request.logPayload.normalizedMaxTokensField, 'maxTokens');
  assert.equal(request.logPayload.thinking, true);
});

test('OpenAI-compatible adapter performs provider downgrade in one place', () => {
  const config = resolveLlmRequestConfig('artifact');
  const request = buildOpenAIChatRequest({
    model: 'gpt-compatible',
    messages: [{ role: 'user', content: 'build a widget' }],
    temperature: 0.2,
    config,
  });

  assert.equal(request.body.max_tokens, 32768);
  assert.equal(request.body.stream, false);
  assert.equal(request.logPayload.requestStage, 'provider_adapter_downgrade');
  assert.equal(request.logPayload.requestBodyFormat, 'openai-chat-completions');
  assert.equal(request.logPayload.providerMaxTokensField, 'max_tokens');
  assert.equal(request.logPayload.normalizedMaxTokensField, 'maxTokens');
  assert.equal(request.logPayload.stream, false);
  assert.equal(request.logPayload.thinking, false);
  assert.equal(request.logPayload.reason, 'provider_capability_downgrade');
  assert.equal(request.logPayload.downgrade, 'openai-compatible-adapter');
});

test('Anthropic adapter log payload can identify stream fallback requests', () => {
  const config = { ...resolveLlmRequestConfig('artifact'), stream: false };
  const request = buildAnthropicMessagesRequest({
    model: 'claude-compatible',
    messages: [{ role: 'user', content: 'build a widget' }],
    temperature: 0.2,
    config,
    logContext: {
      requestStage: 'stream_fallback',
      reason: 'stream_fallback',
      fallbackStage: 'stream',
    },
  });

  assert.equal(request.body.max_tokens, 32768);
  assert.equal(request.body.stream, false);
  assert.equal(request.logPayload.requestStage, 'stream_fallback');
  assert.equal(request.logPayload.reason, 'stream_fallback');
  assert.equal(request.logPayload.fallbackStage, 'stream');
  assert.equal(request.logPayload.thinking, true);
});

test('Anthropic adapter log payload can identify thinking fallback requests', () => {
  const config = { ...resolveLlmRequestConfig('reviewer'), stream: false, thinking: false };
  const request = buildAnthropicMessagesRequest({
    model: 'claude-compatible',
    messages: [{ role: 'user', content: 'review this answer' }],
    temperature: 0.2,
    config,
    logContext: {
      requestStage: 'thinking_fallback',
      reason: 'thinking_fallback',
      fallbackStage: 'thinking',
    },
  });

  assert.equal(request.body.max_tokens, 16000);
  assert.equal(request.body.stream, false);
  assert.equal(request.body.thinking, undefined);
  assert.equal(request.logPayload.requestStage, 'thinking_fallback');
  assert.equal(request.logPayload.reason, 'thinking_fallback');
  assert.equal(request.logPayload.fallbackStage, 'thinking');
  assert.equal(request.logPayload.thinking, false);
});
