import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  deleteModelProfile,
  fetchRemoteModels,
  readModelProfilesFile,
  resolveModelProfileForRole,
  setActiveModelProfile,
  toPublicProfiles,
  upsertModelProfile,
  type ModelProfilesFile,
} from '../src/lib/generation/modelProfiles';

async function withProfilesFile(data: ModelProfilesFile, fn: (filePath: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-profiles-'));
  const filePath = join(dir, 'model-profiles.json');
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fn(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('model profile summaries never expose raw API keys', async () => {
  await withProfilesFile(
    {
      activeProfile: 'openai-main',
      profiles: {
        'openai-main': {
          label: 'OpenAI Main',
          provider: 'openai',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'sk-test-secret-123456',
          model: 'gpt-4.1',
        },
      },
    },
    async (filePath) => {
      const data = await readModelProfilesFile(filePath);
      const summary = toPublicProfiles(data);

      assert.equal(summary.activeProfile, 'openai-main');
      assert.equal(summary.profiles[0].hasApiKey, true);
      assert.equal(summary.profiles[0].apiKeyPreview, 'sk-t...3456');
      assert.equal(JSON.stringify(summary).includes('sk-test-secret-123456'), false);
    },
  );
});

test('upserting an existing profile preserves API key when form key is empty', async () => {
  await withProfilesFile(
    {
      activeProfile: 'claude-main',
      profiles: {
        'claude-main': {
          label: 'Claude Main',
          provider: 'anthropic',
          baseURL: 'https://api.anthropic.com',
          apiKey: 'sk-ant-secret',
          model: 'claude-opus-4-1',
        },
      },
    },
    async (filePath) => {
      await upsertModelProfile(
        {
          id: 'claude-main',
          label: 'Claude Updated',
          provider: 'anthropic',
          baseURL: 'https://api.anthropic.com/',
          apiKey: '',
          model: 'claude-sonnet-4-5',
          timeout: 123000,
        },
        { filePath },
      );

      const raw = JSON.parse(await readFile(filePath, 'utf-8')) as ModelProfilesFile;
      assert.equal(raw.profiles['claude-main'].apiKey, 'sk-ant-secret');
      assert.equal(raw.profiles['claude-main'].model, 'claude-sonnet-4-5');
      assert.equal(raw.profiles['claude-main'].baseURL, 'https://api.anthropic.com');
      assert.equal(raw.profiles['claude-main'].timeout, 123000);
    },
  );
});

test('environment API key overrides are used for reads without being written back', async () => {
  const previous = process.env.STEMOTION_CLAUDE_MAIN_API_KEY;
  try {
    process.env.STEMOTION_CLAUDE_MAIN_API_KEY = 'sk-env-secret';

    await withProfilesFile(
      {
        activeProfile: 'claude-main',
        profiles: {
          'claude-main': {
            label: 'Claude Main',
            provider: 'anthropic',
            baseURL: 'https://api.anthropic.com',
            apiKey: 'sk-file-secret',
            model: 'claude-opus-4-1',
          },
          fallback: {
            label: 'Fallback',
            provider: 'openai',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-fallback',
            model: 'gpt-4.1',
          },
        },
      },
      async (filePath) => {
        const resolved = await readModelProfilesFile(filePath);
        assert.equal(resolved?.profiles['claude-main'].apiKey, 'sk-env-secret');

        await upsertModelProfile(
          {
            id: 'claude-main',
            label: 'Claude Updated',
            provider: 'anthropic',
            baseURL: 'https://api.anthropic.com',
            apiKey: '',
            model: 'claude-sonnet-4-5',
          },
          { filePath },
        );
        await setActiveModelProfile('fallback', filePath);
        await deleteModelProfile('fallback', filePath);

        const raw = JSON.parse(await readFile(filePath, 'utf-8')) as ModelProfilesFile;
        assert.equal(raw.profiles['claude-main'].apiKey, 'sk-file-secret');
        assert.equal(raw.profiles['claude-main'].model, 'claude-sonnet-4-5');
        assert.equal(JSON.stringify(raw).includes('sk-env-secret'), false);
      },
    );
  } finally {
    if (previous === undefined) {
      delete process.env.STEMOTION_CLAUDE_MAIN_API_KEY;
    } else {
      process.env.STEMOTION_CLAUDE_MAIN_API_KEY = previous;
    }
  }
});

test('role-based LLM profile routing uses artifact and reviewer overrides with active fallback', () => {
  const previousArtifact = process.env.STEMOTION_LLM_PROFILE_ARTIFACT;
  const previousReviewer = process.env.STEMOTION_LLM_PROFILE_REVIEWER;
  const previousDeepseekKey = process.env.STEMOTION_DEEPSEEK_FAST_API_KEY;
  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-mimo',
        model: 'mimo-v2.5-pro',
      },
      'deepseek-fast': {
        label: 'DeepSeek Fast',
        provider: 'openai',
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'sk-file-deepseek',
        model: 'deepseek-chat',
      },
      'claude-reviewer': {
        label: 'Claude Reviewer',
        provider: 'anthropic',
        baseURL: 'https://api.anthropic.com',
        apiKey: 'sk-claude',
        model: 'claude-sonnet-4-5',
      },
    },
  };

  try {
    process.env.STEMOTION_LLM_PROFILE_ARTIFACT = 'deepseek-fast';
    process.env.STEMOTION_LLM_PROFILE_REVIEWER = 'claude-reviewer';
    process.env.STEMOTION_DEEPSEEK_FAST_API_KEY = 'sk-env-deepseek';

    const answer = resolveModelProfileForRole(profiles, 'answer');
    const artifact = resolveModelProfileForRole(profiles, 'artifact');
    const reviewer = resolveModelProfileForRole(profiles, 'reviewer');

    assert.equal(answer?.id, 'mimo-main');
    assert.equal(answer?.role, 'answer');
    assert.equal(answer?.usedOverride, false);
    assert.equal(artifact?.id, 'deepseek-fast');
    assert.equal(artifact?.role, 'artifact');
    assert.equal(artifact?.usedOverride, true);
    assert.equal(artifact?.profile.apiKey, 'sk-env-deepseek');
    assert.equal(reviewer?.id, 'claude-reviewer');
    assert.equal(reviewer?.role, 'reviewer');
    assert.equal(reviewer?.usedOverride, true);
  } finally {
    if (previousArtifact === undefined) {
      delete process.env.STEMOTION_LLM_PROFILE_ARTIFACT;
    } else {
      process.env.STEMOTION_LLM_PROFILE_ARTIFACT = previousArtifact;
    }
    if (previousReviewer === undefined) {
      delete process.env.STEMOTION_LLM_PROFILE_REVIEWER;
    } else {
      process.env.STEMOTION_LLM_PROFILE_REVIEWER = previousReviewer;
    }
    if (previousDeepseekKey === undefined) {
      delete process.env.STEMOTION_DEEPSEEK_FAST_API_KEY;
    } else {
      process.env.STEMOTION_DEEPSEEK_FAST_API_KEY = previousDeepseekKey;
    }
  }
});

