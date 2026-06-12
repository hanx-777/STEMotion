import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  clearProfilesCache,
  generateWithConfiguredModel,
} from '../src/lib/generation/llmClient';
import { runWithGenerationTraceContext } from '../src/lib/generation/trace';
import type { ModelProfilesFile } from '../src/lib/generation/modelProfiles';

test('configured LLM telemetry records stage, preset, token policy, output tokens, and retry count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-llm-telemetry-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousThinkingMode = process.env.STEMOTION_LLM_THINKING;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const logs: string[] = [];

  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        timeout: 5_000,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    delete process.env.STEMOTION_LLM_THINKING;
    clearProfilesCache();
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    globalThis.fetch = (async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(requestBody.temperature, 0.2);
      assert.equal(requestBody.thinking, undefined);
      return new Response([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":11}}}',
      '',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}',
      '',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}',
      '',
      '',
    ].join('\n'));
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'telemetry check' }],
      requestPreset: 'reviewer',
      metadata: {
        stage: 'telemetry_test',
        promptVersion: 'telemetry-v1',
      },
    });

    assert.equal(result, 'hello');
    const telemetryLine = logs.find((line) => line.includes('LLM telemetry'));
    assert.ok(telemetryLine, 'expected an LLM telemetry log line');
    assert.match(telemetryLine, /"stage":"telemetry_test"/);
    assert.match(telemetryLine, /"preset":"reviewer"/);
    assert.match(telemetryLine, /"maxTokens":16000/);
    assert.match(telemetryLine, /"thinking":false/);
    assert.match(telemetryLine, /"temperature":0\.2/);
    assert.match(telemetryLine, /"policyReason":"anthropic_compatible_thinking_disabled"/);
    assert.match(telemetryLine, /"outputTokens":7/);
    assert.match(telemetryLine, /"visibleCharsPerOutputToken":0\.714/);
    assert.match(telemetryLine, /"retryCount":0/);
  } finally {
    console.log = originalConsoleLog;
    globalThis.fetch = originalFetch;
    if (previousProfilePath === undefined) {
      delete process.env.STEMOTION_MODEL_PROFILES_PATH;
    } else {
      process.env.STEMOTION_MODEL_PROFILES_PATH = previousProfilePath;
    }
    if (previousThinkingMode === undefined) {
      delete process.env.STEMOTION_LLM_THINKING;
    } else {
      process.env.STEMOTION_LLM_THINKING = previousThinkingMode;
    }
    clearProfilesCache();
    await rm(dir, { recursive: true, force: true });
  }
});

test('configured LLM telemetry records role profile routing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-llm-role-routing-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousArtifactProfile = process.env.STEMOTION_LLM_PROFILE_ARTIFACT;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const logs: string[] = [];

  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        timeout: 5_000,
      },
      'deepseek-artifact': {
        label: 'DeepSeek Artifact',
        provider: 'openai',
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test-deepseek',
        model: 'deepseek-chat',
        timeout: 5_000,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    process.env.STEMOTION_LLM_PROFILE_ARTIFACT = 'deepseek-artifact';
    clearProfilesCache();
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    globalThis.fetch = (async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(requestBody.model, 'deepseek-chat');
      return Response.json({
        choices: [{ message: { content: '<html></html>' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      });
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'build artifact' }],
      requestPreset: 'artifact',
      profileRole: 'artifact',
      metadata: {
        stage: 'role_routing_test',
        promptVersion: 'role-routing-v1',
      },
    });

    assert.equal(result, '<html></html>');
    const requestLine = logs.find((line) => line.includes('Request →'));
    const telemetryLine = logs.find((line) => line.includes('LLM telemetry'));
    assert.ok(requestLine, 'expected an LLM request log line');
    assert.ok(telemetryLine, 'expected an LLM telemetry log line');
    assert.match(requestLine, /"profileRole":"artifact"/);
    assert.match(requestLine, /"profileId":"deepseek-artifact"/);
    assert.match(telemetryLine, /"profileRole":"artifact"/);
    assert.match(telemetryLine, /"profileId":"deepseek-artifact"/);
    assert.match(telemetryLine, /"model":"deepseek-chat"/);
  } finally {
    console.log = originalConsoleLog;
    globalThis.fetch = originalFetch;
    if (previousProfilePath === undefined) {
      delete process.env.STEMOTION_MODEL_PROFILES_PATH;
    } else {
      process.env.STEMOTION_MODEL_PROFILES_PATH = previousProfilePath;
    }
    if (previousArtifactProfile === undefined) {
      delete process.env.STEMOTION_LLM_PROFILE_ARTIFACT;
    } else {
      process.env.STEMOTION_LLM_PROFILE_ARTIFACT = previousArtifactProfile;
    }
    clearProfilesCache();
    await rm(dir, { recursive: true, force: true });
  }
});

