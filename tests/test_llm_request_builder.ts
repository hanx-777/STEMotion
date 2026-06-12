import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LLM_REQUEST_PRESETS,
  buildAnthropicMessagesRequest,
  buildOpenAIChatRequest,
  resolveLlmRequestPolicy,
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
  // 002B: artifact reduced from 32768 to 18000 to cut 11-minute HTML generation
  assert.equal(artifact.maxTokens, 18000);
  assert.notEqual(artifact.maxTokens, 8192);
  assert.equal(LLM_REQUEST_PRESETS.reviewer.maxTokens, 16000);
});

test('MiMo anthropic-compatible auto policy disables thinking and preserves caller temperature', () => {
  const config = resolveLlmRequestConfig('reviewer');
  const policy = resolveLlmRequestPolicy({
    provider: 'anthropic',
    baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    model: 'mimo-v2.5-pro',
    config,
    thinkingMode: 'auto',
  });
  const request = buildAnthropicMessagesRequest({
    model: 'mimo-v2.5-pro',
    messages: [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'student question' },
    ],
    temperature: 0.2,
    config: policy.config,
    policy,
    requestPreset: 'reviewer',
  });

  assert.equal(request.body.model, 'mimo-v2.5-pro');
  assert.equal(request.body.max_tokens, 16000);
  assert.equal(request.body.stream, true);
  assert.equal(request.body.thinking, undefined);
  assert.equal(request.body.temperature, 0.2);
  assert.equal(request.body.system, 'system rules');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'student question' }]);
  assert.equal('maxTokens' in request.body, false);
  assert.equal(request.logPayload.requestStage, 'initial');
  assert.equal(request.logPayload.requestBodyFormat, 'anthropic-messages');
  assert.equal(request.logPayload.providerMaxTokensField, 'max_tokens');
  assert.equal(request.logPayload.normalizedMaxTokensField, 'maxTokens');
  assert.equal(request.logPayload.thinking, false);
  assert.equal(request.logPayload.temperature, 0.2);
  assert.equal(request.logPayload.requestPreset, 'reviewer');
  assert.equal(request.logPayload.policyReason, 'anthropic_compatible_thinking_disabled');
});

test('MiMo repair preset auto policy disables thinking and preserves repair temperature', () => {
  const config = resolveLlmRequestConfig('repair');
  const policy = resolveLlmRequestPolicy({
    provider: 'anthropic',
    baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic/v1',
    model: 'mimo-v2.5-pro',
    config,
    temperature: 0.1,
    thinkingMode: 'auto',
  });
  const request = buildAnthropicMessagesRequest({
    model: 'mimo-v2.5-pro',
    messages: [{ role: 'user', content: 'repair the active interaction state machine' }],
    temperature: 0.1,
    config: policy.config,
    policy,
    requestPreset: 'repair',
  });

  // 002B: repair increased to 24000 to balance quality vs speed
  assert.equal(request.body.max_tokens, LLM_REQUEST_PRESETS.repair.maxTokens);
  assert.equal(request.body.stream, true);
  assert.equal(request.body.thinking, undefined);
  assert.equal(request.body.temperature, 0.1);
  assert.equal(request.logPayload.requestPreset, 'repair');
  assert.equal(request.logPayload.thinking, false);
  assert.equal(request.logPayload.temperature, 0.1);
  assert.equal(request.logPayload.policyReason, 'anthropic_compatible_thinking_disabled');
  assert.equal(request.logPayload.thinkingMode, 'auto');
});

test('official Claude auto policy keeps thinking enabled', () => {
  const config = resolveLlmRequestConfig('reviewer');
  const policy = resolveLlmRequestPolicy({
    provider: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-opus-4-1',
    config,
    thinkingMode: 'auto',
  });
  const request = buildAnthropicMessagesRequest({
    model: 'claude-opus-4-1',
    messages: [{ role: 'user', content: 'review this answer' }],
    temperature: 0.2,
    config: policy.config,
    policy,
    requestPreset: 'reviewer',
  });

  assert.deepEqual(request.body.thinking, { type: 'enabled', budget_tokens: config.thinkingBudgetTokens });
  assert.equal(request.body.temperature, 1);
  assert.equal(request.logPayload.thinking, true);
  assert.equal(request.logPayload.temperature, 1);
  assert.equal(request.logPayload.policyReason, 'official_anthropic_thinking');
});