test('active profile switching and deletion handle edge cases', async () => {
  await withProfilesFile(
    {
      activeProfile: 'a',
      profiles: {
        a: { label: 'A', provider: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-a', model: 'gpt-a' },
        b: { label: 'B', provider: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-b', model: 'gpt-b' },
      },
    },
    async (filePath) => {
      const switched = await setActiveModelProfile('b', filePath);
      assert.equal(switched.activeProfile, 'b');

      const deleted = await deleteModelProfile('b', filePath);
      assert.equal(deleted.activeProfile, 'a');
      assert.deepEqual(Object.keys(deleted.profiles), ['a']);

      await assert.rejects(() => deleteModelProfile('a', filePath), /only model profile/);
    },
  );
});

test('fetchRemoteModels uses OpenAI and Claude model list protocols', async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ data: [{ id: calls.length === 1 ? 'gpt-4.1' : 'claude-opus-4-1', display_name: 'Model Label' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const openaiModels = await fetchRemoteModels(
    { provider: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-openai' },
    fetcher,
  );
  const claudeModels = await fetchRemoteModels(
    { provider: 'anthropic', baseURL: 'https://api.anthropic.com', apiKey: 'sk-claude' },
    fetcher,
  );

  assert.equal(openaiModels[0].id, 'gpt-4.1');
  assert.equal(claudeModels[0].id, 'claude-opus-4-1');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(calls[0].headers.get('authorization'), 'Bearer sk-openai');
  assert.equal(calls[1].url, 'https://api.anthropic.com/v1/models');
  assert.equal(calls[1].headers.get('x-api-key'), 'sk-claude');
  assert.equal(calls[1].headers.get('anthropic-version'), '2023-06-01');
});

test('fetchRemoteModels does not include provider response bodies in thrown errors', async () => {
  const fetcher: typeof fetch = async () => new Response('sk-provider-secret raw upstream body', {
    status: 502,
    statusText: 'Bad Gateway',
  });

  await assert.rejects(
    () => fetchRemoteModels(
      { provider: 'anthropic', baseURL: 'https://api.anthropic.com', apiKey: 'sk-request-secret' },
      fetcher,
    ),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /获取模型列表失败 \(502\)/);
      assert.equal(error.message.includes('sk-provider-secret'), false);
      assert.equal(error.message.includes('raw upstream body'), false);
      return true;
    },
  );
});
