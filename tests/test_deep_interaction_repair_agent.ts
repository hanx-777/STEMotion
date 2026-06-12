import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { repairArtifact } from '../src/features/deep-interaction/lib/agents/repairAgent';
import type { RepairContext } from '../src/features/deep-interaction/lib/agents/repairAgent';
import { clearProfilesCache } from '../src/lib/generation/llmClient';
import type { ModelProfilesFile } from '../src/lib/generation/modelProfiles';

interface CapturedAnthropicBody {
  max_tokens?: number;
  temperature?: number;
  thinking?: unknown;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
}

test('active-interaction-only HTML repair uses a targeted prompt without full design audit context', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-active-repair-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousThinkingMode = process.env.STEMOTION_LLM_THINKING;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const captured: { body?: CapturedAnthropicBody } = {};

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
    console.log = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
    globalThis.fetch = (async (_input, init) => {
      captured.body = JSON.parse(String(init?.body ?? '{}')) as CapturedAnthropicBody;
      return new Response([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":20}}}',
        '',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"<!doctype html><html><body><main id=\\"visualization\\">fixed</main><section id=\\"metrics\\">changed</section><script>window.parent.postMessage({type:\\"WIDGET_READY\\"},\\"*\\");</script></body></html>"}}',
        '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":30}}',
        '',
        '',
      ].join('\n'));
    }) as typeof fetch;

    const result = await repairArtifact(activeInteractionOnlyContext());

    assert.match(result.revisedHtml ?? '', /fixed/);
    assertCapturedBody(captured.body);
    const capturedBody = captured.body;
    assert.equal(capturedBody.max_tokens, 32768);
    assert.equal(capturedBody.temperature, 0.1);
    assert.equal(capturedBody.thinking, undefined);

    const system = String(capturedBody.system ?? '');
    const messages = capturedBody.messages ?? [];
    const userPrompt = messages[0]?.content ?? '';

    assert.match(system, /HtmlRepairAgent/);
    assert.match(`${system}\n${userPrompt}`, /start\/reset\/slider|主动交互/);
    assert.doesNotMatch(system, /first-screen|65%-75%|nested scrolling|Design-quality/i);
    assert.doesNotMatch(userPrompt, /Design-quality 修复约束|LearningBlueprint 修复锚点|Subject Schema 校验摘要/i);
    assert.ok(system.length < 2200, `targeted system prompt should stay compact, got ${system.length} chars`);
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

function activeInteractionOnlyContext(): RepairContext {
  return {
    html: '<!doctype html><html><body><main id="visualization">static</main><button id="start-btn">开始</button><button id="reset-btn">重置</button><input id="angle" type="range"></body></html>',
    actions: [{ id: 'intro', type: 'speech', text: '观察发射角变化。' }],
    plan: {
      title: '斜抛运动',
      concept: 'projectile motion',
      description: '调节角度观察最大高度。',
      interactionType: 'rag_visualization',
      subject: 'physics',
      gradeLevel: 'high_school',
      learningGoals: ['理解竖直分速度影响最大高度'],
      variables: [{ name: 'angle', label: '发射角' }],
      widgetOutline: {},
    },
    decision: {
      type: 'repair',
      finalScore: 72,
      blockingIssues: [],
      repairInstruction: '主动交互验收未通过：必须修复 start/reset/slider 的真实状态机和可见反馈。',
      target: 'html',
      reason: '主动交互评估未通过。',
    },
    issues: [{
      id: 'active_interaction_1',
      severity: 'critical',
      category: 'runtime',
      message: '主动交互验收未通过：按钮或滑块没有产生可见变化。',
      evidence: 'start button produced no mutation; range slider produced no mutation.',
      suggestion: '修复 HTML：为 start/reset/slider 补齐真实状态机，使 #visualization 或 #metrics 在每次操作后发生可见变化。',
      target: 'html',
    }],
    activeInteractionDiagnostic: {
      passed: false,
      actionsTested: ['start found but no visible mutation', 'reset found but no visible mutation', 'range:angle found but no visible mutation'],
      visibleMutations: [],
      warnings: [],
      failureReason: 'Controls did not mutate #visualization or #metrics.',
      elapsedMs: 900,
    },
  };
}

function assertCapturedBody(body: CapturedAnthropicBody | undefined): asserts body is CapturedAnthropicBody {
  assert.ok(body, 'expected repair request body to be captured');
}