test('STEMOTION_LLM_THINKING=on forces MiMo thinking for A/B diagnostics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-llm-thinking-on-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousThinkingMode = process.env.STEMOTION_LLM_THINKING;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const logs: string[] = [];

  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        timeout: 5_000,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    process.env.STEMOTION_LLM_THINKING = 'on';
    clearProfilesCache();
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    globalThis.fetch = (async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(requestBody.temperature, 1);
      assert.deepEqual(requestBody.thinking, { type: 'enabled', budget_tokens: 2048 });
      return new Response([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":3}}}',
        '',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}',
        '',
        '',
      ].join('\n'));
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'thinking override check' }],
      requestPreset: 'reviewer',
      metadata: {
        stage: 'thinking_override_test',
        promptVersion: 'telemetry-thinking-on-v1',
      },
    });

    assert.equal(result, 'ok');
    const requestLine = logs.find((line) => line.includes('Request →'));
    const telemetryLine = logs.find((line) => line.includes('LLM telemetry'));
    assert.ok(requestLine, 'expected an LLM request log line');
    assert.ok(telemetryLine, 'expected an LLM telemetry log line');
    assert.match(requestLine, /"thinking":true/);
    assert.match(requestLine, /"temperature":1/);
    assert.match(requestLine, /"requestPreset":"reviewer"/);
    assert.match(requestLine, /"policyReason":"thinking_override_on"/);
    assert.match(telemetryLine, /"thinking":true/);
    assert.match(telemetryLine, /"temperature":1/);
    assert.match(telemetryLine, /"policyReason":"thinking_override_on"/);
  } finally {
    console.log = originalConsoleLog;
    globalThis.fetch = originalFetch;
    if (previousProfilePath === undefined) {
      delete process.env.STEMOTION_MODEL_PROFILES_PATH;
    } else {
      process.env.STEMOTION_MODEL_PROFILES_PATH = previousProfilePath;
    }
    if (previousThinkingMode === undefined) {
      delete process.env.STEMOTION_LLM_THINKING;
    } else {
      process.env.STEMOTION_LLM_THINKING = previousThinkingMode;
    }
    clearProfilesCache();
    await rm(dir, { recursive: true, force: true });
  }
});

test('repair telemetry records effective MiMo policy and repair temperature', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-llm-repair-telemetry-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousThinkingMode = process.env.STEMOTION_LLM_THINKING;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const logs: string[] = [];

  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        timeout: 5_000,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    delete process.env.STEMOTION_LLM_THINKING;
    clearProfilesCache();
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    globalThis.fetch = (async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(requestBody.stream, true);
      assert.equal(requestBody.temperature, 0.1);
      assert.equal(requestBody.thinking, undefined);
      assert.equal(requestBody.max_tokens, 32768);
      return new Response([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":17}}}',
        '',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"<html>fixed</html>"}}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}',
        '',
        '',
      ].join('\n'));
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'repair telemetry check' }],
      temperature: 0.1,
      requestPreset: 'repair',
      metadata: {
        stage: 'html_repair',
        promptVersion: 'repair-telemetry-v1',
      },
    });

    assert.equal(result, '<html>fixed</html>');
    const requestLine = logs.find((line) => line.includes('Request →'));
    const telemetryLine = logs.find((line) => line.includes('LLM telemetry'));
    assert.ok(requestLine, 'expected an LLM request log line');
    assert.ok(telemetryLine, 'expected an LLM telemetry log line');
    assert.match(requestLine, /"requestPreset":"repair"/);
    assert.match(requestLine, /"thinking":false/);
    assert.match(requestLine, /"temperature":0\.1/);
    assert.match(requestLine, /"policyReason":"anthropic_compatible_thinking_disabled"/);
    assert.match(requestLine, /"thinkingMode":"auto"/);
    assert.match(telemetryLine, /"stage":"html_repair"/);
    assert.match(telemetryLine, /"preset":"repair"/);
    assert.match(telemetryLine, /"thinking":false/);
    assert.match(telemetryLine, /"temperature":0\.1/);
    assert.match(telemetryLine, /"policyReason":"anthropic_compatible_thinking_disabled"/);
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    if (previousProfilePath === undefined) {
      delete process.env.STEMOTION_MODEL_PROFILES_PATH;
    } else {
      process.env.STEMOTION_MODEL_PROFILES_PATH = previousProfilePath;
    }
    if (previousThinkingMode === undefined) {
      delete process.env.STEMOTION_LLM_THINKING;
    } else {
      process.env.STEMOTION_LLM_THINKING = previousThinkingMode;
    }
    clearProfilesCache();
    await rm(dir, { recursive: true, force: true });
  }
});

