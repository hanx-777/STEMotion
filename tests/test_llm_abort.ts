import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import {
  clearProfilesCache,
  generateWithConfiguredModel,
} from '../src/lib/generation/llmClient';
import type { ModelProfilesFile } from '../src/lib/generation/modelProfiles';

test('configured LLM calls forward external abort signals to provider fetch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-llm-abort-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let providerSignal: AbortSignal | undefined;
  let providerApiKey: string | null = null;
  const previousClaudeKey = process.env.STEMOTION_CLAUDE_MAIN_API_KEY;

  const profiles: ModelProfilesFile = {
    activeProfile: 'claude-main',
    profiles: {
      'claude-main': {
        label: 'Claude Main',
        provider: 'anthropic',
        baseURL: 'https://example.test',
        apiKey: 'sk-file-test',
        model: 'claude-test',
        timeout: 5_000,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    process.env.STEMOTION_CLAUDE_MAIN_API_KEY = 'sk-env-test';
    clearProfilesCache();

    globalThis.fetch = (async (_url, init) => {
      providerSignal = init?.signal as AbortSignal | undefined;
      providerApiKey = new Headers(init?.headers).get('x-api-key');
      return new Promise<Response>((_resolve, reject) => {
        providerSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }) as typeof fetch;

    const pending = generateWithConfiguredModel({
      messages: [{ role: 'user', content: 'test abort propagation' }],
      requestPreset: 'reviewer',
      signal: controller.signal,
    });

    await delay(10);
    controller.abort();

    await assert.rejects(
      Promise.race([
        pending,
        delay(250).then(() => {
          throw new Error('external signal was not forwarded to provider fetch');
        }),
      ]),
      /已取消|超时|Abort|aborted/i,
    );
    assert.equal(providerSignal?.aborted, true);
    assert.equal(providerApiKey, 'sk-env-test');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousProfilePath === undefined) {
      delete process.env.STEMOTION_MODEL_PROFILES_PATH;
    } else {
      process.env.STEMOTION_MODEL_PROFILES_PATH = previousProfilePath;
    }
    if (previousClaudeKey === undefined) {
      delete process.env.STEMOTION_CLAUDE_MAIN_API_KEY;
    } else {
      process.env.STEMOTION_CLAUDE_MAIN_API_KEY = previousClaudeKey;
    }
    clearProfilesCache();
    await rm(dir, { recursive: true, force: true });
  }
});