test('LLM thinking override forces policy on and off', () => {
  const config = resolveLlmRequestConfig('artifact');
  const forcedOn = resolveLlmRequestPolicy({
    provider: 'anthropic',
    baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    model: 'mimo-v2.5-pro',
    config,
    thinkingMode: 'on',
  });
  const forcedOff = resolveLlmRequestPolicy({
    provider: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-opus-4-1',
    config,
    thinkingMode: 'off',
  });

  assert.equal(forcedOn.config.thinking, true);
  assert.equal(forcedOn.policyReason, 'thinking_override_on');
  assert.equal(forcedOff.config.thinking, false);
  assert.equal(forcedOff.policyReason, 'thinking_override_off');
  // 002B: artifact maxTokens is now 18000
  assert.equal(forcedOn.config.maxTokens, LLM_REQUEST_PRESETS.artifact.maxTokens);
  assert.equal(forcedOff.config.maxTokens, LLM_REQUEST_PRESETS.artifact.maxTokens);
});

test('OpenAI policy does not force Anthropic thinking temperature', () => {
  const config = resolveLlmRequestConfig('artifact');
  const policy = resolveLlmRequestPolicy({
    provider: 'openai',
    baseURL: 'https://openai-compatible.test/v1',
    model: 'gpt-compatible',
    config,
    temperature: 0.2,
    thinkingMode: 'auto',
  });

  assert.equal(policy.policyReason, 'provider_not_anthropic');
  assert.equal(policy.temperature, 0.2);
  assert.equal(policy.config.maxTokens, LLM_REQUEST_PRESETS.artifact.maxTokens);
});

test('OpenAI-compatible adapter performs provider downgrade in one place', () => {
  const config = resolveLlmRequestConfig('artifact');
  const request = buildOpenAIChatRequest({
    model: 'gpt-compatible',
    messages: [{ role: 'user', content: 'build a widget' }],
    temperature: 0.2,
    config,
    requestPreset: 'artifact',
  });

  assert.equal(request.body.max_tokens, LLM_REQUEST_PRESETS.artifact.maxTokens);
  assert.equal(request.body.stream, false);
  assert.equal(request.logPayload.requestStage, 'provider_adapter_downgrade');
  assert.equal(request.logPayload.requestBodyFormat, 'openai-chat-completions');
  assert.equal(request.logPayload.providerMaxTokensField, 'max_tokens');
  assert.equal(request.logPayload.normalizedMaxTokensField, 'maxTokens');
  assert.equal(request.logPayload.stream, false);
  assert.equal(request.logPayload.thinking, false);
  assert.equal(request.logPayload.temperature, 0.2);
  assert.equal(request.logPayload.requestPreset, 'artifact');
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
    requestPreset: 'artifact',
    logContext: {
      requestStage: 'stream_fallback',
      reason: 'stream_fallback',
      fallbackStage: 'stream',
    },
  });

  assert.equal(request.body.max_tokens, LLM_REQUEST_PRESETS.artifact.maxTokens);
  assert.equal(request.body.stream, false);
  assert.equal(request.logPayload.requestStage, 'stream_fallback');
  assert.equal(request.logPayload.reason, 'stream_fallback');
  assert.equal(request.logPayload.fallbackStage, 'stream');
  assert.equal(request.logPayload.thinking, true);
  assert.equal(request.logPayload.requestPreset, 'artifact');
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

test('Anthropic adapter log payload can identify empty-text fallback requests', () => {
  const config = { ...resolveLlmRequestConfig('repair'), stream: false, thinking: false };
  const policy = resolveLlmRequestPolicy({
    provider: 'anthropic',
    baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    model: 'mimo-v2.5-pro',
    config: resolveLlmRequestConfig('repair'),
    temperature: 0.1,
    thinkingMode: 'auto',
  });
  const request = buildAnthropicMessagesRequest({
    model: 'mimo-v2.5-pro',
    messages: [{ role: 'user', content: 'retry without streaming' }],
    temperature: 0.1,
    config,
    policy: { ...policy, config, temperature: 0.1 },
    requestPreset: 'repair',
    logContext: {
      requestStage: 'empty_text_fallback',
      reason: 'empty_text_fallback',
      fallbackStage: 'empty_text',
    },
  });

  assert.equal(request.body.max_tokens, LLM_REQUEST_PRESETS.repair.maxTokens);
  assert.equal(request.body.stream, false);
  assert.equal(request.body.thinking, undefined);
  assert.equal(request.body.temperature, 0.1);
  assert.equal(request.logPayload.requestStage, 'empty_text_fallback');
  assert.equal(request.logPayload.reason, 'empty_text_fallback');
  assert.equal(request.logPayload.fallbackStage, 'empty_text');
  assert.equal(request.logPayload.requestPreset, 'repair');
  assert.equal(request.logPayload.thinking, false);
  assert.equal(request.logPayload.policyReason, 'anthropic_compatible_thinking_disabled');
});
