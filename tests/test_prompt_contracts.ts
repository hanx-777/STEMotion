import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadWidgetSystemPrompt, loadWidgetUserPrompt } from '../src/lib/deep-interaction/prompts/loader';
import {
  ARTIFACT_DESIGN_CONTRACT_MARKER,
  artifactDesignContractPrompt,
} from '../src/lib/generation/artifactDesignContract';
import {
  DESIGN_REVIEW_RUBRIC_MARKER,
  designRepairPrompt,
  designReviewRubricPrompt,
  followUpDesignProtectionPrompt,
} from '../src/lib/deep-interaction/agents/designReviewRubric';
import { widgetSystemPrompt } from '../src/lib/generation/promptTemplates';
import {
  HTML_GENERATION_SYSTEM_PROMPT,
  buildHtmlGenerationPrompt,
} from '../src/lib/rag/visualization/htmlGenerator';
import {
  RAG_WIDGET_HTML_SYSTEM_PROMPT,
  buildRagWidgetHtmlPrompt,
} from '../src/lib/rag/visualization/auditPipeline';
import { buildWidgetRefineSystemPrompt } from '../src/lib/deep-interaction/followUpHandler.server';

const ROOT = process.cwd();
const SUBJECTS = ['advanced_math', 'chemistry', 'computer_science', 'physics_mechanics'];
const FORBIDDEN_SOURCE_TEXT = new RegExp([
  ['Claude', 'Design'].join(' '),
  ['artifact', '_tool'].join(''),
  ['str_replace', '_editor'].join(''),
  ['Computer', 'Use'].join(' '),
  'window\\.claude',
  'done\\(',
  'questions_v2',
  'copy_starter_component',
  'fork_verifier_agent',
].join('|'), 'i');

function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function assertHasArtifactDesignContract(source: string, label: string): void {
  assert.match(source, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER), `${label} should include the shared design contract marker`);
  assert.match(source, /first screen|above the fold/i, `${label} should protect first-screen usability`);
  assert.match(source, /65%-75%/, `${label} should protect main-stage ratio`);
  assert.match(source, /responsive/i, `${label} should require responsive fallback`);
  assert.match(source, /nested scroll/i, `${label} should control nested scrolling`);
  assert.match(source, /44px|hit targets/i, `${label} should protect control hit targets`);
  assert.match(source, /visual hierarchy/i, `${label} should require visual hierarchy`);
  assert.match(source, /Anti-filler|generic hero/i, `${label} should prevent filler visuals`);
  assert.match(source, /stable ids\/data-role|data-role/i, `${label} should preserve stable ids/data-role context`);
  assert.doesNotMatch(source, FORBIDDEN_SOURCE_TEXT, `${label} must not copy forbidden source text`);
}

function assertHasDesignReviewRubric(source: string, label: string): void {
  assert.match(source, new RegExp(DESIGN_REVIEW_RUBRIC_MARKER), `${label} should include the shared design-review marker`);
  assert.match(source, /first[-\s]?screen|首屏/i, `${label} should review first-screen usability`);
  assert.match(source, /65%-75%/, `${label} should review main-stage ratio`);
  assert.match(source, /responsive|375px|移动端/i, `${label} should review responsive behavior`);
  assert.match(source, /nested scroll|嵌套滚动/i, `${label} should review nested scrolling`);
  assert.match(source, /visual hierarchy|视觉层级/i, `${label} should review visual hierarchy`);
  assert.match(source, /44px|hit targets|命中区域/i, `${label} should review control hit targets`);
  assert.match(source, /filler|generic hero|AI 味/i, `${label} should reject filler content`);
  assert.match(source, /location|selector|位置|target=.*html/i, `${label} should require issue location or selector`);
  assert.match(source, /impact|priority|优先级|severity/i, `${label} should require impact and priority`);
  assert.match(source, /concrete|具体|Fix:/i, `${label} should require concrete fixes`);
  assert.doesNotMatch(source, FORBIDDEN_SOURCE_TEXT, `${label} should not include source tool protocol text`);
}

