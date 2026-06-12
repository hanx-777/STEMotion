import assert from 'node:assert/strict';
import test from 'node:test';
import { askRag } from '../src/features/rag/lib/rag_pipeline';
import type { LlmGenerateOptions } from '../src/lib/generation/llmClient';

function createAnswerGenerator(state: { calls: number; prompts: string[] }, answer = '模型生成的结构化回答。') {
  return async (options: LlmGenerateOptions) => {
    state.calls += 1;
    state.prompts.push(options.messages.map((message) => message.content).join('\n'));
    return answer;
  };
}

test('RAG retrieval is isolated by subject and still uses the answer generator', async () => {
  const state = { calls: 0, prompts: [] as string[] };
  const result = await askRag(
    {
      question: '斜抛运动最大高度公式是什么',
      subject: 'physics_mechanics',
      use_web_search: false,
    },
    { answerGenerator: createAnswerGenerator(state) },
  );

  assert.equal(state.calls, 1);
  assert.equal(result.subject, 'physics_mechanics');
  assert.equal(result.task_type, 'step_solution');
  assert.ok(result.answer.includes('模型生成的结构化回答'));
  assert.ok(result.answer_sections?.some((section) => section.title === '分步推导'));
  assert.equal(result.visualization_hint?.type, 'projectile_motion');
  assert.ok(result.retrieved_chunks.length > 0);
  assert.ok(result.retrieved_chunks.every((chunk) => chunk.metadata.subject === 'physics_mechanics'));
  assert.ok(result.citations.every((citation) => citation.source_type !== 'local' || citation.subject === 'physics_mechanics'));
  assert.ok(result.quality_report);
  assert.ok(result.quality_report.checks.some((check) => check.name === '引用一致性'));
  assert.ok(state.prompts[0].includes('[L1]'));
});

test('RAG asks the model even when no reliable sources are found', async () => {
  const state = { calls: 0, prompts: [] as string[] };
  const result = await askRag(
    {
      question: 'zzzzzz qqqqqq unrelated-token-54321',
      subject: 'physics_mechanics',
      use_web_search: false,
    },
    { answerGenerator: createAnswerGenerator(state, '这是基于通用知识的模型回答。') },
  );

  assert.equal(state.calls, 1);
  assert.equal(result.citations.length, 0);
  assert.equal(result.retrieved_chunks.length, 0);
  assert.ok(result.answer.includes('当前知识库和网络检索中未找到可靠依据'));
  assert.ok(result.answer.includes('这是基于通用知识的模型回答。'));
  assert.equal(result.quality_report?.checks.find((check) => check.name === '依据不足提示')?.passed, true);
  assert.ok(state.prompts[0].includes('不得编造引用'));
});

test('RAG model failures are reported instead of using extractive fallback', async () => {
  await assert.rejects(
    () => askRag(
      {
        question: '斜抛运动最大高度公式是什么',
        subject: 'physics_mechanics',
        use_web_search: false,
      },
      {
        answerGenerator: async () => {
          throw new Error('mock model unavailable');
        },
      },
    ),
    /模型回答生成失败.*mock model unavailable/,
  );
});

test('RAG uses visualization orchestrator to produce artifact-ready specs', async () => {
  const state = { calls: 0, prompts: [] as string[] };
  const result = await askRag(
    {
      question: '用单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      subject: 'computer_science',
      use_web_search: false,
    },
    {
      answerGenerator: createAnswerGenerator(state, '单调栈保存还没有找到右侧更大值的下标。'),
      multiAgentMode: 'off',
    },
  );

  assert.equal(result.visualization_spec?.type, 'algorithm_trace');
  if (result.visualization_spec?.type === 'algorithm_trace') {
    assert.equal(result.visualization_spec.inputExample, '[2,1,2,4,3]');
    assert.ok(result.visualization_spec.steps.length > 5);
    assert.ok(result.visualization_spec.steps.some((step) => step.operation.includes('弹出')));
  }
});
