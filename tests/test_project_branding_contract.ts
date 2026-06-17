import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const productName = '学科智引：基于RAG的垂类大模型助学助教平台';
const productSummary = '本作品面向高校课程教学场景，构建基于学科Skill、课程知识库与RAG检索增强的垂类大模型助学助教平台。系统支持可信问答、引用追溯、分步讲解、错因诊断、教师备课与交互式教学资源生成，形成面向学生学习与教师教学的智能应用闭环。';
const retiredPublicNamePattern = new RegExp(['STEMotion', 'Physics Skill'].join(' '));
const retiredMotionTokenPattern = new RegExp(`\\b${['stemotion', 'Motion'].join('')}\\b`);

test('public documentation uses the normalized product name and summary', async () => {
  const readme = await readProjectFile('README.md');
  const mapping = await readProjectFile('docs/xh202620_mapping.md');
  const architecture = await readProjectFile('docs/system_architecture.md');
  const functionGuide = await readProjectFile('docs/system_function_guide.md');

  assert.match(readme, new RegExp(`^# 作品名称：\\s*${escapeRegExp(productName)}`, 'm'));
  assert.match(readme, new RegExp(escapeRegExp(productSummary)));

  for (const [path, source] of [
    ['README.md', readme],
    ['docs/xh202620_mapping.md', mapping],
    ['docs/system_architecture.md', architecture],
    ['docs/system_function_guide.md', functionGuide],
  ] as const) {
    assert.match(source, new RegExp(escapeRegExp(productName)), `${path} should include the normalized product name`);
    assert.doesNotMatch(source, retiredPublicNamePattern, `${path} should not use the retired public product name`);
  }
});

test('safe internal motion tokens use a domain-neutral export name', async () => {
  const files = [
    'src/lib/animation/motionTokens.ts',
    'src/lib/animation/useGsapReveal.ts',
    'src/lib/animation/useGsapTimeline.ts',
    'src/components/layout/AppShell.tsx',
    'src/components/progress/RealisticProgressPanel.tsx',
    'src/components/deep-interaction/DeepInteractionShell.tsx',
    'src/components/deep-interaction/DeepInteractionStage.tsx',
    'src/components/visualization/AlgorithmTraceRenderer.tsx',
    'src/components/visualization/FunctionGraphRenderer.tsx',
    'src/components/visualization/ForceDiagramRenderer.tsx',
    'src/features/assets/ui/AssetsWorkbench.tsx',
    'src/features/rag/ui/SubjectRagConsole.tsx',
    'src/components/settings/ModelSettingsConsole.tsx',
  ];

  const tokenSource = await readProjectFile('src/lib/animation/motionTokens.ts');
  assert.match(tokenSource, /export const learningPlatformMotion/);

  for (const path of files) {
    const source = await readProjectFile(path);
    assert.doesNotMatch(source, retiredMotionTokenPattern, `${path} should use learningPlatformMotion`);
  }
});

test('user-facing application shell and metadata use the normalized public brand', async () => {
  const appShell = await readProjectFile('src/components/layout/AppShell.tsx');
  const layout = await readProjectFile('src/app/layout.tsx');

  assert.match(appShell, /学科智引/);
  assert.doesNotMatch(appShell, /STEMotion<\/span>|: 'STEMotion'/);
  assert.match(layout, /学科智引/);
});

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), 'utf-8');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