test('subject RAG prompts share citation, evidence, and disclaimer boundaries', () => {
  for (const subject of SUBJECTS) {
    const systemPrompt = readProjectFile(`skills/${subject}/system_prompt.md`);
    const answerTemplate = readProjectFile(`skills/${subject}/answer_template.md`);
    const combined = `${systemPrompt}\n${answerTemplate}`;

    assert.match(combined, /本地知识库/);
    assert.match(combined, /网络检索/);
    assert.match(combined, /本地知识库来源/);
    assert.match(combined, /网络检索来源/);
    assert.match(combined, /当前知识库和网络检索中未找到可靠依据/);
    assert.match(combined, /AI 生成内容，仅供学习参考/);
    assert.doesNotMatch(combined, /尽量附来源编号/);
  }
});

test('deep interaction prompt files keep required widget runtime contract', () => {
  const types = ['simulation', 'game', 'mind_map', '3d_visualization', 'rag_visualization'] as const;

  for (const type of types) {
    const systemPrompt = loadWidgetSystemPrompt(type);
    const userPrompt = loadWidgetUserPrompt(type);
    const combined = `${systemPrompt}\n${userPrompt}`;

    assert.match(combined, /widget-config/);
    assert.match(combined, /SET_WIDGET_STATE/);
    assert.match(combined, /HIGHLIGHT_ELEMENT/);
    assert.match(combined, /ANNOTATE_ELEMENT/);
    assert.match(combined, /REVEAL_ELEMENT/);
    assert.match(combined, /requestAnimationFrame/);
    assert.match(combined, /Return ONLY|只返回/);
  }
});

test('artifact and reviewer prompts require compact first-screen layout review', () => {
  const widgetTypes = ['simulation', 'game', 'mind_map', '3d_visualization', 'rag_visualization'] as const;

  for (const type of widgetTypes) {
    const systemPrompt = loadWidgetSystemPrompt(type);
    assert.match(systemPrompt, /1366x768/);
    assert.match(systemPrompt, /1440x900/);
    assert.match(systemPrompt, /首屏|first screen/i);
    assert.match(systemPrompt, /65%-75%/);
    assert.match(systemPrompt, /nested scroll|嵌套滚动/i);
  }

  const uxEvaluatorSource = readProjectFile('src/lib/deep-interaction/agents/uxEvaluatorAgent.ts');
  assert.match(uxEvaluatorSource, /1366x768/);
  assert.match(uxEvaluatorSource, /1440x900/);
  assert.match(uxEvaluatorSource, /draggable splitter|可拖动分隔栏/i);
  assert.match(uxEvaluatorSource, /具体修改建议/);
});

test('reviewer-specific design rubric requires specific actionable design fixes', () => {
  assertHasDesignReviewRubric(designReviewRubricPrompt(), 'design review rubric prompt');
  assertHasDesignReviewRubric(designRepairPrompt(), 'design repair prompt');
  assertHasDesignReviewRubric(followUpDesignProtectionPrompt(), 'follow-up design protection prompt');

  const uxEvaluatorSource = readProjectFile('src/lib/deep-interaction/agents/uxEvaluatorAgent.ts');
  const judgeSource = readProjectFile('src/lib/deep-interaction/agents/judgeAgent.ts');
  const repairSource = readProjectFile('src/lib/deep-interaction/agents/repairAgent.ts');
  const followUpPrompt = buildWidgetRefineSystemPrompt({
    title: 'Projectile motion',
    concept: 'projectile motion',
  });

  assert.match(uxEvaluatorSource, /designReviewRubricPrompt/);
  assert.match(judgeSource, /collectDesignQualityBlockers/);
  assert.match(judgeSource, /buildDesignRepairInstruction/);
  assert.match(repairSource, /designRepairPrompt/);
  assertHasDesignReviewRubric(followUpPrompt, 'follow-up system prompt');
});