test('Anthropic streaming empty text retries once without streaming and records fallback stage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-llm-empty-stream-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousThinkingMode = process.env.STEMOTION_LLM_THINKING;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const logs: string[] = [];
  let fetchCount = 0;

  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        timeout: 5_000,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    delete process.env.STEMOTION_LLM_THINKING;
    clearProfilesCache();
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    globalThis.fetch = (async (_input, init) => {
      fetchCount += 1;
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      if (fetchCount === 1) {
        assert.equal(requestBody.stream, true);
        assert.equal(requestBody.temperature, 0.1);
        assert.equal(requestBody.thinking, undefined);
        return new Response([
          'data: {"type":"message_start","message":{"usage":{"input_tokens":13}}}',
          '',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}',
          '',
          '',
        ].join('\n'));
      }

      assert.equal(fetchCount, 2);
      assert.equal(requestBody.stream, false);
      assert.equal(requestBody.temperature, 0.1);
      assert.equal(requestBody.thinking, undefined);
      assert.equal(requestBody.max_tokens, 32768);
      return Response.json({
        stop_reason: 'end_turn',
        usage: { input_tokens: 13, output_tokens: 6 },
        content: [{ type: 'text', text: '<html>fallback</html>' }],
      });
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'empty stream fallback check' }],
      temperature: 0.1,
      requestPreset: 'repair',
      metadata: {
        stage: 'html_repair',
        promptVersion: 'empty-stream-fallback-v1',
      },
    });

    assert.equal(result, '<html>fallback</html>');
    assert.equal(fetchCount, 2);
    const fallbackRequestLine = logs.find((line) => line.includes('Request →') && line.includes('"requestStage":"empty_text_fallback"'));
    const telemetryLine = logs.find((line) => line.includes('LLM telemetry') && line.includes('"fallbackStage":"empty_text"'));
    assert.ok(fallbackRequestLine, 'expected an empty-text fallback request log line');
    assert.ok(telemetryLine, 'expected telemetry for the empty-text fallback response');
    assert.match(fallbackRequestLine, /"stream":false/);
    assert.match(fallbackRequestLine, /"thinking":false/);
    assert.match(fallbackRequestLine, /"temperature":0\.1/);
    assert.match(fallbackRequestLine, /"requestPreset":"repair"/);
    assert.match(fallbackRequestLine, /"policyReason":"anthropic_compatible_thinking_disabled"/);
    assert.match(fallbackRequestLine, /"fallbackStage":"empty_text"/);
    assert.match(telemetryLine, /"fallbackStage":"empty_text"/);
    assert.match(telemetryLine, /"thinking":false/);
    assert.match(telemetryLine, /"temperature":0\.1/);
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    if (previousProfilePath === undefined) {
      delete process.env.STEMOTION_MODEL_PROFILES_PATH;
    } else {
      process.env.STEMOTION_MODEL_PROFILES_PATH = previousProfilePath;
    }
    if (previousThinkingMode === undefined) {
      delete process.env.STEMOTION_LLM_THINKING;
    } else {
      process.env.STEMOTION_LLM_THINKING = previousThinkingMode;
    }
    clearProfilesCache();
    await rm(dir, { recursive: true, force: true });
  }
});

test('Anthropic-compatible streaming parser accepts content_block_start text', async () => {
  await withMimoProfile('stemotion-llm-content-block-start-', async ({ logs }) => {
    let fetchCount = 0;
    globalThis.fetch = (async (_input, init) => {
      fetchCount += 1;
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(requestBody.stream, true);
      assert.equal(requestBody.thinking, undefined);
      return new Response([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":21}}}',
        '',
        'data: {"type":"content_block_start","content_block":{"type":"text","text":"<html>from start</html>"}}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}',
        '',
        '',
      ].join('\n'));
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'content block start compatibility' }],
      requestPreset: 'artifact',
      metadata: {
        stage: 'rag_widget_html',
        promptVersion: 'content-block-start-v1',
      },
    });

    assert.equal(result, '<html>from start</html>');
    assert.equal(fetchCount, 1);
    assert.ok(logs.some((line) => line.includes('"requestPreset":"artifact"')));
  });
});

