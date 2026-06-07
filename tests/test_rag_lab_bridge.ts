import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAG_TO_LAB_PREFILL_KEY,
  RAG_TO_LAB_ROUTE,
  buildLabPromptFromRagResult,
} from '../src/features/rag-lab-bridge/buildLabPrompt';

const root = process.cwd();

test('RAG-to-Lab prompt helper builds student guidance without fake sources', () => {
  const prompt = buildLabPromptFromRagResult({
    mode: 'student',
    subject: 'physics_mechanics',
    subjectDisplayName: '大学物理力学',
    question: '抛体运动为什么水平和竖直方向可以分解？',
    answer: '抛体运动可以将初速度分解到水平和竖直方向，分别观察匀速直线运动和竖直方向匀变速运动。',
    citations: [],
  });

  assert.match(prompt, /抛体运动/);
  assert.match(prompt, /帮助学生理解/);
  assert.match(prompt, /观察规律/);
  assert.match(prompt, /纠正常见误解/);
  assert.match(prompt, /可调参数/);
  assert.match(prompt, /观察量/);
  assert.match(prompt, /教学目标/);
  assert.match(prompt, /建议交互方式/);
  assert.match(prompt, /来源：基于当前 RAG 回答摘要，未附加引用明细/);
  assert.doesNotMatch(prompt, /\[(?:L|W)\d+\]/);
  assert.doesNotMatch(prompt, /citation_|source_/);
});

test('RAG-to-Lab prompt helper builds teacher guidance from provided citations', () => {
  const prompt = buildLabPromptFromRagResult({
    mode: 'teacher',
    subject: 'physics_mechanics',
    subjectDisplayName: '大学物理力学',
    question: '如何课堂演示牛顿第二定律中合力与加速度的关系？',
    answer: '通过改变小车质量与拉力，可以观察加速度随合力增大而增大。',
    citations: [
      {
        source_type: 'local',
        source: 'newton_second_law.md',
        file_name: 'newton_second_law.md',
        chunk_id: 'physics_mechanics_newton_001',
        subject: 'physics_mechanics',
      },
      {
        source_type: 'web',
        title: 'Force and acceleration classroom demo',
        url: 'https://example.edu/force-demo',
        snippet: 'A short classroom setup for force and acceleration.',
      },
    ],
  });

  assert.match(prompt, /课堂演示/);
  assert.match(prompt, /教学目标/);
  assert.match(prompt, /互动问题/);
  assert.match(prompt, /板书或练习衔接/);
  assert.match(prompt, /newton_second_law\.md/);
  assert.match(prompt, /Force and acceleration classroom demo/);
  assert.doesNotMatch(prompt, /未附加引用明细/);
});

test('RAG and Lab UI are wired through local prefill state only', async () => {
  const ragSource = await readFile(join(root, 'src/features/rag/ui/SubjectRagConsole.tsx'), 'utf-8');
  const labPanelSource = await readFile(join(root, 'src/components/deep-interaction/DeepInteractionRightPanel.tsx'), 'utf-8');

  assert.equal(RAG_TO_LAB_PREFILL_KEY, 'stemotion.ragLabBridge.prefillPrompt');
  assert.equal(RAG_TO_LAB_ROUTE, '/lab?from=rag-bridge');

  assert.match(ragSource, /buildLabPromptFromRagResult/);
  assert.match(ragSource, /RAG_TO_LAB_PREFILL_KEY/);
  assert.match(ragSource, /sessionStorage\.setItem/);
  assert.match(ragSource, /RAG_TO_LAB_ROUTE/);
  assert.match(ragSource, /router\.push/);
  assert.match(ragSource, /生成交互实验/);
  assert.match(ragSource, /canBridgeToLab/);

  assert.match(labPanelSource, /RAG_TO_LAB_PREFILL_KEY/);
  assert.match(labPanelSource, /sessionStorage\.getItem/);
  assert.match(labPanelSource, /已从 RAG 回答带入实验 prompt，请确认后再生成 Guided Plan/);
  assert.doesNotMatch(labPanelSource, /sessionStorage\.getItem[\s\S]{0,1000}onGenerate\(/);
  assert.doesNotMatch(labPanelSource, /sessionStorage\.getItem[\s\S]{0,1000}fetch\(['"]\/api\/v1\/deep-interaction/);
});
