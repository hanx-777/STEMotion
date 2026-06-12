import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluatePedagogy } from '../src/features/deep-interaction/lib/agents/pedagogyEvaluatorAgent';
import { evaluateUX } from '../src/features/deep-interaction/lib/agents/uxEvaluatorAgent';
import { resolveEvaluatorTimeoutMs } from '../src/features/deep-interaction/lib/agents/evaluatorFallback';
import { judgeEvaluations } from '../src/features/deep-interaction/lib/agents/judgeAgent';
import type { AgentEvaluation } from '../src/features/deep-interaction/lib/types';
import { clearProfilesCache } from '../src/lib/generation/llmClient';
import type { ModelProfilesFile } from '../src/lib/generation/modelProfiles';

test('evaluator default timeout is short enough for non-blocking background review', () => {
  assert.equal(resolveEvaluatorTimeoutMs(undefined), 45_000);
});

test('Pedagogy and UX evaluator timeouts return non-blocking warning fallbacks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stemotion-evaluator-fallback-'));
  const profilePath = join(dir, 'model-profiles.json');
  const previousProfilePath = process.env.STEMOTION_MODEL_PROFILES_PATH;
  const previousEvaluatorTimeout = process.env.STEMOTION_EVALUATOR_TIMEOUT_MS;
  const previousThinkingMode = process.env.STEMOTION_LLM_THINKING;
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  const profiles: ModelProfilesFile = {
    activeProfile: 'mimo-main',
    profiles: {
      'mimo-main': {
        label: 'MiMo Main',
        provider: 'anthropic',
        baseURL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiKey: 'sk-test',
        model: 'mimo-v2.5-pro',
        timeout: 10,
      },
    },
  };

  await writeFile(profilePath, JSON.stringify(profiles), 'utf-8');

  try {
    process.env.STEMOTION_MODEL_PROFILES_PATH = profilePath;
    process.env.STEMOTION_EVALUATOR_TIMEOUT_MS = '1';
    delete process.env.STEMOTION_LLM_THINKING;
    clearProfilesCache();
    console.log = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
    globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      const abort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
    })) as typeof fetch;

    const pedagogy = await evaluatePedagogy({
      prompt: '演示斜抛运动最大高度',
      title: '斜抛运动',
      concept: 'projectile motion',
      description: '学生调节初速度和角度观察最大高度。',
      subject: 'physics',
      gradeLevel: 'high_school',
      interactionType: 'rag_visualization',
      learningGoals: ['理解竖直分速度决定最大高度'],
      htmlPreview: '<html><body><main id="visualization"></main></body></html>',
      actionsSummary: '教师引导学生调节角度。',
    });
    const ux = await evaluateUX({
      html: '<html><body><main id="visualization"><button>开始</button><input type="range"></main></body></html>',
      title: '斜抛运动',
      concept: 'projectile motion',
      interactionType: 'rag_visualization',
      variables: [{ name: 'angle', label: '发射角' }],
    });

    assert.equal(pedagogy.passed, true);
    assert.equal(ux.passed, true);
    assert.ok(pedagogy.score >= 75);
    assert.ok(ux.score >= 75);
    assert.equal(pedagogy.issues[0]?.severity, 'warning');
    assert.equal(ux.issues[0]?.severity, 'warning');
    assert.match(pedagogy.summary, /fallback|降级|未能完成|超时|timeout/i);
    assert.match(ux.summary, /fallback|降级|未能完成|超时|timeout/i);

    const decision = judgeEvaluations([
      pedagogy,
      ux,
      passedEvaluation('Safety Evaluator'),
      passedEvaluation('Runtime Evaluator'),
      passedEvaluation('Active Interaction Evaluator'),
    ]);

    assert.notEqual(decision.type, 'repair');
    assert.equal(decision.blockingIssues.length, 0);
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
    if (previousEvaluatorTimeout === undefined) {
      delete process.env.STEMOTION_EVALUATOR_TIMEOUT_MS;
    } else {
      process.env.STEMOTION_EVALUATOR_TIMEOUT_MS = previousEvaluatorTimeout;
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

function passedEvaluation(agentName: string): AgentEvaluation {
  return {
    agentName,
    score: 95,
    passed: true,
    summary: `${agentName} passed`,
    issues: [],
  };
}