test('Anthropic-compatible streaming parser accepts OpenAI-style delta content', async () => {
  await withMimoProfile('stemotion-llm-openai-delta-', async () => {
    let fetchCount = 0;
    globalThis.fetch = (async (_input, init) => {
      fetchCount += 1;
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(requestBody.stream, true);
      assert.equal(requestBody.thinking, undefined);
      return new Response([
        'data: {"choices":[{"delta":{"content":"<html>"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"openai style</html>"},"finish_reason":"stop"}],"usage":{"completion_tokens":9,"prompt_tokens":15}}',
        '',
        '',
      ].join('\n'));
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'openai delta compatibility' }],
      requestPreset: 'artifact',
      metadata: {
        stage: 'rag_widget_html',
        promptVersion: 'openai-delta-v1',
      },
    });

    assert.equal(result, '<html>openai style</html>');
    assert.equal(fetchCount, 1);
  });
});

test('Anthropic-compatible fallback parser accepts non-stream content string', async () => {
  await withMimoProfile('stemotion-llm-content-string-', async () => {
    let fetchCount = 0;
    globalThis.fetch = (async (_input, init) => {
      fetchCount += 1;
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      if (fetchCount === 1) {
        assert.equal(requestBody.stream, true);
        return new Response([
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}',
          '',
          '',
        ].join('\n'));
      }

      assert.equal(requestBody.stream, false);
      return Response.json({
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 7 },
        content: '<html>string fallback</html>',
      });
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'content string compatibility' }],
      requestPreset: 'artifact',
      metadata: {
        stage: 'rag_widget_html',
        promptVersion: 'content-string-v1',
      },
    });

    assert.equal(result, '<html>string fallback</html>');
    assert.equal(fetchCount, 2);
  });
});

test('Anthropic-compatible fallback parser accepts non-stream choices message content', async () => {
  await withMimoProfile('stemotion-llm-choices-message-', async () => {
    let fetchCount = 0;
    globalThis.fetch = (async (_input, init) => {
      fetchCount += 1;
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      if (fetchCount === 1) {
        assert.equal(requestBody.stream, true);
        return new Response([
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}',
          '',
          '',
        ].join('\n'));
      }

      assert.equal(requestBody.stream, false);
      return Response.json({
        choices: [{ message: { content: '<html>choices fallback</html>' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      });
    }) as typeof fetch;

    const result = await generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'choices message compatibility' }],
      requestPreset: 'artifact',
      metadata: {
        stage: 'rag_widget_html',
        promptVersion: 'choices-message-v1',
      },
    });

    assert.equal(result, '<html>choices fallback</html>');
    assert.equal(fetchCount, 2);
  });
});

test('Anthropic-compatible empty text diagnostics describe payload shape without leaking prompt or HTML', async () => {
  await withMimoProfile('stemotion-llm-empty-diagnostics-', async ({ logs }) => {
    let fetchCount = 0;
    globalThis.fetch = (async (_input, init) => {
      fetchCount += 1;
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const bodyText = JSON.stringify(requestBody);
      assert.match(bodyText, /SECRET_PROMPT_SHOULD_NOT_LEAK/);

      if (fetchCount === 1) {
        return new Response([
          'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}',
          '',
          'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"PRIVATE_THINKING_SHOULD_NOT_LEAK"}}',
          '',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}',
          '',
          '',
        ].join('\n'));
      }

      return Response.json({
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 4 },
        content: [{ type: 'thinking', thinking: 'PRIVATE_THINKING_SHOULD_NOT_LEAK' }],
      });
    }) as typeof fetch;

    await assert.rejects(
      generateWithConfiguredModel({
        messages: [{ role: 'user', content: 'SECRET_PROMPT_SHOULD_NOT_LEAK' }],
        requestPreset: 'artifact',
        metadata: {
          stage: 'rag_widget_html',
          promptVersion: 'empty-diagnostics-v1',
        },
      }),
      /模型返回为空/,
    );

    assert.equal(fetchCount, 2);
    const diagnosticLines = logs.filter((line) => line.includes('Anthropic returned no text content'));
    assert.ok(diagnosticLines.length >= 2, 'expected diagnostics for stream and non-stream empty responses');
    assert.ok(diagnosticLines.some((line) => line.includes('"requestStage":"initial"')));
    assert.ok(diagnosticLines.some((line) => line.includes('"requestStage":"empty_text_fallback"')));
    assert.ok(diagnosticLines.some((line) => line.includes('"eventTypes":["message_start","content_block_delta","message_delta"]')));
    assert.ok(diagnosticLines.some((line) => line.includes('"contentBlockTypes":["thinking"]')));
    assert.doesNotMatch(logs.join('\n'), /SECRET_PROMPT_SHOULD_NOT_LEAK/);
    assert.doesNotMatch(logs.join('\n'), /PRIVATE_THINKING_SHOULD_NOT_LEAK/);
  });
});