test('shared artifact design contract covers key prompt principles without Claude-specific source text', () => {
  const contract = artifactDesignContractPrompt();

  assertHasArtifactDesignContract(contract, 'shared artifact design contract');
  assert.match(contract, /output-shape awareness/i);
  assert.match(contract, /Design-context reuse/i);
  assert.match(contract, /Splitter optionality/i);
  assert.match(contract, /Accessibility basics/i);
  assert.doesNotMatch(contract, FORBIDDEN_SOURCE_TEXT);
});

test('artifact generation prompt paths reuse the shared design contract', () => {
  const legacyWidgetPrompt = widgetSystemPrompt({
    id: 'projectile-widget',
    title: 'Projectile motion',
    subject: 'physics',
    gradeLevel: 'middle_school',
    concept: 'projectile motion',
    description: 'Show trajectory and key metrics.',
    learningGoals: ['Relate velocity components to trajectory.'],
    variables: [{ name: 'angle', label: 'Angle', min: 0, max: 90, default: 35, step: 1, unit: 'deg' }],
    animationIntent: 'Animate projectile trajectory.',
    formulae: [{ id: 'range', title: 'Range', latex: 'R = v^2 sin(2theta) / g' }],
    quiz: {
      question: 'What changes range?',
      options: ['angle', 'color'],
      correctAnswer: 'angle',
      explanation: 'Range depends on launch angle.',
    },
    safetyNotes: ['classroom safe'],
    messageTargets: [{ id: '#visualization', purpose: 'main stage' }],
  });
  const lightweightSystemPrompt = HTML_GENERATION_SYSTEM_PROMPT;
  const lightweightUserPrompt = buildHtmlGenerationPrompt({
    question: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    answerText: '射程和最大高度由初速度、角度、重力加速度共同决定。',
    visualizationType: 'projectile_motion',
    extractedParameters: { v0: 8, angle: 35, g: 9.8 },
  });
  const auditSystemPrompt = RAG_WIDGET_HTML_SYSTEM_PROMPT;
  const auditUserPrompt = buildRagWidgetHtmlPrompt({
    question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '用栈保存待解决下标。',
    plan: {
      shouldGenerate: true,
      problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      knowledgePoint: '单调栈',
      variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
      visualObjects: ['数组条形图', '栈容器', '输出数组'],
      controls: ['start', 'reset'],
      metrics: ['当前下标', '输出数组'],
      animationRequirements: ['逐步读取元素', '弹出时高亮'],
      successCriteria: ['展示弹出条件'],
      rightPanelNarration: [],
      recommendedType: 'interactive_html',
      confidence: 0.9,
    },
  });
  const followUpPrompt = buildWidgetRefineSystemPrompt({
    title: 'Projectile motion',
    concept: 'projectile motion',
  });

  for (const [label, prompt] of [
    ['legacy widget generation prompt', legacyWidgetPrompt],
    ['RAG lightweight system prompt', lightweightSystemPrompt],
    ['RAG lightweight user prompt', lightweightUserPrompt],
    ['RAG audit system prompt', auditSystemPrompt],
    ['RAG audit user prompt', auditUserPrompt],
    ['Deep Interaction follow-up prompt', followUpPrompt],
  ] as const) {
    assertHasArtifactDesignContract(prompt, label);
    assert.doesNotMatch(prompt, FORBIDDEN_SOURCE_TEXT, `${label} should not include external tool protocol`);
  }
});

test('deep interaction pipeline composes shared design contract without rewriting markdown prompts', () => {
  const pipelineSource = readProjectFile('src/lib/deep-interaction/agentWidgetPipeline.ts');

  assert.match(pipelineSource, /artifactDesignContractPrompt/);
  assert.match(pipelineSource, /widgetPromptForType/);
  assert.match(pipelineSource, /repairWidgetHtml/);
});