test('Anthropic-compatible empty text writes trace entries for stream and fallback failures', async () => {
  await withMimoProfile('stemotion-llm-empty-trace-', async () => {
    const traceEntries: Array<Record<string, unknown>> = [];
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response([
          'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}',
          '',
          'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"PRIVATE_THINKING_SHOULD_NOT_LEAK"}}',
          '',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}',
          '',
          '',
        ].join('\n'));
      }

      return Response.json({
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 4 },
        content: [{ type: 'thinking', thinking: 'PRIVATE_THINKING_SHOULD_NOT_LEAK' }],
      });
    }) as typeof fetch;

    await assert.rejects(
      runWithGenerationTraceContext(
        {
          jobId: 'job_trace_empty_123456',
          jobType: 'rag_visualization',
          startedAtMs: Date.now(),
          write: (entry) => {
            traceEntries.push(entry as unknown as Record<string, unknown>);
          },
        },
        () => generateWithConfiguredModel({
          messages: [{ role: 'user', content: 'SECRET_PROMPT_SHOULD_NOT_LEAK' }],
          requestPreset: 'artifact',
          metadata: {
            stage: 'rag_widget_html',
            promptVersion: 'empty-trace-v1',
          },
        }),
      ),
      /模型返回为空/,
    );

    assert.equal(fetchCount, 2);
    assert.ok(traceEntries.some((entry) => entry.event === 'llm_request'
      && (entry.summary as Record<string, unknown>)?.requestStage === 'initial'));
    assert.ok(traceEntries.some((entry) => entry.event === 'llm_fallback'
      && (entry.summary as Record<string, unknown>)?.fallbackStage === 'empty_text'));
    assert.ok(traceEntries.some((entry) => entry.event === 'llm_request'
      && (entry.summary as Record<string, unknown>)?.requestStage === 'empty_text_fallback'));
    const emptyEntries = traceEntries.filter((entry) => entry.event === 'llm_empty_text');
    assert.equal(emptyEntries.length, 2);
    assert.ok(emptyEntries.some((entry) => (entry.diagnostics as Record<string, unknown>)?.stream === true));
    assert.ok(emptyEntries.some((entry) => (entry.diagnostics as Record<string, unknown>)?.stream === false));
    const rawTrace = JSON.stringify(traceEntries);
    assert.match(rawTrace, /content_block_delta/);
    assert.match(rawTrace, /thinking/);
    assert.equal(rawTrace.includes('SECRET_PROMPT_SHOULD_NOT_LEAK'), false);
    assert.equal(rawTrace.includes('PRIVATE_THINKING_SHOULD_NOT_LEAK'), false);
  });
});

async function withMimoProfile(
  tempPrefix: string,
  run: (ctx: { logs: string[] }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), tempPrefix));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousThinkingMode = process.env.STEMOTION_LLM_THINKING;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const logs: string[] = [];

  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        timeout: 5_000,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    delete process.env.STEMOTION_LLM_THINKING;
    clearProfilesCache();
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    await run({ logs });
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    if (previousProfilePath === undefined) {
      delete process.env.STEMOTION_MODEL_PROFILES_PATH;
    } else {
      process.env.STEMOTION_MODEL_PROFILES_PATH = previousProfilePath;
    }
    if (previousThinkingMode === undefined) {
      delete process.env.STEMOTION_LLM_THINKING;
    } else {
      process.env.STEMOTION_LLM_THINKING = previousThinkingMode;
    }
    clearProfilesCache();
    await rm(dir, { recursive: true, force: true });
  }
}
